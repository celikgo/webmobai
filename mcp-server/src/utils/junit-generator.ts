import { writeFile } from "fs/promises";
import { join } from "path";
import type { TestReportData, TestResult } from "../types.js";
import { logger } from "./logger.js";

/**
 * JUnit XML serializer. CI systems (GitHub Actions, GitLab, Jenkins,
 * CircleCI, Buildkite) read this format natively for test-result display
 * — green/red badges, failed-test summaries, history graphs.
 *
 * Schema follows the de-facto Jenkins/Surefire conventions:
 *   <testsuites>
 *     <testsuite name="..." tests="..." failures="..." errors="..." time="...">
 *       <testcase classname="..." name="..." time="...">
 *         <failure message="...">...</failure>  (when status=fail)
 *         <skipped/>                              (when status=warning)
 *       </testcase>
 *     </testsuite>
 *   </testsuites>
 *
 * We use a single <testsuite> per WebMobAI run since results aren't grouped
 * into per-suite collections yet. Once test suites are introduced (P1 from
 * FEATURES.md), this becomes one <testsuite> per suite.
 */

export async function generateJunitReport(
  report: TestReportData,
  outputDir: string,
): Promise<string> {
  const filePath = join(outputDir, `junit-${Date.now()}.xml`);
  const xml = renderJunit(report);
  await writeFile(filePath, xml, "utf-8");
  logger.info(`JUnit XML report saved to ${filePath}`);
  return filePath;
}

export function renderJunit(report: TestReportData): string {
  const durationSec = ((report.completedAt - report.startedAt) / 1000).toFixed(3);
  const failures = report.results.filter((r) => r.status === "fail").length;
  const warnings = report.results.filter((r) => r.status === "warning").length;
  // CI systems treat <skipped/> as non-failure. We map our "warning" status
  // to <skipped> rather than <failure> so a warning doesn't break CI.
  const total = report.results.length;
  const suiteName = sanitizeSuiteName(report.url);
  const isoTimestamp = new Date(report.startedAt).toISOString();

  const testcases = report.results.map(renderTestcase).join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="WebMobAI" tests="${total}" failures="${failures}" errors="0" skipped="${warnings}" time="${durationSec}">`,
    `  <testsuite name="${esc(suiteName)}" tests="${total}" failures="${failures}" errors="0" skipped="${warnings}" time="${durationSec}" timestamp="${esc(isoTimestamp)}">`,
    indent(testcases, 4),
    "  </testsuite>",
    "</testsuites>",
    "",
  ].join("\n");
}

function renderTestcase(result: TestResult): string {
  // Classname conventionally groups testcases. Use the result's category
  // (Navigation, Errors, Accessibility, etc.) so CI dashboards bucket
  // related tests together.
  const classname = result.category || "WebMobAI";
  const name = result.title;
  const inner =
    result.status === "fail"
      ? `<failure message="${esc(result.description)}">${esc(result.details ?? result.description)}</failure>`
      : result.status === "warning"
        ? `<skipped message="${esc(result.description)}"/>`
        : "";
  if (!inner) {
    return `<testcase classname="${esc(classname)}" name="${esc(name)}"/>`;
  }
  return [
    `<testcase classname="${esc(classname)}" name="${esc(name)}">`,
    indent(inner, 2),
    `</testcase>`,
  ].join("\n");
}

function sanitizeSuiteName(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return url;
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function indent(s: string, n: number): string {
  const pad = " ".repeat(n);
  return s
    .split("\n")
    .map((line) => (line.length > 0 ? pad + line : line))
    .join("\n");
}
