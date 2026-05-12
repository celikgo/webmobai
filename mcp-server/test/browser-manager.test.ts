import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserManager } from "../src/playwright/browser-manager.js";
import { PageAnalyzer } from "../src/playwright/page-analyzer.js";
import { fixtureUrl } from "./helpers/browser-fixture.js";

let browser: BrowserManager | undefined;
let sessionDir: string | undefined;

afterEach(async () => {
  if (browser) await browser.close().catch(() => {});
  browser = undefined;
  if (sessionDir) rmSync(sessionDir, { recursive: true, force: true });
  sessionDir = undefined;
});

describe("BrowserManager — network error tracking", () => {
  it("captures requestfailed events and surfaces them via getNetworkErrors", async () => {
    sessionDir = mkdtempSync(join(tmpdir(), "webmobai-test-"));
    browser = new BrowserManager(sessionDir);
    await browser.launch({ headless: true });

    await browser.navigate(fixtureUrl("broken-resources.html"));
    // Give failing requests a moment to settle.
    await new Promise((r) => setTimeout(r, 500));

    const errors = browser.getNetworkErrors();
    // We expect at least the missing image and the missing script. The fetch
    // is to a relative URL on a file:// page — environments differ on whether
    // they report it, so we don't pin to a count.
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.url.includes("missing-image.png"))).toBe(true);
  });

  it("PageAnalyzer.checkForErrors includes network errors via the manager", async () => {
    sessionDir = mkdtempSync(join(tmpdir(), "webmobai-test-"));
    browser = new BrowserManager(sessionDir);
    await browser.launch({ headless: true });
    await browser.navigate(fixtureUrl("broken-resources.html"));
    await new Promise((r) => setTimeout(r, 500));

    const analyzer = new PageAnalyzer(browser.page, browser);
    const errors = await analyzer.checkForErrors();
    expect(errors.networkErrors.length).toBeGreaterThan(0);
    // Regression: previously this was always `[]`.
    expect(errors.networkErrors).not.toEqual([]);
  });
});

describe("BrowserManager — TTI / performance metrics", () => {
  it("returns a numeric TTI, not null", async () => {
    sessionDir = mkdtempSync(join(tmpdir(), "webmobai-test-"));
    browser = new BrowserManager(sessionDir);
    await browser.launch({ headless: true });

    await browser.navigate(fixtureUrl("a11y-clean.html"));
    const analyzer = new PageAnalyzer(browser.page, browser);
    const metrics = await analyzer.getPerformanceMetrics();

    // Regression: TTI used to be hardcoded null. Even on a trivial page we
    // can fall back to domContentLoaded or FCP.
    expect(metrics.tti).not.toBeNull();
    expect(typeof metrics.tti).toBe("number");
    expect(metrics.tti!).toBeGreaterThanOrEqual(0);
  });

  it("returns the expected Web Vitals shape", async () => {
    sessionDir = mkdtempSync(join(tmpdir(), "webmobai-test-"));
    browser = new BrowserManager(sessionDir);
    await browser.launch({ headless: true });
    await browser.navigate(fixtureUrl("a11y-clean.html"));
    const analyzer = new PageAnalyzer(browser.page, browser);
    const metrics = await analyzer.getPerformanceMetrics();

    // The shape contract — these keys must exist even if some are null.
    expect(metrics).toHaveProperty("lcp");
    expect(metrics).toHaveProperty("fcp");
    expect(metrics).toHaveProperty("cls");
    expect(metrics).toHaveProperty("tti");
    expect(metrics).toHaveProperty("ttfb");
    expect(metrics).toHaveProperty("domContentLoaded");
    expect(metrics).toHaveProperty("loadComplete");
  });
});
