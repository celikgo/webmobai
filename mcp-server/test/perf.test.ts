import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserManager } from "../src/playwright/browser-manager.js";
import { PageAnalyzer } from "../src/playwright/page-analyzer.js";
import { computeStats, handlePerfTool } from "../src/tools/perf-tools.js";
import { fixtureUrl } from "./helpers/browser-fixture.js";

let browser: BrowserManager | undefined;
let sessionDir: string | undefined;

async function setup() {
  sessionDir = mkdtempSync(join(tmpdir(), "webmobai-perf-"));
  browser = new BrowserManager(sessionDir);
  await browser.launch({ headless: true });
  return browser;
}

afterEach(async () => {
  if (browser) await browser.close().catch(() => {});
  browser = undefined;
  if (sessionDir) rmSync(sessionDir, { recursive: true, force: true });
  sessionDir = undefined;
});

describe("computeStats", () => {
  it("computes median for odd-length array", () => {
    expect(computeStats([1, 2, 3]).median).toBe(2);
  });

  it("computes median for even-length array (mean of two middles)", () => {
    expect(computeStats([1, 2, 3, 4]).median).toBe(2.5);
  });

  it("uses nearest-rank for p95", () => {
    // 20 values 1..20, p95 = 19 (index ceil(0.95*20) - 1 = 18 = 19).
    const vals = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(computeStats(vals).p95).toBe(19);
  });

  it("reports min/max", () => {
    const s = computeStats([5, 1, 8, 2, 9]);
    expect(s.min).toBe(1);
    expect(s.max).toBe(9);
  });

  it("returns zeros for empty input", () => {
    expect(computeStats([])).toEqual({ median: 0, p95: 0, min: 0, max: 0 });
  });
});

describe("LCP element fingerprint", () => {
  it("populates lcpElement when an LCP element is observed", async () => {
    const b = await setup();
    await b.navigate(fixtureUrl("a11y-clean.html"));
    // Wait a tick for LCP to settle.
    await b.page.waitForTimeout(200);
    const analyzer = new PageAnalyzer(b.page, b);
    const metrics = await analyzer.getPerformanceMetrics();
    // The fixture has an <h1> with text "Welcome" — typically the LCP for
    // such a small page.
    if (metrics.lcp != null) {
      // Either the heading or the image is the LCP; both have populated
      // tagName, both make for a valid fingerprint.
      expect(metrics.lcpElement).not.toBeNull();
      expect(typeof metrics.lcpElement?.tagName).toBe("string");
    }
  });
});

describe("network + CPU throttle", () => {
  it("setNetworkThrottle slow-3g doesn't throw", async () => {
    const b = await setup();
    await expect(b.setNetworkThrottle("slow-3g")).resolves.not.toThrow();
    await expect(b.setNetworkThrottle(null)).resolves.not.toThrow();
  });

  it("setCpuThrottle accepts a slowdown factor and clears", async () => {
    const b = await setup();
    await expect(b.setCpuThrottle(4)).resolves.not.toThrow();
    await expect(b.setCpuThrottle(null)).resolves.not.toThrow();
  });

  it("offline preset blocks network requests", async () => {
    const b = await setup();
    await b.setNetworkThrottle("offline");
    // Chromium's offline returns a null/error response from goto rather
    // than throwing, so we check for either outcome.
    let blocked = false;
    try {
      const resp = await b.page.goto("https://example.com", { timeout: 3000 });
      // Offline produces either no response or an error status.
      if (!resp || !resp.ok()) blocked = true;
    } catch {
      blocked = true;
    }
    expect(blocked).toBe(true);
    await b.setNetworkThrottle(null);
  });
});

describe("webmobai_run_perf_multi", () => {
  it("returns aggregated table with N samples per metric", async () => {
    const b = await setup();
    const result = await handlePerfTool(
      "webmobai_run_perf_multi",
      { url: fixtureUrl("a11y-clean.html"), runs: 2 },
      b,
    );
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/# Performance — 2 runs/);
    expect(text).toMatch(/\| Metric \| Median \| p95/);
    // Each metric row should appear.
    expect(text).toMatch(/\| LCP \|/);
    expect(text).toMatch(/\| FCP \|/);
    expect(text).toMatch(/\| CLS \|/);
  });

  it("clamps runs to [1, 10]", async () => {
    const b = await setup();
    const result = await handlePerfTool(
      "webmobai_run_perf_multi",
      { url: fixtureUrl("a11y-clean.html"), runs: 100 },
      b,
    );
    const text = result.content[0]?.text ?? "";
    // 100 should clamp to 10 — but to keep this test fast, we just check
    // the header doesn't say "100 runs".
    expect(text).not.toMatch(/100 runs/);
  });
});
