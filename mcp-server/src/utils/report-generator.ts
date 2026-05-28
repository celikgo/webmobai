import { writeFile } from "fs/promises";
import { join } from "path";
import { chromium } from "playwright";
import type {
  TestReportData,
  AccessibilityIssue,
  PerformanceMetrics,
  ConsoleError,
} from "../types.js";
import { logger } from "./logger.js";

export async function generateHtmlReport(
  report: TestReportData,
  outputDir: string,
): Promise<string> {
  const filePath = join(outputDir, `report-${Date.now()}.html`);

  const passRate =
    report.summary.totalTests > 0
      ? Math.round((report.summary.passed / report.summary.totalTests) * 100)
      : 0;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WebMobAI Test Report — ${report.url}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #fafafa; padding: 2rem; }
    .container { max-width: 900px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.1rem; margin: 1.5rem 0 0.75rem; color: #a78bfa; }
    .compare { background: #171717; border: 1px solid #333; border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1.5rem; }
    .compare h2 { margin-top: 0; }
    .compare .baseline-count { color: #888; font-size: 0.8rem; margin-bottom: 0.5rem; }
    .compare table { width: 100%; }
    .compare th { font-size: 0.75rem; }
    .compare .sev { display: inline-block; font-size: 0.7rem; font-weight: 600; padding: 0.1rem 0.4rem; border-radius: 4px; }
    .sev-regression { background: #7f1d1d; color: #fecaca; }
    .sev-improvement { background: #14532d; color: #bbf7d0; }
    .sev-noise { background: #2c2c2c; color: #888; }
    .ai-summary { background: linear-gradient(135deg, #1e1b4b 0%, #1e293b 100%); border: 1px solid #4c1d95; border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1.5rem; }
    .ai-summary .ai-tag { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.7rem; font-weight: 600; color: #c4b5fd; background: rgba(139, 92, 246, 0.15); padding: 0.2rem 0.5rem; border-radius: 4px; margin-bottom: 0.6rem; }
    .ai-summary h3 { font-size: 0.95rem; color: #ddd6fe; margin: 0.75rem 0 0.35rem; }
    .ai-summary h3:first-of-type { margin-top: 0; }
    .ai-summary p { font-size: 0.9rem; line-height: 1.5; color: #e9d5ff; margin-bottom: 0.5rem; }
    .ai-summary ul { padding-left: 1.25rem; margin-bottom: 0.5rem; }
    .ai-summary li { font-size: 0.88rem; line-height: 1.5; color: #e9d5ff; margin-bottom: 0.3rem; }
    .ai-summary strong { color: #f5d0fe; }
    .ai-summary em { color: #c4b5fd; font-style: normal; }
    .meta { color: #888; font-size: 0.85rem; margin-bottom: 1.5rem; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 2rem; }
    .summary-card { background: #171717; border: 1px solid #333; border-radius: 8px; padding: 1rem; text-align: center; }
    .summary-card .num { font-size: 2rem; font-weight: 700; }
    .summary-card .label { font-size: 0.75rem; color: #888; margin-top: 0.25rem; }
    .pass { color: #4ade80; }
    .fail { color: #f87171; }
    .warn { color: #facc15; }
    .bar { height: 8px; border-radius: 4px; background: #333; overflow: hidden; margin-bottom: 1.5rem; }
    .bar-fill { height: 100%; background: #4ade80; border-radius: 4px; }
    .result { background: #171717; border: 1px solid #333; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 0.5rem; display: flex; align-items: flex-start; gap: 0.75rem; }
    .result .icon { font-size: 1.2rem; line-height: 1; }
    .result .title { font-weight: 600; font-size: 0.9rem; }
    .result .desc { color: #aaa; font-size: 0.8rem; margin-top: 0.2rem; }
    .result .category { background: #333; color: #ccc; font-size: 0.7rem; padding: 0.15rem 0.4rem; border-radius: 4px; margin-left: 0.5rem; }
    .a11y-issue { background: #171717; border: 1px solid #333; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 0.5rem; }
    .a11y-impact { display: inline-block; font-size: 0.7rem; padding: 0.15rem 0.4rem; border-radius: 4px; font-weight: 600; margin-right: 0.5rem; }
    .impact-critical { background: #dc2626; color: white; }
    .impact-serious { background: #ea580c; color: white; }
    .impact-moderate { background: #ca8a04; color: white; }
    .impact-minor { background: #555; color: #ccc; }
    .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
    .metric-card { background: #171717; border: 1px solid #333; border-radius: 8px; padding: 1rem; }
    .metric-card .value { font-size: 1.5rem; font-weight: 700; }
    .metric-card .label { font-size: 0.75rem; color: #888; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #333; }
    th { color: #888; font-weight: 500; }
    footer { margin-top: 3rem; text-align: center; color: #555; font-size: 0.75rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>WebMobAI Test Report</h1>
    <div class="meta">
      URL: ${escapeHtml(report.url)}<br>
      Generated: ${new Date(report.completedAt).toLocaleString()}<br>
      Duration: ${formatDuration(report.completedAt - report.startedAt)}<br>
      Pages explored: ${report.pagesExplored.length}
    </div>

    <div class="summary">
      <div class="summary-card">
        <div class="num">${report.summary.totalTests}</div>
        <div class="label">Total Tests</div>
      </div>
      <div class="summary-card">
        <div class="num pass">${report.summary.passed}</div>
        <div class="label">Passed</div>
      </div>
      <div class="summary-card">
        <div class="num fail">${report.summary.failed}</div>
        <div class="label">Failed</div>
      </div>
      <div class="summary-card">
        <div class="num warn">${report.summary.warnings}</div>
        <div class="label">Warnings</div>
      </div>
    </div>

    <div class="bar"><div class="bar-fill" style="width: ${passRate}%"></div></div>

    ${
      report.aiSummary
        ? `
    <div class="ai-summary">
      <div class="ai-tag">✦ Claude summary</div>
      ${renderMarkdown(report.aiSummary)}
    </div>`
        : ""
    }

    ${
      report.historicalComparison &&
      report.historicalComparison.findings.length > 0
        ? `
    <div class="compare">
      <h2>vs historical baseline</h2>
      <div class="baseline-count">Median of the last ${report.historicalComparison.baselineRuns} run${report.historicalComparison.baselineRuns === 1 ? "" : "s"} of this URL.</div>
      <table>
        <thead><tr><th>Metric</th><th>Current</th><th>Baseline</th><th>Δ</th><th>Status</th></tr></thead>
        <tbody>
        ${report.historicalComparison.findings
          .map(
            (f) =>
              `<tr>
                <td>${escapeHtml(f.metric)}</td>
                <td>${formatComparisonNum(f.current)}</td>
                <td>${formatComparisonNum(f.baseline)}</td>
                <td>${f.deltaPct == null ? "—" : (f.deltaPct > 0 ? "+" : "") + f.deltaPct.toFixed(1) + "%"}</td>
                <td><span class="sev sev-${f.severity}">${f.severity}</span></td>
              </tr>`,
          )
          .join("")}
        </tbody>
      </table>
    </div>`
        : ""
    }

    <h2>Test Results</h2>
    ${report.results
      .map(
        (r) => `
    <div class="result">
      <span class="icon">${r.status === "pass" ? "✅" : r.status === "fail" ? "❌" : "⚠️"}</span>
      <div>
        <div class="title">${escapeHtml(r.title)}<span class="category">${escapeHtml(r.category)}</span></div>
        <div class="desc">${escapeHtml(r.description)}</div>
        ${r.details ? `<div class="desc" style="margin-top:0.3rem;font-family:monospace;background:#111;padding:0.3rem 0.5rem;border-radius:4px">${escapeHtml(r.details)}</div>` : ""}
      </div>
    </div>`,
      )
      .join("")}

    ${
      report.accessibilityIssues.length > 0
        ? `
    <h2>Accessibility Issues (${report.accessibilityIssues.length})</h2>
    ${report.accessibilityIssues
      .map(
        (issue) => `
    <div class="a11y-issue">
      <span class="a11y-impact impact-${issue.impact}">${issue.impact.toUpperCase()}</span>
      <strong>${escapeHtml(issue.rule)}</strong>: ${escapeHtml(issue.description)}
    </div>`,
      )
      .join("")}`
        : ""
    }

    ${
      report.performanceMetrics
        ? `
    <h2>Performance Metrics</h2>
    <div class="metrics">
      ${formatMetricCard("LCP", report.performanceMetrics.lcp, "ms")}
      ${formatMetricCard("FCP", report.performanceMetrics.fcp, "ms")}
      ${formatMetricCard("CLS", report.performanceMetrics.cls, "")}
      ${formatMetricCard("TTI", report.performanceMetrics.tti, "ms")}
      ${formatMetricCard("TTFB", report.performanceMetrics.ttfb, "ms")}
      ${formatMetricCard("Load", report.performanceMetrics.loadComplete, "ms")}
    </div>`
        : ""
    }

    ${
      report.consoleErrors.length > 0
        ? `
    <h2>Console Errors (${report.consoleErrors.length})</h2>
    <table>
      <thead><tr><th>Type</th><th>Message</th><th>URL</th></tr></thead>
      <tbody>
      ${report.consoleErrors
        .map(
          (e) =>
            `<tr><td>${e.type}</td><td>${escapeHtml(e.message)}</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(e.url)}</td></tr>`,
        )
        .join("")}
      </tbody>
    </table>`
        : ""
    }

    <footer>Generated by WebMobAI — Autonomous Web QA</footer>
  </div>
</body>
</html>`;

  await writeFile(filePath, html, "utf-8");
  logger.info(`HTML report saved to ${filePath}`);
  return filePath;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

// Tiny markdown → HTML for the AI summary section. Supports the subset we
// instruct Claude to emit (## headings, - bullets, **bold**, *italic*) plus
// plain paragraphs. Anything outside the subset falls through as a paragraph,
// HTML-escaped first to keep the renderer safe. Exported for unit tests.
export function renderMarkdown(md: string): string {
  const out: string[] = [];
  const lines = md.split(/\r?\n/);
  let inList = false;
  const flushList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };
  const inline = (s: string) =>
    escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|\s)\*(?!\s)([^*]+?)\*(?=$|\s|[.,;:!?])/g, "$1<em>$2</em>");

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      flushList();
      continue;
    }
    if (line.startsWith("## ")) {
      flushList();
      out.push(`<h3>${inline(line.slice(3))}</h3>`);
      continue;
    }
    if (line.startsWith("### ")) {
      flushList();
      out.push(`<h3>${inline(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inline(line.slice(2))}</li>`);
      continue;
    }
    flushList();
    out.push(`<p>${inline(line)}</p>`);
  }
  flushList();
  return out.join("\n");
}

function formatComparisonNum(v: number | null): string {
  if (v == null) return "—";
  if (Math.abs(v) >= 100) return Math.round(v).toString();
  if (Math.abs(v) >= 1) return v.toFixed(1);
  return v.toFixed(3);
}

function formatMetricCard(
  label: string,
  value: number | null,
  unit: string,
): string {
  const display =
    value == null
      ? "N/A"
      : unit === "ms"
        ? `${Math.round(value)}ms`
        : value.toFixed(3);
  return `<div class="metric-card"><div class="value">${display}</div><div class="label">${label}</div></div>`;
}

/**
 * Render an existing HTML report to PDF (Sprint 16). Spins up an isolated
 * headless Chromium instance just for the print job so we never disrupt the
 * caller's active page. Returns the generated PDF path.
 *
 * Playwright is already a runtime dep — no new library needed.
 */
export async function generatePdfReport(
  htmlPath: string,
  outputDir: string,
): Promise<string> {
  const pdfPath = join(outputDir, `report-${Date.now()}.pdf`);
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    // file:// URLs need three leading slashes when the path is absolute.
    const url = htmlPath.startsWith("/")
      ? `file://${htmlPath}`
      : `file:///${htmlPath}`;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", right: "10mm", bottom: "12mm", left: "10mm" },
    });
  } finally {
    await browser.close().catch(() => {});
  }
  logger.info(`PDF report saved to ${pdfPath}`);
  return pdfPath;
}

export type { TestReportData, AccessibilityIssue, PerformanceMetrics, ConsoleError };
