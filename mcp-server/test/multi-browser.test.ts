import { describe, expect, it, afterEach } from "vitest";
import { existsSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { homedir } from "node:os";
import { BrowserManager } from "../src/playwright/browser-manager.js";
import { fixtureUrl } from "./helpers/browser-fixture.js";

let browser: BrowserManager | undefined;
let sessionDir: string | undefined;

afterEach(async () => {
  if (browser) await browser.close().catch(() => {});
  browser = undefined;
  if (sessionDir) rmSync(sessionDir, { recursive: true, force: true });
  sessionDir = undefined;
});

function browserAvailable(name: "chromium" | "firefox" | "webkit"): boolean {
  // Playwright caches browsers under ~/Library/Caches/ms-playwright on macOS
  // and ~/.cache/ms-playwright on Linux. We don't try to invoke the binary;
  // we just check the cache dir contains *something* matching the browser.
  const cacheDirs = [
    join(homedir(), "Library/Caches/ms-playwright"),
    join(homedir(), ".cache/ms-playwright"),
  ];
  for (const dir of cacheDirs) {
    if (!existsSync(dir)) continue;
    try {
      const entries = require("node:fs").readdirSync(dir) as string[];
      if (entries.some((e) => e.startsWith(name))) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

describe("BrowserManager — multi-browser support", () => {
  it("launches Chromium by default", async () => {
    sessionDir = mkdtempSync(join(tmpdir(), "webmobai-mb-"));
    browser = new BrowserManager(sessionDir);
    await browser.launch({ headless: true });
    expect(browser.isLaunched).toBe(true);
    // Chromium-specific UA marker.
    const ua = await browser.page.evaluate(() => navigator.userAgent);
    expect(ua).toMatch(/Chrome|HeadlessChrome/);
  });

  it("rejects an unknown browser name", async () => {
    sessionDir = mkdtempSync(join(tmpdir(), "webmobai-mb-"));
    browser = new BrowserManager(sessionDir);
    await expect(
      browser.launch({
        headless: true,
        browser: "edge" as unknown as "chromium",
      }),
    ).rejects.toThrow(/Unknown browser/);
  });

  it.runIf(browserAvailable("firefox"))(
    "launches Firefox when requested",
    async () => {
      sessionDir = mkdtempSync(join(tmpdir(), "webmobai-mb-"));
      browser = new BrowserManager(sessionDir);
      await browser.launch({ headless: true, browser: "firefox" });
      const ua = await browser.page.evaluate(() => navigator.userAgent);
      expect(ua).toMatch(/Firefox/);
    },
  );

  it.runIf(browserAvailable("webkit"))(
    "launches WebKit when requested",
    async () => {
      sessionDir = mkdtempSync(join(tmpdir(), "webmobai-mb-"));
      browser = new BrowserManager(sessionDir);
      await browser.launch({ headless: true, browser: "webkit" });
      const ua = await browser.page.evaluate(() => navigator.userAgent);
      expect(ua).toMatch(/AppleWebKit/);
      // WebKit's UA also contains "Safari" but not "Chrome".
      expect(ua).not.toMatch(/Chrome/);
    },
  );
});

describe("BrowserManager — mobile device emulation", () => {
  it("emulates iPhone 13 viewport and touch", async () => {
    sessionDir = mkdtempSync(join(tmpdir(), "webmobai-mb-"));
    browser = new BrowserManager(sessionDir);
    await browser.launch({ headless: true, device: "iPhone 13" });
    await browser.navigate(fixtureUrl("a11y-clean.html"));

    // page.viewportSize() reflects the emulated viewport — what we asked
    // Playwright for. window.innerWidth is the layout viewport which can
    // diverge from this on pages without a viewport meta tag (legacy 980px
    // mobile fallback).
    const vp = browser.page.viewportSize();
    expect(vp).toEqual({ width: 390, height: 664 });

    const { hasTouch, dpr } = await browser.page.evaluate(() => ({
      hasTouch: "ontouchstart" in window,
      dpr: window.devicePixelRatio,
    }));
    expect(hasTouch).toBe(true);
    expect(dpr).toBeGreaterThan(1);

    const ua = await browser.page.evaluate(() => navigator.userAgent);
    expect(ua).toMatch(/iPhone/);
  });

  it("emulates Pixel 5 (Android Chrome)", async () => {
    sessionDir = mkdtempSync(join(tmpdir(), "webmobai-mb-"));
    browser = new BrowserManager(sessionDir);
    await browser.launch({ headless: true, device: "Pixel 5" });
    await browser.navigate(fixtureUrl("a11y-clean.html"));

    const vp = browser.page.viewportSize();
    expect(vp).toEqual({ width: 393, height: 727 });

    const hasTouch = await browser.page.evaluate(() => "ontouchstart" in window);
    expect(hasTouch).toBe(true);

    const ua = await browser.page.evaluate(() => navigator.userAgent);
    expect(ua).toMatch(/Android/);
  });

  it("rejects an unknown device name", async () => {
    sessionDir = mkdtempSync(join(tmpdir(), "webmobai-mb-"));
    browser = new BrowserManager(sessionDir);
    await expect(
      browser.launch({ headless: true, device: "Nokia 3310" }),
    ).rejects.toThrow(/Unknown device/);
  });

  it("explicit viewport is ignored when device is set", async () => {
    sessionDir = mkdtempSync(join(tmpdir(), "webmobai-mb-"));
    browser = new BrowserManager(sessionDir);
    await browser.launch({
      headless: true,
      device: "iPhone 13",
      viewport: { width: 9999, height: 9999 },
    });
    const vp = browser.page.viewportSize();
    // Device wins; viewport should be 390x844, not 9999x9999.
    expect(vp).toEqual({ width: 390, height: 664 });
  });
});
