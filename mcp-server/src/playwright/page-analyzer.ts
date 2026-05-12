import type { Page } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import { logger } from "../utils/logger.js";
import type { AccessibilityIssue, PerformanceMetrics } from "../types.js";
import type { BrowserManager } from "./browser-manager.js";

export class PageAnalyzer {
  constructor(
    private readonly page: Page,
    private readonly browserManager?: BrowserManager,
  ) {}

  async getAccessibilityTree(): Promise<string> {
    logger.info("Capturing accessibility tree");

    // Use Chrome DevTools Protocol to fetch the real accessibility tree. This
    // is the same tree screen readers see — computed accessible names, ARIA
    // roles, ignored nodes filtered out. Unlike the previous DOM walk, an
    // ancestor's "name" doesn't include all descendant innerText.
    //
    // CDP is Chromium-only. On Firefox/WebKit this throws; we degrade
    // gracefully by reporting that the tree isn't available rather than
    // crashing the audit.
    try {
      const client = await this.page.context().newCDPSession(this.page);
      await client.send("Accessibility.enable");
      const { nodes } = await client.send("Accessibility.getFullAXTree");

      type AXNode = {
        nodeId: string;
        ignored: boolean;
        role?: { value?: string };
        name?: { value?: string };
        childIds?: string[];
      };

      const byId = new Map<string, AXNode>();
      for (const n of nodes as AXNode[]) byId.set(n.nodeId, n);

      const root = (nodes as AXNode[])[0];
      if (!root) return "No accessibility tree available";

      // CDP returns "ignored" pass-through nodes (typically the <html>/<body>
      // wrappers) between meaningful ARIA nodes. We hide those from the
      // output but keep descending through their children, so e.g. the
      // <main> inside an ignored <body> still shows up under the root.
      function render(n: AXNode, depth: number): string[] {
        const lines: string[] = [];
        if (!n.ignored) {
          const role = n.role?.value ?? "unknown";
          const name = n.name?.value ? ` "${n.name.value}"` : "";
          lines.push(`${"  ".repeat(depth)}[${role}]${name}`);
        }
        const childDepth = n.ignored ? depth : depth + 1;
        for (const childId of n.childIds ?? []) {
          const child = byId.get(childId);
          if (child) lines.push(...render(child, childDepth));
        }
        return lines;
      }

      await client.detach().catch(() => {});
      return render(root, 0).join("\n");
    } catch (err) {
      logger.warn(
        `Accessibility tree unavailable: ${err instanceof Error ? err.message : String(err)}`,
      );
      return "Accessibility tree not available (CDP not supported on this browser)";
    }
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

    // Primary engine: axe-core. It implements the full WCAG 2.1 ruleset
    // including real color-contrast computation, ARIA-required-children,
    // landmark uniqueness, focus order, and many other rules our hand-rolled
    // subset can't realistically cover. We run axe first, then layer in our
    // own fast-path rules so any custom checks we add later (e.g. project-
    // specific design-system rules) compose with axe rather than replace it.
    const axeIssues = await this.runAxeAudit();

    // Supplementary fast-path: a few coarse heuristics axe doesn't cover or
    // covers differently. Dedupe against axe by rule id.
    const supplementaryIssues = await this.runSupplementaryAudit();
    const axeRules = new Set(axeIssues.map((i) => i.rule));
    const merged = [
      ...axeIssues,
      ...supplementaryIssues.filter((i) => !axeRules.has(i.rule)),
    ];

    logger.info(
      `Accessibility audit found ${merged.length} issues (${axeIssues.length} from axe-core, ${supplementaryIssues.length} from supplementary rules)`,
    );
    return merged;
  }

  private async runAxeAudit(): Promise<AccessibilityIssue[]> {
    try {
      const results = await new AxeBuilder({ page: this.page }).analyze();
      const issues: AccessibilityIssue[] = [];
      for (const v of results.violations) {
        issues.push({
          id: `axe-${v.id}`,
          impact: (v.impact ?? "moderate") as AccessibilityIssue["impact"],
          description: v.description,
          helpUrl: v.helpUrl,
          rule: v.id,
          nodes: v.nodes.map((n) => n.html.slice(0, 200)),
        });
      }
      return issues;
    } catch (err) {
      logger.warn(
        `axe-core audit failed (${err instanceof Error ? err.message : String(err)}); falling back to supplementary rules only`,
      );
      return [];
    }
  }

  private async runSupplementaryAudit(): Promise<AccessibilityIssue[]> {
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

      // Small text — distinct from contrast. WCAG 1.4.4 (Resize Text) is the
      // closest mapping; impact is minor since this is a heuristic, not a
      // hard violation.
      document.querySelectorAll("p, span, h1, h2, h3, h4, h5, h6, li, a, label").forEach((el) => {
        const style = window.getComputedStyle(el);
        const fontSize = parseFloat(style.fontSize);
        if (fontSize < 12 && el.textContent?.trim()) {
          results.push({
            id: `small-text-${results.length}`,
            impact: "minor",
            description: `Text element has very small font size (${fontSize}px) — readability risk`,
            helpUrl: "https://www.w3.org/WAI/WCAG21/Understanding/resize-text.html",
            nodes: [el.outerHTML.slice(0, 120)],
            rule: "small-text",
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

      // Skip-link detection: a skip link is an in-page anchor near the top
      // of the document that jumps to main content. We require BOTH (a) the
      // link's text mentions skip/jump/main/content OR the link is the first
      // focusable element on the page, AND (b) the href target actually
      // exists in the document. This avoids both false negatives (skip link
      // exists but isn't the very first <a>) and false positives (any
      // <a href="#section"> being counted as a skip link).
      const anchorLinks = Array.from(
        document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'),
      );
      const isSkipLinkCandidate = (a: HTMLAnchorElement): boolean => {
        const target = a.getAttribute("href")?.slice(1);
        if (!target) return false;
        const targetEl = document.getElementById(target);
        if (!targetEl) return false;
        const text = (a.textContent ?? "").toLowerCase();
        if (/(skip|jump).*(content|main|nav)|skip\s+to|jump\s+to/.test(text)) {
          return true;
        }
        // Also accept: link is among the first 3 focusable elements
        const focusables = Array.from(
          document.querySelectorAll<HTMLElement>(
            'a[href], button, [tabindex]:not([tabindex="-1"])',
          ),
        );
        return focusables.indexOf(a) >= 0 && focusables.indexOf(a) < 3;
      };
      const hasSkipLink = anchorLinks.some(isSkipLinkCandidate);
      if (!hasSkipLink) {
        results.push({
          id: "skip-link-0",
          impact: "moderate",
          description: "Page does not have a skip navigation link",
          helpUrl: "https://www.w3.org/WAI/WCAG21/Understanding/bypass-blocks.html",
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

      // CLS — sum non-input-triggered layout shifts.
      const layoutShiftEntries = perf.getEntriesByType("layout-shift") as (PerformanceEntry & { hadRecentInput: boolean; value: number })[];
      const cls = layoutShiftEntries
        .filter((e) => !e.hadRecentInput)
        .reduce((sum, e) => sum + e.value, 0);

      // TTI approximation. The strict Lighthouse definition is "first 5s
      // quiet window of no long tasks after FCP". Computing that requires
      // waiting 5s past the last long task, which we don't want to do here.
      // Instead, use the end of the last long task seen so far (or DOM
      // content loaded if no long tasks were observed). On most pages this
      // is within ~10% of the strict TTI by the time we measure (after
      // network idle).
      const longTaskEntries = perf.getEntriesByType("longtask");
      const lastLongTaskEnd =
        longTaskEntries.length > 0
          ? Math.max(
              ...longTaskEntries.map((e) => e.startTime + e.duration),
            )
          : null;
      const tti = lastLongTaskEnd ?? nav?.domContentLoadedEventEnd ?? fcp ?? null;

      return {
        lcp,
        fcp,
        cls: cls || null,
        tti,
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

    const consoleErrors =
      this.browserManager
        ?.getConsoleErrors()
        .filter((e) => e.type === "error")
        .map((e) => e.message) ?? [];

    const networkErrors =
      this.browserManager
        ?.getNetworkErrors()
        .map((e) => `${e.method} ${e.url} — ${e.failure}`) ?? [];

    return {
      brokenImages,
      consoleErrors,
      networkErrors,
    };
  }
}
