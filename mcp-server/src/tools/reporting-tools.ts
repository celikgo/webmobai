import type { BrowserManager } from "../playwright/browser-manager.js";
import { PageAnalyzer } from "../playwright/page-analyzer.js";
import { generateHtmlReport } from "../utils/report-generator.js";
import { generateJunitReport } from "../utils/junit-generator.js";
import { logger } from "../utils/logger.js";
import type { TestReportData, TestResult } from "../types.js";

// Session-level storage for building up the report
const sessionData: {
  startedAt: number;
  pagesExplored: Set<string>;
  results: TestResult[];
} = {
  startedAt: Date.now(),
  pagesExplored: new Set(),
  results: [],
};

export function resetSessionData() {
  sessionData.startedAt = Date.now();
  sessionData.pagesExplored.clear();
  sessionData.results = [];
}

export function getReportingToolDefinitions() {
  return [
    {
      name: "webmobai_get_performance_metrics",
      description:
        "Collect Web Vitals and performance metrics for the current page: LCP, FCP, CLS, TTI, TTFB, and load timing.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
    {
      name: "webmobai_test_responsive",
      description:
        "Test the current page at multiple responsive breakpoints. Takes a screenshot at each viewport size and reports layout issues.",
      inputSchema: {
        type: "object" as const,
        properties: {
          breakpoints: {
            type: "array",
            description:
              'Array of breakpoints to test. Each should have name, width, height. Default: Mobile (375x812), Tablet (768x1024), Desktop (1280x720)',
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                width: { type: "number" },
                height: { type: "number" },
              },
              required: ["name", "width", "height"],
            },
          },
        },
      },
    },
    {
      name: "webmobai_add_test_result",
      description:
        "Add a test result to the session report. Call this after each test you perform to build up the final report.",
      inputSchema: {
        type: "object" as const,
        properties: {
          title: {
            type: "string",
            description: "Short title for the test (e.g., 'Homepage loads correctly')",
          },
          status: {
            type: "string",
            enum: ["pass", "fail", "warning"],
            description: "Test result status",
          },
          category: {
            type: "string",
            description: "Category (e.g., 'Navigation', 'Forms', 'Accessibility', 'Performance')",
          },
          description: {
            type: "string",
            description: "What was tested and the outcome",
          },
          details: {
            type: "string",
            description: "Additional technical details or error messages",
          },
        },
        required: ["title", "status", "category", "description"],
      },
    },
    {
      name: "webmobai_generate_report",
      description:
        "Generate the final HTML test report with all collected test results, accessibility issues, performance metrics, and screenshots. Also emits a JUnit XML alongside the HTML for native CI integration. Call this when you've finished testing.",
      inputSchema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description: "The main URL that was tested",
          },
          junit: {
            type: "boolean",
            description:
              "Also produce a JUnit XML report next to the HTML one (default true). Set false if you only want HTML.",
            default: true,
          },
        },
        required: ["url"],
      },
    },
  ];
}

export async function handleReportingTool(
  name: string,
  args: Record<string, unknown>,
  browserManager: BrowserManager,
): Promise<{ content: { type: "text"; text: string }[] }> {
  try {
    const page = browserManager.page;
    const analyzer = new PageAnalyzer(page, browserManager);

    switch (name) {
      case "webmobai_get_performance_metrics": {
        const metrics = await analyzer.getPerformanceMetrics();
        let result = "# Performance Metrics\n\n";
        result += `| Metric | Value | Rating |\n|--------|-------|--------|\n`;
        result += `| LCP    | ${metrics.lcp != null ? Math.round(metrics.lcp) + "ms" : "N/A"} | ${rateMetric("lcp", metrics.lcp)} |\n`;
        result += `| FCP    | ${metrics.fcp != null ? Math.round(metrics.fcp) + "ms" : "N/A"} | ${rateMetric("fcp", metrics.fcp)} |\n`;
        result += `| CLS    | ${metrics.cls != null ? metrics.cls.toFixed(3) : "N/A"} | ${rateMetric("cls", metrics.cls)} |\n`;
        result += `| TTI    | ${metrics.tti != null ? Math.round(metrics.tti) + "ms" : "N/A"} | ${rateMetric("tti", metrics.tti)} |\n`;
        result += `| TTFB   | ${metrics.ttfb != null ? Math.round(metrics.ttfb) + "ms" : "N/A"} | ${rateMetric("ttfb", metrics.ttfb)} |\n`;
        result += `| DOM Content Loaded | ${metrics.domContentLoaded != null ? Math.round(metrics.domContentLoaded) + "ms" : "N/A"} | - |\n`;
        result += `| Page Load Complete | ${metrics.loadComplete != null ? Math.round(metrics.loadComplete) + "ms" : "N/A"} | - |\n`;
        return text(result);
      }

      case "webmobai_test_responsive": {
        const breakpoints = (args.breakpoints as { name: string; width: number; height: number }[]) ?? [
          { name: "Mobile", width: 375, height: 812 },
          { name: "Tablet", width: 768, height: 1024 },
          { name: "Desktop", width: 1280, height: 720 },
        ];

        // Save original viewport
        const originalViewport = page.viewportSize() ?? { width: 1280, height: 720 };
        const results: string[] = [];

        for (const bp of breakpoints) {
          await browserManager.setViewport(bp.width, bp.height);
          await page.waitForTimeout(500); // Allow reflow
          const screenshotPath = await browserManager.screenshot(
            `${bp.name} (${bp.width}x${bp.height})`,
          );

          // Check for horizontal overflow
          const hasOverflow = await page.evaluate(() => {
            return document.documentElement.scrollWidth > document.documentElement.clientWidth;
          });

          results.push(
            `## ${bp.name} (${bp.width}x${bp.height})\n` +
              `Screenshot: ${screenshotPath}\n` +
              `Horizontal overflow: ${hasOverflow ? "YES (content extends beyond viewport)" : "No"}\n`,
          );

          sessionData.results.push({
            url: page.url(),
            title: `Responsive: ${bp.name} (${bp.width}x${bp.height})`,
            status: hasOverflow ? "warning" : "pass",
            category: "Responsive",
            description: hasOverflow
              ? `Page has horizontal overflow at ${bp.width}px width`
              : `Page displays correctly at ${bp.width}px width`,
          });
        }

        // Restore original viewport
        await browserManager.setViewport(originalViewport.width, originalViewport.height);

        return text(`# Responsive Testing Results\n\n${results.join("\n")}`);
      }

      case "webmobai_add_test_result": {
        const result: TestResult = {
          url: page.url(),
          title: args.title as string,
          status: args.status as "pass" | "fail" | "warning",
          category: args.category as string,
          description: args.description as string,
          details: args.details as string | undefined,
        };
        sessionData.results.push(result);
        sessionData.pagesExplored.add(page.url());

        const icon = result.status === "pass" ? "PASS" : result.status === "fail" ? "FAIL" : "WARN";
        return text(
          `[${icon}] Test result recorded: ${result.title}\n` +
            `Total results so far: ${sessionData.results.length}`,
        );
      }

      case "webmobai_generate_report": {
        const url = args.url as string;
        const a11yIssues = await analyzer.runAccessibilityAudit();
        const perfMetrics = await analyzer.getPerformanceMetrics();
        const consoleErrors = browserManager.getConsoleErrors();

        const passed = sessionData.results.filter((r) => r.status === "pass").length;
        const failed = sessionData.results.filter((r) => r.status === "fail").length;
        const warnings = sessionData.results.filter((r) => r.status === "warning").length;

        const reportData: TestReportData = {
          id: `report-${Date.now()}`,
          url,
          startedAt: sessionData.startedAt,
          completedAt: Date.now(),
          summary: {
            totalTests: sessionData.results.length,
            passed,
            failed,
            warnings,
          },
          results: sessionData.results,
          accessibilityIssues: a11yIssues,
          performanceMetrics: perfMetrics,
          consoleErrors,
          screenshots: [],
          pagesExplored: Array.from(sessionData.pagesExplored),
        };

        // Write artifacts into the browser's session dir so they sit next
        // to the screenshots, recordings, and trace.zip. Previously this
        // used process.cwd(), which is unpredictable for Claude Desktop /
        // Claude Code spawn contexts.
        const outDir = browserManager.sessionDir;
        const reportPath = await generateHtmlReport(reportData, outDir);
        const junit = (args.junit as boolean | undefined) ?? true;
        const junitPath = junit
          ? await generateJunitReport(reportData, outDir)
          : null;

        let summary = `# Test Report Generated\n\n`;
        summary += `HTML report: ${reportPath}\n`;
        if (junitPath) summary += `JUnit XML: ${junitPath}\n`;
        summary += `Playwright trace: ${browserManager.traceFilePath}\n`;
        summary += `(Open trace at https://trace.playwright.dev)\n\n`;
        summary += `## Summary\n`;
        summary += `- Total tests: ${reportData.summary.totalTests}\n`;
        summary += `- Passed: ${passed}\n`;
        summary += `- Failed: ${failed}\n`;
        summary += `- Warnings: ${warnings}\n`;
        summary += `- Pass rate: ${reportData.summary.totalTests > 0 ? Math.round((passed / reportData.summary.totalTests) * 100) : 0}%\n`;
        summary += `- Pages explored: ${reportData.pagesExplored.length}\n`;
        summary += `- Accessibility issues: ${a11yIssues.length}\n`;
        summary += `- Console errors: ${consoleErrors.filter((e) => e.type === "error").length}\n`;
        summary += `- Duration: ${Math.round((reportData.completedAt - reportData.startedAt) / 1000)}s\n`;

        return text(summary);
      }

      default:
        return text(`Unknown reporting tool: ${name}`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Reporting tool error (${name}): ${msg}`);
    return text(`Error executing ${name}: ${msg}`);
  }
}

function rateMetric(name: string, value: number | null): string {
  if (value == null) return "-";
  const thresholds: Record<string, [number, number]> = {
    lcp: [2500, 4000],
    fcp: [1800, 3000],
    cls: [0.1, 0.25],
    tti: [3800, 7300],
    ttfb: [800, 1800],
  };
  const t = thresholds[name];
  if (!t) return "-";
  if (value <= t[0]) return "Good";
  if (value <= t[1]) return "Needs Improvement";
  return "Poor";
}

function text(message: string) {
  return { content: [{ type: "text" as const, text: message }] };
}
