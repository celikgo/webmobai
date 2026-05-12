#!/usr/bin/env node

/**
 * Auto-test runner — standalone automated testing without Claude.
 * Launched by the Tauri app when user clicks "Test".
 * Outputs JSON lines to stdout for the frontend to consume.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { BrowserManager, defaultSessionDir } from "./playwright/browser-manager.js";
import { PageAnalyzer } from "./playwright/page-analyzer.js";
import { generateHtmlReport } from "./utils/report-generator.js";
import { generateJunitReport } from "./utils/junit-generator.js";
import type { TestReportData, TestResult, AccessibilityIssue } from "./types.js";

const execFileAsync = promisify(execFile);

const url = process.argv[2];
if (!url) {
  console.error("Usage: auto-test <url> [config-json]");
  process.exit(1);
}

import { parseRunConfig } from "./run-config.js";

const config = parseRunConfig(process.argv[3]);

function emit(type: string, data: Record<string, unknown>) {
  process.stdout.write(JSON.stringify({ type, data }) + "\n");
}

function action(
  actionType: string,
  description: string,
  status: "pending" | "running" | "success" | "error" = "success",
  details?: string,
) {
  emit("action", {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    type: actionType,
    description,
    status,
    details,
  });
}

async function ensureChromiumInstalled() {
  if (existsSync(chromium.executablePath())) return;

  action(
    "info",
    "First run — downloading Chromium (~170MB). This only happens once.",
    "running",
  );

  // Locate playwright's CLI relative to this file. Works in both the dev
  // layout (mcp-server/dist/auto-test.js next to mcp-server/node_modules/...)
  // and the bundled layout (Resources/_up_/mcp-server/dist + node_modules).
  const here = dirname(fileURLToPath(import.meta.url));
  const cliPath = resolve(here, "..", "node_modules", "playwright", "cli.js");

  if (!existsSync(cliPath)) {
    throw new Error(
      `Cannot find Playwright CLI at ${cliPath}. The runner's node_modules is missing — reinstall the app.`,
    );
  }

  await execFileAsync(process.execPath, [cliPath, "install", "chromium"], {
    timeout: 10 * 60 * 1000,
  });

  action("info", "Chromium installed", "success");
}

async function run() {
  const startedAt = Date.now();
  const results: TestResult[] = [];
  const pagesExplored: string[] = [];
  let a11yIssues: AccessibilityIssue[] = [];
  const sessionDir = defaultSessionDir();
  const browser = new BrowserManager(sessionDir);

  try {
    // 0. Ensure Chromium is downloaded (first-run only).
    await ensureChromiumInstalled();

    // 1. Launch browser using SessionConfig from the desktop app.
    action("info", "Launching isolated Chromium browser...", "running");
    await browser.launch({
      headless: false,
      viewport: config.viewport,
      recordVideo: config.enableVideo,
    });
    action(
      "info",
      `Browser launched (${config.viewport.width}x${config.viewport.height}, video ${config.enableVideo ? "on" : "off"})`,
      "success",
    );

    // 2. Navigate
    action("navigate", `Navigating to ${url}`, "running");
    const navResult = await browser.navigate(url);
    pagesExplored.push(navResult.url);
    action("navigate", `Loaded: "${navResult.title}"`, "success", navResult.url);

    // 2b. Auto-login if credentials were provided. This is a best-effort
    // heuristic: locate an email/username + password input on the landing
    // page, fill them, and submit. Apps with login on a separate page need
    // their own /login URL passed as the target.
    if (config.credentials?.username && config.credentials?.password) {
      try {
        action("info", "Attempting auto-login with provided credentials...", "running");
        const userSelector = await browser.page.evaluate(() => {
          const candidates = document.querySelectorAll<HTMLInputElement>(
            'input[type="email"], input[type="text"][name*="email" i], input[name*="user" i], input[id*="user" i]',
          );
          return candidates[0]?.outerHTML.slice(0, 80) ? "" : null;
        });
        const userInput = await browser.page.$(
          'input[type="email"], input[type="text"][name*="email" i], input[name*="user" i], input[id*="user" i]',
        );
        const passInput = await browser.page.$('input[type="password"]');
        if (userInput && passInput) {
          await userInput.fill(config.credentials.username);
          await passInput.fill(config.credentials.password);
          await browser.page.keyboard.press("Enter");
          await browser.page
            .waitForLoadState("networkidle", { timeout: 10_000 })
            .catch(() => {});
          action("info", "Auto-login attempted", "success");
        } else {
          action(
            "info",
            "No login form found on landing page — skipping auto-login",
            "success",
            userSelector ?? undefined,
          );
        }
      } catch (err) {
        action(
          "error",
          `Auto-login failed: ${err instanceof Error ? err.message : String(err)}`,
          "error",
        );
      }
    }

    results.push({
      url: navResult.url,
      title: "Page loads successfully",
      status: "pass",
      category: "Navigation",
      description: `Page loaded with title "${navResult.title}"`,
    });

    // 3. Screenshot
    action("screenshot", "Taking initial screenshot...", "running");
    const ssPath = await browser.screenshot("Initial page load");
    action("screenshot", "Screenshot captured", "success", ssPath);
    emit("screenshot", {
      url: ssPath,
      path: ssPath,
      description: "Initial page load",
      viewport: config.viewport,
    });

    // 4. Page analysis
    const page = browser.page;
    const analyzer = new PageAnalyzer(page, browser);

    action("explore", "Analyzing page structure...", "running");
    const domSummary = await analyzer.getDomSummary();
    action("explore", "Page structure analyzed", "success", domSummary.slice(0, 200));

    // 5. Check for errors
    action("info", "Checking for errors...", "running");
    const errors = await analyzer.checkForErrors();
    const consoleErrors = browser.getConsoleErrors();
    const errorCount = consoleErrors.filter((e) => e.type === "error").length;

    if (errors.brokenImages.length > 0) {
      action("error", `Found ${errors.brokenImages.length} broken images`, "error");
      results.push({
        url: navResult.url,
        title: "Broken images check",
        status: "fail",
        category: "Content",
        description: `${errors.brokenImages.length} broken images found`,
        details: errors.brokenImages.join(", "),
      });
    } else {
      action("info", "No broken images found", "success");
      results.push({
        url: navResult.url,
        title: "Broken images check",
        status: "pass",
        category: "Content",
        description: "All images load correctly",
      });
    }

    if (errorCount > 0) {
      action("error", `Found ${errorCount} console errors`, "error");
      results.push({
        url: navResult.url,
        title: "Console errors check",
        status: "fail",
        category: "Errors",
        description: `${errorCount} console errors detected`,
        details: consoleErrors
          .filter((e) => e.type === "error")
          .map((e) => e.message)
          .slice(0, 5)
          .join("; "),
      });
    } else {
      action("info", "No console errors", "success");
      results.push({
        url: navResult.url,
        title: "Console errors check",
        status: "pass",
        category: "Errors",
        description: "No console errors detected",
      });
    }

    // 6. Accessibility audit (gated by config.enableA11y).
    if (config.enableA11y) {
      action("accessibility", "Running accessibility audit...", "running");
      a11yIssues = await analyzer.runAccessibilityAudit();
      const critical = a11yIssues.filter((i) => i.impact === "critical" || i.impact === "serious");
      if (a11yIssues.length === 0) {
        action("accessibility", "No accessibility issues found", "success");
        results.push({
          url: navResult.url,
          title: "Accessibility audit",
          status: "pass",
          category: "Accessibility",
          description: "No accessibility issues detected",
        });
      } else {
        action(
          "accessibility",
          `Found ${a11yIssues.length} accessibility issues (${critical.length} critical/serious)`,
          critical.length > 0 ? "error" : "success",
        );
        results.push({
          url: navResult.url,
          title: "Accessibility audit",
          status: critical.length > 0 ? "fail" : "warning",
          category: "Accessibility",
          description: `${a11yIssues.length} issues: ${critical.length} critical/serious`,
          details: a11yIssues
            .slice(0, 5)
            .map((i) => `[${i.impact}] ${i.rule}: ${i.description}`)
            .join("; "),
        });
      }
    } else {
      action("info", "Accessibility audit skipped (disabled in config)", "success");
    }

    // 7. Performance metrics (gated by config.enablePerformance).
    let perfMetrics: Awaited<ReturnType<typeof analyzer.getPerformanceMetrics>> | undefined;
    if (config.enablePerformance) {
      action("performance", "Collecting performance metrics...", "running");
      perfMetrics = await analyzer.getPerformanceMetrics();
      const lcpGood = perfMetrics.lcp != null && perfMetrics.lcp <= 2500;
      const clsGood = perfMetrics.cls != null && perfMetrics.cls <= 0.1;
      action(
        "performance",
        `LCP: ${perfMetrics.lcp != null ? Math.round(perfMetrics.lcp) + "ms" : "N/A"}, CLS: ${perfMetrics.cls != null ? perfMetrics.cls.toFixed(3) : "N/A"}`,
        lcpGood && clsGood ? "success" : "error",
      );
      results.push({
        url: navResult.url,
        title: "Core Web Vitals",
        status: lcpGood && clsGood ? "pass" : "warning",
        category: "Performance",
        description: `LCP: ${perfMetrics.lcp != null ? Math.round(perfMetrics.lcp) + "ms" : "N/A"}, FCP: ${perfMetrics.fcp != null ? Math.round(perfMetrics.fcp) + "ms" : "N/A"}, CLS: ${perfMetrics.cls != null ? perfMetrics.cls.toFixed(3) : "N/A"}`,
      });
    } else {
      action("info", "Performance metrics skipped (disabled in config)", "success");
    }

    // 8. Responsive testing — use breakpoints from the desktop app's config.
    const breakpoints = config.responsiveBreakpoints;

    for (const bp of breakpoints) {
      action("responsive", `Testing ${bp.name} (${bp.width}x${bp.height})...`, "running");
      await browser.setViewport(bp.width, bp.height);
      await page.waitForTimeout(500);

      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      const bpSs = await browser.screenshot(`${bp.name} (${bp.width}x${bp.height})`);

      action(
        "responsive",
        `${bp.name}: ${hasOverflow ? "Horizontal overflow detected" : "OK"}`,
        hasOverflow ? "error" : "success",
      );

      emit("screenshot", {
        url: bpSs,
        path: bpSs,
        description: `${bp.name} (${bp.width}x${bp.height})`,
        viewport: { width: bp.width, height: bp.height },
      });

      results.push({
        url: navResult.url,
        title: `Responsive: ${bp.name}`,
        status: hasOverflow ? "warning" : "pass",
        category: "Responsive",
        description: hasOverflow
          ? `Horizontal overflow at ${bp.width}px`
          : `Displays correctly at ${bp.width}px`,
      });
    }

    // Reset viewport back to the user's configured default.
    await browser.setViewport(config.viewport.width, config.viewport.height);

    // 9. Explore internal links — cap at config.maxPages (minus the
    // homepage we already visited).
    action("explore", "Discovering internal links...", "running");
    const links = await analyzer.getLinks();
    const origin = new URL(navResult.url).origin;
    const additionalPageBudget = Math.max(0, config.maxPages - 1);
    const internalLinks = links
      .filter((l) => l.startsWith(origin))
      .slice(0, additionalPageBudget);
    action(
      "explore",
      `Found ${links.length} links (${internalLinks.length} internal to test, cap=${config.maxPages})`,
      "success",
    );

    for (const link of internalLinks) {
      try {
        action("navigate", `Exploring: ${link}`, "running");
        await browser.navigate(link);
        pagesExplored.push(link);
        const title = await page.title();
        action("navigate", `Loaded: "${title}"`, "success");
        await browser.screenshot(title || link);

        // Quick error check on each page
        const pageErrors = browser.getConsoleErrors();
        const newErrors = pageErrors.filter((e) => e.type === "error" && e.url === link);
        if (newErrors.length > 0) {
          results.push({
            url: link,
            title: `Console errors on ${title || link}`,
            status: "fail",
            category: "Errors",
            description: `${newErrors.length} errors on ${link}`,
          });
        } else {
          results.push({
            url: link,
            title: `Page loads: ${title || link}`,
            status: "pass",
            category: "Navigation",
            description: `Successfully loaded ${link}`,
          });
        }
      } catch (err) {
        action("error", `Failed to load: ${link}`, "error", String(err));
        results.push({
          url: link,
          title: `Page load failed: ${link}`,
          status: "fail",
          category: "Navigation",
          description: `Failed to load ${link}`,
          details: String(err),
        });
      }
    }

    // 10. Generate report
    action("report", "Generating test report...", "running");

    // Navigate back to original page for final metrics. Only re-measure
    // performance if it's enabled; otherwise reuse whatever we already have
    // (or null defaults).
    await browser.navigate(url);
    const finalPerf = config.enablePerformance
      ? await analyzer.getPerformanceMetrics()
      : (perfMetrics ?? {
          lcp: null,
          fcp: null,
          cls: null,
          tti: null,
          ttfb: null,
          domContentLoaded: null,
          loadComplete: null,
        });

    const passed = results.filter((r) => r.status === "pass").length;
    const failed = results.filter((r) => r.status === "fail").length;
    const warnings = results.filter((r) => r.status === "warning").length;

    const reportData: TestReportData = {
      id: `report-${Date.now()}`,
      url,
      startedAt,
      completedAt: Date.now(),
      summary: { totalTests: results.length, passed, failed, warnings },
      results,
      accessibilityIssues: a11yIssues,
      performanceMetrics: finalPerf,
      consoleErrors: browser.getConsoleErrors(),
      screenshots: [],
      pagesExplored,
    };

    const reportPath = await generateHtmlReport(reportData, sessionDir);
    action("report", `HTML report generated: ${reportPath}`, "success");

    const junitPath = await generateJunitReport(reportData, sessionDir);
    action(
      "report",
      `JUnit XML report generated: ${junitPath}`,
      "success",
      "Drop into your CI for native test-result display.",
    );

    // Emit full report for the frontend
    emit("report", reportData as unknown as Record<string, unknown>);

    // Summary
    const duration = Math.round((Date.now() - startedAt) / 1000);
    action(
      "info",
      `Testing complete: ${passed} passed, ${failed} failed, ${warnings} warnings (${duration}s)`,
      failed > 0 ? "error" : "success",
    );

    // Keep browser open for 5s so user can see final state, then close.
    // close() saves the Playwright trace (~/sessionDir/trace.zip).
    await page.waitForTimeout(3000);
    await browser.close();
    action(
      "info",
      `Playwright trace saved: ${browser.traceFilePath}`,
      "success",
      "Drop into https://trace.playwright.dev for time-travel debugging.",
    );
  } catch (err) {
    action("error", `Fatal error: ${String(err)}`, "error");
    try {
      await browser.close();
    } catch {
      // ignore
    }
    process.exit(1);
  }
}

run();
