#!/usr/bin/env node

/**
 * Auto-test runner — standalone automated testing without Claude.
 * Launched by the Tauri app when user clicks "Test".
 * Outputs JSON lines to stdout for the frontend to consume.
 */

import { BrowserManager } from "./playwright/browser-manager.js";
import { PageAnalyzer } from "./playwright/page-analyzer.js";
import { generateHtmlReport } from "./utils/report-generator.js";
import type { TestReportData, TestResult, AccessibilityIssue } from "./types.js";

const url = process.argv[2];
if (!url) {
  console.error("Usage: auto-test <url>");
  process.exit(1);
}

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

async function run() {
  const startedAt = Date.now();
  const results: TestResult[] = [];
  const pagesExplored: string[] = [];
  let a11yIssues: AccessibilityIssue[] = [];
  const browser = new BrowserManager();

  try {
    // 1. Launch browser
    action("info", "Launching isolated Chromium browser...", "running");
    await browser.launch({ headless: false, recordVideo: true });
    action("info", "Browser launched in visible mode", "success");

    // 2. Navigate
    action("navigate", `Navigating to ${url}`, "running");
    const navResult = await browser.navigate(url);
    pagesExplored.push(navResult.url);
    action("navigate", `Loaded: "${navResult.title}"`, "success", navResult.url);

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
      viewport: { width: 1280, height: 720 },
    });

    // 4. Page analysis
    const page = browser.page;
    const analyzer = new PageAnalyzer(page);

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

    // 6. Accessibility audit
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

    // 7. Performance metrics
    action("performance", "Collecting performance metrics...", "running");
    const perfMetrics = await analyzer.getPerformanceMetrics();
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

    // 8. Responsive testing
    const breakpoints = [
      { name: "Mobile", width: 375, height: 812 },
      { name: "Tablet", width: 768, height: 1024 },
      { name: "Desktop", width: 1280, height: 720 },
    ];

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

    // Reset viewport
    await browser.setViewport(1280, 720);

    // 9. Explore internal links
    action("explore", "Discovering internal links...", "running");
    const links = await analyzer.getLinks();
    const origin = new URL(navResult.url).origin;
    const internalLinks = links.filter((l) => l.startsWith(origin)).slice(0, 5);
    action("explore", `Found ${links.length} links (${internalLinks.length} internal to test)`, "success");

    // Visit up to 3 internal pages
    for (const link of internalLinks.slice(0, 3)) {
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

    // Navigate back to original page for final metrics
    await browser.navigate(url);
    const finalPerf = await analyzer.getPerformanceMetrics();

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

    const reportPath = await generateHtmlReport(reportData, process.cwd());
    action("report", `Report generated: ${reportPath}`, "success");

    // Emit full report for the frontend
    emit("report", reportData as unknown as Record<string, unknown>);

    // Summary
    const duration = Math.round((Date.now() - startedAt) / 1000);
    action(
      "info",
      `Testing complete: ${passed} passed, ${failed} failed, ${warnings} warnings (${duration}s)`,
      failed > 0 ? "error" : "success",
    );

    // Keep browser open for 5s so user can see final state
    await page.waitForTimeout(3000);
    await browser.close();
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
