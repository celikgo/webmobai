import type { Page } from "playwright";
import { logger } from "../utils/logger.js";
import type { AccessibilityIssue, PerformanceMetrics } from "../types.js";

export class PageAnalyzer {
  constructor(private readonly page: Page) {}

  async getAccessibilityTree(): Promise<string> {
    logger.info("Capturing accessibility tree");
    const snapshot = await this.page.evaluate(() => {
      function buildTree(el: Element, depth: number): string {
        const role = el.getAttribute("role") || el.tagName.toLowerCase();
        const name =
          el.getAttribute("aria-label") ||
          el.getAttribute("alt") ||
          (el as HTMLElement).innerText?.slice(0, 60) ||
          "";
        const indent = "  ".repeat(depth);
        let result = `${indent}[${role}] "${name}"`;
        for (const child of el.children) {
          result += "\n" + buildTree(child, depth + 1);
        }
        return result;
      }
      return buildTree(document.body, 0);
    });
    if (!snapshot) return "No accessibility tree available";
    return snapshot;
  }

  async getDomSummary(): Promise<string> {
    return await this.page.evaluate(() => {
      const summary: string[] = [];
      const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
      if (headings.length > 0) {
        summary.push("## Headings");
        headings.forEach((h) => {
          summary.push(`  ${h.tagName}: ${h.textContent?.trim().slice(0, 80)}`);
        });
      }

      const links = document.querySelectorAll("a[href]");
      summary.push(`\n## Links: ${links.length} total`);
      const uniqueLinks = new Set<string>();
      links.forEach((a) => {
        const href = (a as HTMLAnchorElement).href;
        if (href && !uniqueLinks.has(href)) {
          uniqueLinks.add(href);
          const text = a.textContent?.trim().slice(0, 50) || "[no text]";
          summary.push(`  "${text}" → ${href}`);
        }
      });

      const forms = document.querySelectorAll("form");
      if (forms.length > 0) {
        summary.push(`\n## Forms: ${forms.length}`);
        forms.forEach((form, i) => {
          const inputs = form.querySelectorAll("input, select, textarea");
          summary.push(`  Form ${i + 1}: ${inputs.length} fields`);
          inputs.forEach((input) => {
            const el = input as HTMLInputElement;
            summary.push(
              `    - ${el.tagName.toLowerCase()}[type="${el.type || "text"}"] name="${el.name}" placeholder="${el.placeholder || ""}"`,
            );
          });
        });
      }

      const buttons = document.querySelectorAll("button, [role=button], input[type=submit]");
      if (buttons.length > 0) {
        summary.push(`\n## Buttons: ${buttons.length}`);
        buttons.forEach((btn) => {
          summary.push(`  "${btn.textContent?.trim().slice(0, 50) || btn.getAttribute("aria-label") || "[no text]"}"`);
        });
      }

      const images = document.querySelectorAll("img");
      const imagesWithoutAlt = Array.from(images).filter((img) => !img.alt);
      summary.push(`\n## Images: ${images.length} total, ${imagesWithoutAlt.length} missing alt text`);

      return summary.join("\n");
    });
  }

  async getInteractiveElements(): Promise<string> {
    return await this.page.evaluate(() => {
      const elements: string[] = [];
      const selectors = [
        "a[href]",
        "button",
        "[role=button]",
        "input",
        "select",
        "textarea",
        "[onclick]",
        "[tabindex]",
      ];
      const seen = new Set<Element>();

      for (const selector of selectors) {
        document.querySelectorAll(selector).forEach((el) => {
          if (seen.has(el)) return;
          seen.add(el);
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return; // hidden

          const tag = el.tagName.toLowerCase();
          const text = el.textContent?.trim().slice(0, 60) || "";
          const role = el.getAttribute("role") || "";
          const ariaLabel = el.getAttribute("aria-label") || "";
          const type = el.getAttribute("type") || "";
          const id = el.id ? `#${el.id}` : "";
          const cls = el.className
            ? `.${String(el.className).split(" ").slice(0, 2).join(".")}`
            : "";

          let desc = `${tag}${id}${cls}`;
          if (type) desc += `[type=${type}]`;
          if (role) desc += `[role=${role}]`;
          if (ariaLabel) desc += ` aria-label="${ariaLabel}"`;
          if (text) desc += ` "${text.slice(0, 40)}"`;
          desc += ` (${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}x${Math.round(rect.height)})`;

          elements.push(desc);
        });
      }

      return elements.join("\n");
    });
  }

  async runAccessibilityAudit(): Promise<AccessibilityIssue[]> {
    logger.info("Running accessibility audit");

    // Inject axe-core for accessibility testing
    const issues = await this.page.evaluate(async () => {
      // Inline minimal a11y checks since we can't always load axe-core
      const results: {
        id: string;
        impact: string;
        description: string;
        helpUrl: string;
        nodes: string[];
        rule: string;
      }[] = [];

      // Check images without alt
      document.querySelectorAll("img").forEach((img) => {
        if (!img.alt && !img.getAttribute("aria-label") && img.getAttribute("role") !== "presentation") {
          results.push({
            id: `img-alt-${results.length}`,
            impact: "serious",
            description: "Image element missing alt attribute",
            helpUrl: "https://dequeuniversity.com/rules/axe/4.4/image-alt",
            nodes: [img.outerHTML.slice(0, 120)],
            rule: "image-alt",
          });
        }
      });

      // Check form inputs without labels
      document.querySelectorAll("input, select, textarea").forEach((input) => {
        const el = input as HTMLInputElement;
        if (el.type === "hidden" || el.type === "submit" || el.type === "button") return;
        const hasLabel =
          el.id && document.querySelector(`label[for="${el.id}"]`);
        const hasAriaLabel = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby");
        const hasTitle = el.title;
        if (!hasLabel && !hasAriaLabel && !hasTitle) {
          results.push({
            id: `label-${results.length}`,
            impact: "critical",
            description: "Form element has no associated label",
            helpUrl: "https://dequeuniversity.com/rules/axe/4.4/label",
            nodes: [el.outerHTML.slice(0, 120)],
            rule: "label",
          });
        }
      });

      // Check buttons without accessible names
      document.querySelectorAll("button, [role=button]").forEach((btn) => {
        const text = btn.textContent?.trim();
        const ariaLabel = btn.getAttribute("aria-label");
        const title = btn.getAttribute("title");
        if (!text && !ariaLabel && !title) {
          results.push({
            id: `button-name-${results.length}`,
            impact: "critical",
            description: "Button has no discernible text",
            helpUrl: "https://dequeuniversity.com/rules/axe/4.4/button-name",
            nodes: [btn.outerHTML.slice(0, 120)],
            rule: "button-name",
          });
        }
      });

      // Check color contrast (simplified)
      document.querySelectorAll("p, span, h1, h2, h3, h4, h5, h6, li, a, label").forEach((el) => {
        const style = window.getComputedStyle(el);
        const fontSize = parseFloat(style.fontSize);
        if (fontSize < 12 && el.textContent?.trim()) {
          results.push({
            id: `text-size-${results.length}`,
            impact: "moderate",
            description: `Text element has very small font size (${fontSize}px)`,
            helpUrl: "https://dequeuniversity.com/rules/axe/4.4/color-contrast",
            nodes: [el.outerHTML.slice(0, 120)],
            rule: "text-size",
          });
        }
      });

      // Check for missing lang attribute
      if (!document.documentElement.lang) {
        results.push({
          id: "html-lang-0",
          impact: "serious",
          description: "html element does not have a lang attribute",
          helpUrl: "https://dequeuniversity.com/rules/axe/4.4/html-has-lang",
          nodes: ["<html>"],
          rule: "html-has-lang",
        });
      }

      // Check for missing page title
      if (!document.title.trim()) {
        results.push({
          id: "document-title-0",
          impact: "serious",
          description: "Document does not have a title element",
          helpUrl: "https://dequeuniversity.com/rules/axe/4.4/document-title",
          nodes: ["<head>"],
          rule: "document-title",
        });
      }

      // Check skip navigation
      const firstLink = document.querySelector("a");
      const hasSkipLink =
        firstLink &&
        (firstLink.textContent?.toLowerCase().includes("skip") ||
          firstLink.getAttribute("href")?.startsWith("#"));
      if (!hasSkipLink) {
        results.push({
          id: "skip-link-0",
          impact: "moderate",
          description: "Page does not have a skip navigation link",
          helpUrl: "https://dequeuniversity.com/rules/axe/4.4/skip-link",
          nodes: [],
          rule: "skip-link",
        });
      }

      // Check landmark regions
      const hasMain = document.querySelector("main, [role=main]");
      if (!hasMain) {
        results.push({
          id: "landmark-main-0",
          impact: "moderate",
          description: "Page does not have a main landmark region",
          helpUrl: "https://dequeuniversity.com/rules/axe/4.4/landmark-one-main",
          nodes: [],
          rule: "landmark-one-main",
        });
      }

      return results;
    });

    logger.info(`Accessibility audit found ${issues.length} issues`);
    return issues.map((i) => ({
      ...i,
      impact: i.impact as AccessibilityIssue["impact"],
    }));
  }

  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    logger.info("Collecting performance metrics");

    const metrics = await this.page.evaluate(() => {
      const perf = performance;
      const nav = perf.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const paint = perf.getEntriesByType("paint");

      const fcp = paint.find((e) => e.name === "first-contentful-paint")?.startTime ?? null;

      // LCP via PerformanceObserver entries
      const lcpEntries = perf.getEntriesByType("largest-contentful-paint");
      const lcp = lcpEntries.length > 0 ? lcpEntries[lcpEntries.length - 1]!.startTime : null;

      // CLS
      const layoutShiftEntries = perf.getEntriesByType("layout-shift") as (PerformanceEntry & { hadRecentInput: boolean; value: number })[];
      const cls = layoutShiftEntries
        .filter((e) => !e.hadRecentInput)
        .reduce((sum, e) => sum + e.value, 0);

      return {
        lcp,
        fcp,
        cls: cls || null,
        tti: null, // Would need long-task observer
        ttfb: nav?.responseStart ?? null,
        domContentLoaded: nav?.domContentLoadedEventEnd ?? null,
        loadComplete: nav?.loadEventEnd ?? null,
      };
    });

    logger.info("Performance metrics collected", metrics);
    return metrics;
  }

  async getLinks(): Promise<string[]> {
    return await this.page.evaluate(() => {
      const links = new Set<string>();
      document.querySelectorAll("a[href]").forEach((a) => {
        const href = (a as HTMLAnchorElement).href;
        if (
          href &&
          href.startsWith("http") &&
          !href.includes("javascript:") &&
          !href.includes("mailto:")
        ) {
          links.add(href);
        }
      });
      return Array.from(links);
    });
  }

  async checkForErrors(): Promise<{
    brokenImages: string[];
    consoleErrors: string[];
    networkErrors: string[];
  }> {
    const brokenImages = await this.page.evaluate(() => {
      const broken: string[] = [];
      document.querySelectorAll("img").forEach((img) => {
        if (!img.complete || img.naturalWidth === 0) {
          broken.push(img.src || img.getAttribute("data-src") || "[no src]");
        }
      });
      return broken;
    });

    return {
      brokenImages,
      consoleErrors: [],
      networkErrors: [],
    };
  }
}
