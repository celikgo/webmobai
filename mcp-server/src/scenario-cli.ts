#!/usr/bin/env node

/**
 * Standalone CLI for running scenario files.
 *
 *   webmobai-scenario path/to/scenario.json
 *
 * Reads a scenario, executes it in a fresh isolated browser, and writes
 * one-shot artifacts (screenshots, HTML + JUnit reports, trace.zip) to a
 * temp session dir. Returns exit code 0 on full pass, 1 otherwise.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  BrowserManager,
  defaultSessionDir,
} from "./playwright/browser-manager.js";
import { runScenario } from "./scenario/runner.js";
import { generateHtmlReport } from "./utils/report-generator.js";
import { generateJunitReport } from "./utils/junit-generator.js";
import type { Scenario } from "./scenario/types.js";
import type { TestReportData, TestResult } from "./types.js";

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: webmobai-scenario <scenario.json>");
    process.exit(2);
  }
  const abs = resolve(path);
  if (!existsSync(abs)) {
    console.error(`Scenario file not found: ${abs}`);
    process.exit(2);
  }

  const raw = await readFile(abs, "utf-8");
  let scenario: Scenario;
  try {
    scenario = JSON.parse(raw) as Scenario;
  } catch (err) {
    console.error(
      `Could not parse scenario JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(2);
  }
  if (!scenario.url || !Array.isArray(scenario.steps)) {
    console.error(
      "Scenario must have { url, steps[] }. See docs/SCENARIO_FORMAT.md (TODO) or the example fixtures.",
    );
    process.exit(2);
  }

  const sessionDir = defaultSessionDir();
  const browser = new BrowserManager(sessionDir);
  await browser.launch({
    headless: true,
    viewport: scenario.viewport,
    browser: scenario.browser,
    device: scenario.device,
    recordVideo: false,
  });

  console.log(`Running scenario "${scenario.name}" against ${scenario.url}`);

  const result = await runScenario(scenario, browser);

  // Map to TestReportData so we get the same HTML/JUnit artifacts as a
  // standard auto-test run. Each step becomes a TestResult.
  const testResults: TestResult[] = result.results.map((r) => ({
    url: scenario.url,
    title: r.message.split("\n")[0] ?? r.message,
    status: r.status === "pass" ? "pass" : r.status === "fail" ? "fail" : "warning",
    category: "Scenario",
    description:
      r.status === "skipped"
        ? "Skipped after earlier failure"
        : `${r.step.type} (${r.durationMs}ms)`,
    details: r.status === "fail" ? r.message : undefined,
  }));

  const reportData: TestReportData = {
    id: `scenario-${Date.now()}`,
    url: scenario.url,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    summary: {
      totalTests: result.summary.total,
      passed: result.summary.passed,
      failed: result.summary.failed,
      warnings: result.summary.skipped,
    },
    results: testResults,
    accessibilityIssues: [],
    performanceMetrics: {
      lcp: null,
      fcp: null,
      cls: null,
      tti: null,
      ttfb: null,
      domContentLoaded: null,
      loadComplete: null,
    },
    consoleErrors: browser.getConsoleErrors(),
    screenshots: [],
    pagesExplored: [scenario.url],
  };

  const htmlPath = await generateHtmlReport(reportData, sessionDir);
  const junitPath = await generateJunitReport(reportData, sessionDir);
  await browser.close();

  console.log(`Scenario complete: ${result.summary.passed}/${result.summary.total} passed`);
  console.log(`HTML report:  ${htmlPath}`);
  console.log(`JUnit XML:    ${junitPath}`);
  console.log(`Trace:        ${browser.traceFilePath}`);

  // Print per-step status so CI logs show progress.
  for (const r of result.results) {
    const icon = r.status === "pass" ? "✓" : r.status === "fail" ? "✗" : "·";
    console.log(`  ${icon} ${r.message.split("\n")[0]}`);
  }

  process.exit(result.summary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Scenario CLI fatal error:", err);
  process.exit(1);
});
