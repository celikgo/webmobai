import {
  BrowserManager,
  defaultSessionDir,
} from "../playwright/browser-manager.js";
import { runScenario } from "../scenario/runner.js";
import type { ScenarioResult } from "../scenario/types.js";
import { logger } from "../utils/logger.js";
import type { RunnableScenario } from "./types.js";

export interface SuiteRunResult {
  startedAt: number;
  completedAt: number;
  scenarios: Array<{
    name: string;
    tags: string[];
    sourcePath?: string;
    sessionDir: string;
    result: ScenarioResult;
  }>;
  summary: {
    totalScenarios: number;
    passedScenarios: number;
    failedScenarios: number;
    totalSteps: number;
    passedSteps: number;
    failedSteps: number;
    skippedSteps: number;
  };
}

/**
 * Run a list of scenarios with bounded concurrency. Each scenario gets a
 * fresh BrowserManager (independent browser + context + session dir).
 * Concurrency is capped by `workers`; the pool keeps that many scenarios
 * in-flight until the queue drains.
 *
 * Per-scenario isolation: each gets its own session dir, so screenshots,
 * recordings, and trace files never collide. We surface the session dir on
 * each result so the CLI can write per-scenario artifacts alongside the
 * aggregate suite report.
 *
 * Error handling: a scenario throwing (e.g., browser launch failed) is
 * captured as a failed result with one synthetic "launch failed" step —
 * the whole suite continues so a single browser issue doesn't kill the
 * rest of the run.
 */
export async function runSuite(
  scenarios: RunnableScenario[],
  options: { workers?: number; onProgress?: (event: ProgressEvent) => void } = {},
): Promise<SuiteRunResult> {
  const startedAt = Date.now();
  const workers = Math.max(1, options.workers ?? 4);
  const queue = [...scenarios];
  const results: SuiteRunResult["scenarios"] = [];

  // Promise-pool: at most `workers` scenarios in flight.
  const inFlight = new Set<Promise<void>>();
  while (queue.length > 0 || inFlight.size > 0) {
    while (inFlight.size < workers && queue.length > 0) {
      const next = queue.shift()!;
      const p = runOne(next, options.onProgress).then((r) => {
        results.push(r);
      });
      inFlight.add(p);
      p.finally(() => inFlight.delete(p));
    }
    if (inFlight.size > 0) {
      await Promise.race(inFlight);
    }
  }

  const summary = summarize(results);
  return {
    startedAt,
    completedAt: Date.now(),
    scenarios: results,
    summary,
  };
}

export interface ProgressEvent {
  type: "scenario-start" | "scenario-complete";
  name: string;
  index: number;
  total: number;
  status?: "pass" | "fail";
}

async function runOne(
  entry: RunnableScenario,
  onProgress?: (event: ProgressEvent) => void,
): Promise<SuiteRunResult["scenarios"][number]> {
  const sessionDir = defaultSessionDir();
  const browser = new BrowserManager(sessionDir);

  onProgress?.({
    type: "scenario-start",
    name: entry.scenario.name,
    index: 0,
    total: 0,
  });

  try {
    await browser.launch({
      headless: true,
      browser: entry.scenario.browser,
      device: entry.scenario.device,
      viewport: entry.scenario.viewport,
      recordVideo: false,
    });
    const result = await runScenario(entry.scenario, browser);
    onProgress?.({
      type: "scenario-complete",
      name: entry.scenario.name,
      index: 0,
      total: 0,
      status: result.summary.failed > 0 ? "fail" : "pass",
    });
    return {
      name: entry.scenario.name,
      tags: entry.tags,
      sourcePath: entry.sourcePath,
      sessionDir,
      result,
    };
  } catch (err) {
    // Launch / catastrophic failure. Emit a synthetic result so the
    // aggregate report still includes this scenario.
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Scenario "${entry.scenario.name}" failed to run: ${msg}`);
    const now = Date.now();
    onProgress?.({
      type: "scenario-complete",
      name: entry.scenario.name,
      index: 0,
      total: 0,
      status: "fail",
    });
    return {
      name: entry.scenario.name,
      tags: entry.tags,
      sourcePath: entry.sourcePath,
      sessionDir,
      result: {
        scenarioName: entry.scenario.name,
        url: entry.scenario.url,
        startedAt: now,
        completedAt: now,
        results: [
          {
            step: { type: "navigate", url: entry.scenario.url },
            status: "fail",
            message: `Scenario failed to launch: ${msg}`,
            durationMs: 0,
          },
        ],
        summary: { total: 1, passed: 0, failed: 1, skipped: 0 },
      },
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

function summarize(
  results: SuiteRunResult["scenarios"],
): SuiteRunResult["summary"] {
  let totalSteps = 0;
  let passedSteps = 0;
  let failedSteps = 0;
  let skippedSteps = 0;
  let passedScenarios = 0;
  let failedScenarios = 0;

  for (const r of results) {
    totalSteps += r.result.summary.total;
    passedSteps += r.result.summary.passed;
    failedSteps += r.result.summary.failed;
    skippedSteps += r.result.summary.skipped;
    if (r.result.summary.failed > 0) failedScenarios++;
    else passedScenarios++;
  }

  return {
    totalScenarios: results.length,
    passedScenarios,
    failedScenarios,
    totalSteps,
    passedSteps,
    failedSteps,
    skippedSteps,
  };
}
