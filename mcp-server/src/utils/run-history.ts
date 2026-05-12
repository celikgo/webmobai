import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Run history is a per-machine JSON file at ~/.webmobai/history.json.
 * Each entry is one run summary, keyed only by URL (we don't store
 * credentials or other config). This is the substrate for regression
 * detection: "is LCP on /pricing notably worse than it usually is?"
 *
 * Format is intentionally append-only. We don't deduplicate, edit, or
 * delete entries — the user can prune the file by hand if it grows too
 * large. Default cap is 200 runs total; older entries are dropped when
 * appending past the cap.
 */

export interface RunHistoryEntry {
  id: string;
  url: string;
  timestamp: number;
  durationMs: number;
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    warnings: number;
  };
  metrics: {
    lcp: number | null;
    fcp: number | null;
    cls: number | null;
    tti: number | null;
    ttfb: number | null;
  };
  accessibilityIssueCount: number;
  consoleErrorCount: number;
  networkErrorCount: number;
  browser?: string;
  device?: string;
}

const MAX_ENTRIES = 200;

export function defaultHistoryPath(): string {
  return join(homedir(), ".webmobai", "history.json");
}

export async function readRunHistory(
  path: string = defaultHistoryPath(),
): Promise<RunHistoryEntry[]> {
  if (!existsSync(path)) return [];
  try {
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Corrupted history file: treat as empty rather than crashing the run.
    return [];
  }
}

export async function appendRunHistory(
  entry: RunHistoryEntry,
  path: string = defaultHistoryPath(),
): Promise<void> {
  const existing = await readRunHistory(path);
  const next = [...existing, entry].slice(-MAX_ENTRIES);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(next, null, 2), "utf-8");
}

export interface RegressionFinding {
  metric: keyof RunHistoryEntry["metrics"] | "consoleErrorCount" | "accessibilityIssueCount";
  current: number | null;
  baseline: number | null;
  deltaPct: number | null;
  severity: "regression" | "improvement" | "noise";
  message: string;
}

export interface RegressionReport {
  url: string;
  baselineRuns: number;
  findings: RegressionFinding[];
}

/**
 * Compute regressions for a run by comparing each metric to the median of
 * the previous `baselineRuns` runs for the same URL (default 5).
 *
 * Threshold: deviations within ±10% are noise (Web Vitals single-run
 * variance is typically ±15-20%, so we're conservative). For perf metrics,
 * a higher number is worse; for fail/error counts, a higher number is
 * worse. Improvements are noted but not flagged as regressions.
 */
export function detectRegressions(
  current: RunHistoryEntry,
  history: RunHistoryEntry[],
  options: { baselineRuns?: number; thresholdPct?: number } = {},
): RegressionReport {
  const baselineRuns = options.baselineRuns ?? 5;
  const thresholdPct = options.thresholdPct ?? 10;

  // Use prior runs against the same URL, excluding the current entry.
  const priors = history
    .filter((h) => h.url === current.url && h.id !== current.id)
    .slice(-baselineRuns);

  const findings: RegressionFinding[] = [];

  function checkMetric(
    name: RegressionFinding["metric"],
    currentValue: number | null,
    priorValues: (number | null)[],
    higherIsWorse = true,
  ) {
    const valid = priorValues.filter((v): v is number => v != null);
    if (valid.length < 2 || currentValue == null) {
      // Not enough data to declare anything.
      findings.push({
        metric: name,
        current: currentValue,
        baseline: null,
        deltaPct: null,
        severity: "noise",
        message: `${name}: insufficient history (need 2+ runs, have ${valid.length})`,
      });
      return;
    }
    const baseline = median(valid);
    if (baseline === 0) {
      // Avoid div by zero — if baseline is 0 and current isn't, it's a
      // qualitative regression. Otherwise it's noise.
      const severity =
        currentValue === 0
          ? "noise"
          : higherIsWorse
            ? "regression"
            : "improvement";
      findings.push({
        metric: name,
        current: currentValue,
        baseline: 0,
        deltaPct: null,
        severity,
        message: `${name}: ${severity} — baseline was 0, current is ${currentValue}`,
      });
      return;
    }
    const deltaPct = ((currentValue - baseline) / baseline) * 100;
    let severity: RegressionFinding["severity"];
    if (Math.abs(deltaPct) < thresholdPct) {
      severity = "noise";
    } else if ((higherIsWorse && deltaPct > 0) || (!higherIsWorse && deltaPct < 0)) {
      severity = "regression";
    } else {
      severity = "improvement";
    }
    findings.push({
      metric: name,
      current: currentValue,
      baseline,
      deltaPct,
      severity,
      message: `${name}: ${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}% vs baseline ${baseline.toFixed(0)} (${severity})`,
    });
  }

  // Web Vitals: higher = worse.
  for (const key of ["lcp", "fcp", "cls", "tti", "ttfb"] as const) {
    checkMetric(
      key,
      current.metrics[key],
      priors.map((p) => p.metrics[key]),
      true,
    );
  }
  // Error counts: higher = worse.
  checkMetric(
    "consoleErrorCount",
    current.consoleErrorCount,
    priors.map((p) => p.consoleErrorCount),
    true,
  );
  checkMetric(
    "accessibilityIssueCount",
    current.accessibilityIssueCount,
    priors.map((p) => p.accessibilityIssueCount),
    true,
  );

  return {
    url: current.url,
    baselineRuns: priors.length,
    findings,
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}
