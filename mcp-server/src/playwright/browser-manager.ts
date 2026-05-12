import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { logger } from "../utils/logger.js";
import type { ConsoleError } from "../types.js";

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
  private screenshotCounter = 0;

  constructor(baseDir: string = defaultSessionDir()) {
    this.screenshotDir = join(baseDir, "screenshots");
    this.recordingDir = join(baseDir, "recordings");
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
  }): Promise<void> {
    const {
      headless = false,
      viewport = { width: 1280, height: 720 },
      recordVideo = false,
    } = options ?? {};

    await mkdir(this.screenshotDir, { recursive: true });
    await mkdir(this.recordingDir, { recursive: true });

    logger.info("Launching Chromium browser...");

    this.browser = await chromium.launch({
      headless,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-first-run",
        "--no-default-browser-check",
      ],
    });

    const contextOptions: Parameters<Browser["newContext"]>[0] = {
      viewport,
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: "en-US",
      timezoneId: "America/New_York",
      ignoreHTTPSErrors: true,
    };

    if (recordVideo) {
      contextOptions.recordVideo = {
        dir: this.recordingDir,
        size: viewport,
      };
    }

    this.context = await this.browser.newContext(contextOptions);

    // Subscribe to long-task entries before any page script runs so we can
    // compute TTI later. The collector stashes entries on the window so the
    // analyzer can read them via getEntriesByType("longtask") even without
    // its own observer.
    await this.context.addInitScript(() => {
      try {
        new PerformanceObserver(() => {}).observe({
          type: "longtask",
          buffered: true,
        });
      } catch {
        // longtask not supported (e.g., Firefox/WebKit) — silently skip.
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

    logger.info(`Browser launched (headed: ${!headless}, viewport: ${viewport.width}x${viewport.height})`);
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

  async click(selector: string): Promise<void> {
    logger.info(`Clicking: ${selector}`);
    await this.page.click(selector, { timeout: 10000 });
    await this.page.waitForLoadState("domcontentloaded").catch(() => {});
  }

  async type(selector: string, text: string): Promise<void> {
    logger.info(`Typing into: ${selector}`);
    await this.page.fill(selector, text);
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
