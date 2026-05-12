import {
  chromium,
  firefox,
  webkit,
  devices,
  type Browser,
  type BrowserContext,
  type Page,
  type BrowserType,
} from "playwright";
import { mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { logger } from "../utils/logger.js";
import type { ConsoleError } from "../types.js";
import {
  type ElementSnapshot,
  findSimilarElements,
  snapshotElement,
} from "./element-snapshot.js";

export type BrowserName = "chromium" | "firefox" | "webkit";

const BROWSERS: Record<BrowserName, BrowserType> = {
  chromium,
  firefox,
  webkit,
};

/**
 * Chrome DevTools-style network preset values. Numbers mirror the
 * built-in presets in Chrome DevTools so users get familiar behavior.
 *
 *   throughput is in bytes/sec; latency in milliseconds.
 */
const NETWORK_PRESETS = {
  "slow-3g": {
    offline: false,
    latency: 2000,
    downloadThroughput: (500 * 1024) / 8, // 500 Kbps
    uploadThroughput: (500 * 1024) / 8,
  },
  "fast-3g": {
    offline: false,
    latency: 562.5,
    downloadThroughput: (1.5 * 1024 * 1024) / 8, // 1.5 Mbps
    uploadThroughput: (750 * 1024) / 8,
  },
  "slow-4g": {
    offline: false,
    latency: 400,
    downloadThroughput: (4 * 1024 * 1024) / 8, // 4 Mbps
    uploadThroughput: (3 * 1024 * 1024) / 8,
  },
  offline: {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  },
} as const;

export function defaultSessionDir(): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return join(tmpdir(), `webmobai-${id}`);
}

export interface NetworkError {
  url: string;
  method: string;
  failure: string;
  resourceType: string;
  timestamp: number;
}

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private _page: Page | null = null;
  private consoleErrors: ConsoleError[] = [];
  private networkErrors: NetworkError[] = [];
  private screenshotDir: string;
  private recordingDir: string;
  private tracePath: string;
  private traceEnabled = false;
  private screenshotCounter = 0;
  // Self-healing infra: when a selector succeeds, we record a fingerprint
  // of the element. When that same selector later misses, we can rank
  // current page elements by similarity to the fingerprint and propose
  // alternative selectors back to the caller.
  private selectorSnapshots = new Map<string, ElementSnapshot>();
  // CDP session held across throttle calls so emulation persists; detaching
  // voids the settings.
  private _throttleCdp: import("playwright").CDPSession | null = null;
  readonly sessionDir: string;

  constructor(baseDir: string = defaultSessionDir()) {
    this.sessionDir = baseDir;
    this.screenshotDir = join(baseDir, "screenshots");
    this.recordingDir = join(baseDir, "recordings");
    this.tracePath = join(baseDir, "trace.zip");
  }

  /**
   * Absolute path where the Playwright trace will be saved on close.
   * Drop it into https://trace.playwright.dev to time-travel through the
   * session: DOM snapshots per action, network log, console log, source
   * locations.
   */
  get traceFilePath(): string {
    return this.tracePath;
  }

  get page(): Page {
    if (!this._page) throw new Error("Browser not launched. Call launch() first.");
    return this._page;
  }

  get isLaunched(): boolean {
    return this._page !== null && !this._page.isClosed();
  }

  async launch(options?: {
    headless?: boolean;
    viewport?: { width: number; height: number };
    recordVideo?: boolean;
    browser?: BrowserName;
    device?: string;
  }): Promise<void> {
    const {
      headless = false,
      viewport = { width: 1280, height: 720 },
      recordVideo = false,
      browser: browserName = "chromium",
      device,
    } = options ?? {};

    await mkdir(this.screenshotDir, { recursive: true });
    await mkdir(this.recordingDir, { recursive: true });

    const browserType = BROWSERS[browserName];
    if (!browserType) {
      throw new Error(
        `Unknown browser "${browserName}". Use one of: chromium, firefox, webkit.`,
      );
    }

    logger.info(`Launching ${browserName} browser...`);

    // Chromium-only launch args; Firefox/WebKit ignore these silently in
    // Playwright but we keep them isolated to be tidy.
    const launchArgs =
      browserName === "chromium"
        ? [
            "--disable-blink-features=AutomationControlled",
            "--no-first-run",
            "--no-default-browser-check",
          ]
        : undefined;

    this.browser = await browserType.launch({
      headless,
      args: launchArgs,
    });

    // Device preset (Pixel 5, iPhone 13, etc.) supplies viewport, UA,
    // devicePixelRatio, isMobile, hasTouch — the bits that make "mobile
    // emulation" meaningfully different from just resizing.
    let deviceContextOptions: Parameters<Browser["newContext"]>[0] = {};
    if (device) {
      const preset = devices[device];
      if (!preset) {
        throw new Error(
          `Unknown device "${device}". See Playwright's device list (devices["iPhone 13"], etc.).`,
        );
      }
      deviceContextOptions = preset;
      logger.info(
        `Emulating device "${device}" (${preset.viewport?.width}x${preset.viewport?.height}, mobile=${preset.isMobile})`,
      );
    }

    const contextOptions: Parameters<Browser["newContext"]>[0] = {
      ...deviceContextOptions,
      // Explicit viewport overrides the device preset only when no device is
      // configured — otherwise the device's viewport wins (you want the
      // iPhone 13's 390x844, not 1280x720 with iPhone UA).
      ...(device ? {} : { viewport }),
      // UA precedence:
      //   1. Device preset's UA (already in deviceContextOptions, takes
      //      effect via the spread above)
      //   2. For chromium specifically, our anti-automation desktop UA so
      //      sites don't bucket us as a headless bot
      //   3. Otherwise, let Playwright use the browser's native UA so e.g.
      //      Firefox shows as Firefox and WebKit as Safari
      ...(device || browserName !== "chromium"
        ? {}
        : {
            userAgent:
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          }),
      locale: deviceContextOptions.locale ?? "en-US",
      timezoneId: deviceContextOptions.timezoneId ?? "America/New_York",
      ignoreHTTPSErrors: true,
    };

    if (recordVideo) {
      contextOptions.recordVideo = {
        dir: this.recordingDir,
        // Use the resolved viewport (device-derived or explicit) for video
        // sizing so frames aren't letterboxed.
        size: contextOptions.viewport ?? viewport,
      };
    }

    this.context = await this.browser.newContext(contextOptions);

    // Start Playwright tracing. Captures DOM snapshots before/after each
    // action, network log, console log, and Playwright source locations.
    // The trace is saved on close() and can be opened at
    // https://trace.playwright.dev for time-travel debugging.
    try {
      await this.context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true,
      });
      this.traceEnabled = true;
    } catch (err) {
      logger.warn(
        `Tracing failed to start: ${err instanceof Error ? err.message : String(err)}. Continuing without trace.`,
      );
    }

    // Subscribe to long-task and event-timing entries before any page
    // script runs so we can compute TTI and INP later. Each observer
    // populates the buffer that getEntriesByType reads from. Without this,
    // those entries are dropped on the floor.
    //
    // We also expose `__webmobai_longestInteraction` on the window so INP
    // computation has somewhere to read the worst observed interaction
    // duration from once the page is settled.
    await this.context.addInitScript(() => {
      try {
        new PerformanceObserver(() => {}).observe({
          type: "longtask",
          buffered: true,
        });
      } catch {
        // longtask not supported (e.g., Firefox/WebKit) — silently skip.
      }

      try {
        // INP is the worst (or near-worst) interaction's full latency.
        // Spec uses the 98th percentile; we approximate with max over the
        // session, then the page-analyzer takes the max here.
        (window as { __webmobai_longestInteraction?: number }).__webmobai_longestInteraction = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const e = entry as PerformanceEntry & { interactionId?: number; duration: number };
            if (!e.interactionId) continue;
            const w = window as { __webmobai_longestInteraction?: number };
            if (e.duration > (w.__webmobai_longestInteraction ?? 0)) {
              w.__webmobai_longestInteraction = e.duration;
            }
          }
        }).observe({ type: "event", durationThreshold: 16, buffered: true } as PerformanceObserverInit);
      } catch {
        // event-timing not supported on this browser — INP will report null.
      }
    });

    this._page = await this.context.newPage();

    // Capture console errors
    this._page.on("console", (msg) => {
      const type = msg.type();
      if (type === "error" || type === "warning") {
        this.consoleErrors.push({
          type: type as "error" | "warning",
          message: msg.text(),
          url: this._page?.url() ?? "",
          timestamp: Date.now(),
        });
      }
    });

    this._page.on("pageerror", (err) => {
      this.consoleErrors.push({
        type: "error",
        message: err.message,
        url: this._page?.url() ?? "",
        timestamp: Date.now(),
      });
    });

    // Capture failed network requests (404s, DNS failures, aborts, blocked).
    this._page.on("requestfailed", (req) => {
      this.networkErrors.push({
        url: req.url(),
        method: req.method(),
        failure: req.failure()?.errorText ?? "unknown",
        resourceType: req.resourceType(),
        timestamp: Date.now(),
      });
    });

    // Also treat any non-2xx/3xx response as a network error worth surfacing.
    this._page.on("response", (res) => {
      if (res.status() >= 400) {
        this.networkErrors.push({
          url: res.url(),
          method: res.request().method(),
          failure: `HTTP ${res.status()} ${res.statusText()}`,
          resourceType: res.request().resourceType(),
          timestamp: Date.now(),
        });
      }
    });

    const finalViewport = contextOptions.viewport ?? viewport;
    logger.info(
      `Browser launched (${browserName}${device ? `/${device}` : ""}, headed: ${!headless}, viewport: ${finalViewport?.width}x${finalViewport?.height})`,
    );
  }

  async navigate(url: string): Promise<{ title: string; url: string }> {
    logger.info(`Navigating to: ${url}`);
    await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await this.page.waitForLoadState("networkidle").catch(() => {
      // Network idle timeout is ok — page may have long-polling
    });
    const title = await this.page.title();
    return { title, url: this.page.url() };
  }

  /**
   * Throttle network conditions. Offline uses Playwright's BrowserContext
   * setOffline API (works across all engines). Bandwidth/latency presets
   * use CDP Network.emulateNetworkConditions (Chromium only) — Firefox and
   * WebKit silently ignore those, which is at least honest.
   *
   * The CDP session is kept alive on `this` because detaching voids the
   * emulation. setNetworkThrottle(null) tears it down and re-enables
   * online.
   */
  async setNetworkThrottle(
    preset: "slow-3g" | "fast-3g" | "slow-4g" | "offline" | null,
  ): Promise<void> {
    if (!this._page) throw new Error("Browser not launched.");
    const context = this.page.context();

    if (preset === null) {
      await context.setOffline(false);
      if (this._throttleCdp) {
        try {
          await this._throttleCdp.send("Network.emulateNetworkConditions", {
            offline: false,
            latency: 0,
            downloadThroughput: -1,
            uploadThroughput: -1,
          });
        } catch {
          // ignore — cdp session may already be detached
        }
      }
      return;
    }

    if (preset === "offline") {
      await context.setOffline(true);
      logger.info("Network throttled to offline (via setOffline)");
      return;
    }

    // Bandwidth/latency emulation via CDP. Reuse a single session per
    // BrowserManager — detaching loses the settings.
    if (!this._throttleCdp) {
      this._throttleCdp = await context.newCDPSession(this._page);
      await this._throttleCdp.send("Network.enable");
    }
    const settings = NETWORK_PRESETS[preset];
    await this._throttleCdp.send("Network.emulateNetworkConditions", settings);
    logger.info(`Network throttled to ${preset}`);
  }

  /**
   * Throttle CPU by a slowdown factor. 4 means "render at 1/4 CPU speed",
   * mirroring Lighthouse's mobile profile. Pass 1 (or null) to reset.
   * Chromium-only.
   */
  async setCpuThrottle(slowdownFactor: number | null): Promise<void> {
    if (!this._page) throw new Error("Browser not launched.");
    const client = await this.page.context().newCDPSession(this._page);
    try {
      await client.send("Emulation.setCPUThrottlingRate", {
        rate: slowdownFactor ?? 1,
      });
      logger.info(`CPU throttle rate ${slowdownFactor ?? 1}x`);
    } finally {
      await client.detach().catch(() => {});
    }
  }

  async click(selector: string): Promise<void> {
    logger.info(`Clicking: ${selector}`);
    const priorSnap = await snapshotElement(this.page, selector);
    try {
      await this.page.click(selector, { timeout: 10000 });
    } catch (err) {
      throw await this.buildSelectorError(selector, "click", err);
    }
    // Remember the snapshot for future self-healing on this selector.
    if (priorSnap) this.selectorSnapshots.set(selector, priorSnap);
    await this.page.waitForLoadState("domcontentloaded").catch(() => {});
  }

  async type(selector: string, text: string): Promise<void> {
    logger.info(`Typing into: ${selector}`);
    const priorSnap = await snapshotElement(this.page, selector);
    try {
      await this.page.fill(selector, text);
    } catch (err) {
      throw await this.buildSelectorError(selector, "type", err);
    }
    if (priorSnap) this.selectorSnapshots.set(selector, priorSnap);
  }

  /**
   * Build a self-healing diagnostic for a failed selector op. Returns an
   * Error whose message embeds:
   *   - the original Playwright failure reason
   *   - the prior snapshot of this selector (if we ever saw it succeed)
   *   - up to 5 candidate elements scored by similarity, with suggested
   *     selectors the caller can retry with
   *
   * Callers (MCP tool handlers, scenario runner, Claude) read this and
   * decide whether to retry with a different selector.
   */
  private async buildSelectorError(
    selector: string,
    operation: string,
    underlyingErr: unknown,
  ): Promise<Error> {
    const baseMsg =
      underlyingErr instanceof Error
        ? underlyingErr.message
        : String(underlyingErr);
    const prior = this.selectorSnapshots.get(selector);
    const candidates = prior
      ? await findSimilarElements(this.page, prior, 5).catch(() => [])
      : [];

    const lines = [
      `Selector "${selector}" failed during ${operation}: ${baseMsg.split("\n")[0]}`,
    ];

    if (prior) {
      lines.push("");
      lines.push("Prior snapshot of this selector (last time it worked):");
      lines.push(
        `  ${prior.tag}${prior.testid ? `[data-testid=${prior.testid}]` : ""} role=${prior.role ?? "?"} text="${prior.text.slice(0, 60)}"`,
      );
    }

    if (candidates.length > 0) {
      lines.push("");
      lines.push(`Suggested replacements (${candidates.length}, ranked by similarity):`);
      for (const c of candidates) {
        lines.push(
          `  [score ${c.score}] ${c.suggestedSelector}  — ${c.snapshot.tag} text="${c.snapshot.text.slice(0, 50)}"`,
        );
      }
      lines.push("");
      lines.push(
        "Retry with one of the suggested selectors above.",
      );
    } else if (prior) {
      lines.push("");
      lines.push(
        "No similar elements found — the page may have navigated away or the element was removed.",
      );
    }

    return new Error(lines.join("\n"));
  }

  /**
   * Public API for callers (assertion tools, scenario runner) that catch
   * their own selector failure and want a self-healing diagnostic string.
   * Returns plain text (already formatted) suitable for tool response.
   */
  async describeSelectorFailure(
    selector: string,
    operation: string,
    underlying: string,
  ): Promise<string> {
    const err = await this.buildSelectorError(selector, operation, new Error(underlying));
    return err.message;
  }

  /**
   * Returns the recorded snapshot for a selector, if any. Used by tests and
   * by the scenario runner to verify self-healing recorded a fingerprint.
   */
  getSelectorSnapshot(selector: string): ElementSnapshot | undefined {
    return this.selectorSnapshots.get(selector);
  }

  async scroll(direction: "down" | "up" = "down", amount: number = 500): Promise<void> {
    logger.info(`Scrolling ${direction} by ${amount}px`);
    await this.page.evaluate(
      ({ dir, amt }) => window.scrollBy(0, dir === "down" ? amt : -amt),
      { dir: direction, amt: amount },
    );
    // Wait for any lazy-loaded content
    await this.page.waitForTimeout(500);
  }

  async screenshot(description?: string): Promise<string> {
    this.screenshotCounter++;
    const filename = `screenshot-${this.screenshotCounter}-${Date.now()}.png`;
    const path = join(this.screenshotDir, filename);
    await this.page.screenshot({ path, fullPage: false });
    logger.info(`Screenshot saved: ${filename} ${description ? `(${description})` : ""}`);
    return path;
  }

  async fullPageScreenshot(description?: string): Promise<string> {
    this.screenshotCounter++;
    const filename = `full-${this.screenshotCounter}-${Date.now()}.png`;
    const path = join(this.screenshotDir, filename);
    await this.page.screenshot({ path, fullPage: true });
    logger.info(`Full-page screenshot: ${filename} ${description ? `(${description})` : ""}`);
    return path;
  }

  async setViewport(width: number, height: number): Promise<void> {
    logger.info(`Viewport set to ${width}x${height}`);
    await this.page.setViewportSize({ width, height });
  }

  getConsoleErrors(): ConsoleError[] {
    return [...this.consoleErrors];
  }

  clearConsoleErrors(): void {
    this.consoleErrors = [];
  }

  getNetworkErrors(): NetworkError[] {
    return [...this.networkErrors];
  }

  clearNetworkErrors(): void {
    this.networkErrors = [];
  }

  async close(): Promise<void> {
    logger.info("Closing browser...");
    // Lazy import to avoid a circular dependency between BrowserManager and
    // the route tools (which reference BrowserManager in their handler
    // signatures).
    const { resetRoutes } = await import("../tools/route-tools.js");
    resetRoutes();

    // Detach any held CDP sessions before closing the context, otherwise
    // the close call hangs waiting on the protocol.
    if (this._throttleCdp) {
      await this._throttleCdp.detach().catch(() => {});
      this._throttleCdp = null;
    }

    // Stop tracing before closing the context, otherwise the in-flight
    // trace is discarded.
    if (this.context && this.traceEnabled) {
      try {
        await this.context.tracing.stop({ path: this.tracePath });
        logger.info(`Trace saved: ${this.tracePath}`);
      } catch (err) {
        logger.warn(
          `Failed to save trace: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      this.traceEnabled = false;
    }

    if (this.context) {
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
    this._page = null;
    this.context = null;
    this.browser = null;
    this.consoleErrors = [];
    this.networkErrors = [];
    logger.info("Browser closed");
  }

  async getVideoPath(): Promise<string | null> {
    if (!this._page) return null;
    const video = this._page.video();
    if (!video) return null;
    return await video.path();
  }
}
