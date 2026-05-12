import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendRunHistory,
  detectRegressions,
  readRunHistory,
  type RunHistoryEntry,
} from "../src/utils/run-history.js";

let dir: string | undefined;
let path: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
  path = undefined;
});

function entry(over: Partial<RunHistoryEntry> = {}): RunHistoryEntry {
  return {
    id: `r-${Math.random().toString(36).slice(2, 8)}`,
    url: "https://example.com/",
    timestamp: Date.now(),
    durationMs: 5000,
    summary: { totalTests: 10, passed: 9, failed: 0, warnings: 1 },
    metrics: {
      lcp: 2000,
      fcp: 800,
      cls: 0.05,
      tti: 2500,
      ttfb: 200,
    },
    accessibilityIssueCount: 2,
    consoleErrorCount: 0,
    networkErrorCount: 0,
    ...over,
  };
}

describe("run history persistence", () => {
  it("returns [] when the history file doesn't exist", async () => {
    dir = mkdtempSync(join(tmpdir(), "webmobai-hist-"));
    path = join(dir, "history.json");
    const result = await readRunHistory(path);
    expect(result).toEqual([]);
  });

  it("appends entries and reads them back", async () => {
    dir = mkdtempSync(join(tmpdir(), "webmobai-hist-"));
    path = join(dir, "history.json");
    await appendRunHistory(entry({ id: "a" }), path);
    await appendRunHistory(entry({ id: "b" }), path);
    await appendRunHistory(entry({ id: "c" }), path);
    const out = await readRunHistory(path);
    expect(out.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("caps history at the configured limit (most recent kept)", async () => {
    dir = mkdtempSync(join(tmpdir(), "webmobai-hist-"));
    path = join(dir, "history.json");
    // Cap is 200. Write 205, expect the last 200 to survive.
    for (let i = 0; i < 205; i++) {
      await appendRunHistory(entry({ id: `r${i}` }), path);
    }
    const out = await readRunHistory(path);
    expect(out).toHaveLength(200);
    expect(out[0]!.id).toBe("r5");
    expect(out[out.length - 1]!.id).toBe("r204");
  });

  it("treats a corrupted history file as empty", async () => {
    dir = mkdtempSync(join(tmpdir(), "webmobai-hist-"));
    path = join(dir, "history.json");
    // Write garbage.
    const fs = await import("node:fs/promises");
    await fs.writeFile(path, "{this is not valid json");
    const result = await readRunHistory(path);
    expect(result).toEqual([]);
  });
});

describe("regression detection", () => {
  const url = "https://example.com/";

  function priors(n: number, lcp: number): RunHistoryEntry[] {
    return Array.from({ length: n }, (_, i) =>
      entry({ id: `p${i}`, url, metrics: { ...entry().metrics, lcp } }),
    );
  }

  it("flags a regression when current LCP is >threshold worse than baseline", () => {
    const history = priors(5, 2000);
    const current = entry({ id: "current", url, metrics: { ...entry().metrics, lcp: 2500 } });
    const report = detectRegressions(current, [...history, current], {
      thresholdPct: 10,
    });
    const lcpFinding = report.findings.find((f) => f.metric === "lcp");
    expect(lcpFinding?.severity).toBe("regression");
    expect(lcpFinding?.deltaPct).toBeCloseTo(25, 0);
  });

  it("flags an improvement when current is meaningfully better", () => {
    const history = priors(5, 3000);
    const current = entry({ id: "current", url, metrics: { ...entry().metrics, lcp: 1500 } });
    const report = detectRegressions(current, [...history, current], {
      thresholdPct: 10,
    });
    const lcpFinding = report.findings.find((f) => f.metric === "lcp");
    expect(lcpFinding?.severity).toBe("improvement");
  });

  it("classifies small swings as noise", () => {
    const history = priors(5, 2000);
    // 5% worse — within ±10% threshold.
    const current = entry({ id: "current", url, metrics: { ...entry().metrics, lcp: 2100 } });
    const report = detectRegressions(current, [...history, current], {
      thresholdPct: 10,
    });
    const lcpFinding = report.findings.find((f) => f.metric === "lcp");
    expect(lcpFinding?.severity).toBe("noise");
  });

  it("reports insufficient history when too few priors exist", () => {
    const current = entry({ id: "current", url });
    const report = detectRegressions(current, [current], { thresholdPct: 10 });
    expect(
      report.findings.every(
        (f) => f.severity === "noise" && f.message.includes("insufficient history"),
      ),
    ).toBe(true);
  });

  it("flags new console errors as a regression when baseline was 0", () => {
    const history = priors(5, 2000).map((e) => ({ ...e, consoleErrorCount: 0 }));
    const current = entry({
      id: "current",
      url,
      consoleErrorCount: 3,
    });
    const report = detectRegressions(current, [...history, current], {
      thresholdPct: 10,
    });
    const finding = report.findings.find((f) => f.metric === "consoleErrorCount");
    expect(finding?.severity).toBe("regression");
  });

  it("uses median, not mean, so outliers don't skew baseline", () => {
    // Four "normal" runs at 2000ms LCP, one outlier at 8000ms.
    const history: RunHistoryEntry[] = [
      entry({ id: "p1", url, metrics: { ...entry().metrics, lcp: 2000 } }),
      entry({ id: "p2", url, metrics: { ...entry().metrics, lcp: 2000 } }),
      entry({ id: "p3", url, metrics: { ...entry().metrics, lcp: 2000 } }),
      entry({ id: "p4", url, metrics: { ...entry().metrics, lcp: 2000 } }),
      entry({ id: "p5", url, metrics: { ...entry().metrics, lcp: 8000 } }),
    ];
    // Current at 2100 — within 10% of the median 2000 (noise) but if mean
    // were used (3200), 2100 would look 34% better → false "improvement".
    const current = entry({ id: "current", url, metrics: { ...entry().metrics, lcp: 2100 } });
    const report = detectRegressions(current, [...history, current], {
      thresholdPct: 10,
    });
    const finding = report.findings.find((f) => f.metric === "lcp");
    expect(finding?.severity).toBe("noise");
    expect(finding?.baseline).toBe(2000);
  });

  it("scopes baseline to entries with the same URL", () => {
    const otherUrlPriors = Array.from({ length: 5 }, (_, i) =>
      entry({
        id: `o${i}`,
        url: "https://other.example.com/",
        metrics: { ...entry().metrics, lcp: 9000 },
      }),
    );
    const samePriors = priors(3, 2000);
    const current = entry({ id: "current", url, metrics: { ...entry().metrics, lcp: 2200 } });
    const report = detectRegressions(
      current,
      [...otherUrlPriors, ...samePriors, current],
      { thresholdPct: 10 },
    );
    // Despite the 9000ms outliers on the other URL, the baseline should be
    // the same-URL 2000ms median.
    const finding = report.findings.find((f) => f.metric === "lcp");
    expect(finding?.baseline).toBe(2000);
  });
});
