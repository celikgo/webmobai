import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserManager } from "../src/playwright/browser-manager.js";
import {
  getActiveRoutes,
  handleRouteTool,
  resetRoutes,
} from "../src/tools/route-tools.js";

let browser: BrowserManager | undefined;
let sessionDir: string | undefined;

beforeEach(() => {
  resetRoutes();
});

afterEach(async () => {
  if (browser) await browser.close().catch(() => {});
  browser = undefined;
  if (sessionDir) rmSync(sessionDir, { recursive: true, force: true });
  sessionDir = undefined;
});

async function setup() {
  sessionDir = mkdtempSync(join(tmpdir(), "webmobai-route-"));
  browser = new BrowserManager(sessionDir);
  await browser.launch({ headless: true });
  return browser;
}

describe("webmobai_route", () => {
  it("fulfills a matched request with a stubbed JSON body", async () => {
    const b = await setup();

    await handleRouteTool(
      "webmobai_route",
      {
        pattern: "**/api/users/*",
        action: "fulfill",
        status: 200,
        body: JSON.stringify({ id: 42, name: "Mocked" }),
        content_type: "application/json",
      },
      b,
    );

    // Navigate to a data: URL that fetches the API. file:// pages can't fetch
    // other origins easily, so we use data: which has its own origin.
    await b.page.goto(
      "data:text/html,<script>fetch('https://example.com/api/users/42').then(r => r.json()).then(j => { document.title = JSON.stringify(j); });</script>",
    );
    // Give the fetch a moment to settle.
    await new Promise((r) => setTimeout(r, 300));

    const title = await b.page.title();
    expect(title).toContain('"name":"Mocked"');
    expect(title).toContain('"id":42');
  });

  it("aborts a matched request", async () => {
    const b = await setup();

    await handleRouteTool(
      "webmobai_route",
      { pattern: "**/api/users/*", action: "abort", abort_reason: "failed" },
      b,
    );

    await b.page.goto(
      "data:text/html,<script>fetch('https://example.com/api/users/42').then(r => { document.title = 'reached'; }).catch(() => { document.title = 'aborted'; });</script>",
    );
    await new Promise((r) => setTimeout(r, 300));

    expect(await b.page.title()).toBe("aborted");
  });

  it("tracks active routes for later cleanup", async () => {
    const b = await setup();
    await handleRouteTool(
      "webmobai_route",
      { pattern: "**/a/*", action: "continue" },
      b,
    );
    await handleRouteTool(
      "webmobai_route",
      { pattern: "**/b/*", action: "continue" },
      b,
    );
    expect(getActiveRoutes()).toHaveLength(2);
  });
});

describe("webmobai_unroute", () => {
  it("clears a single pattern", async () => {
    const b = await setup();
    await handleRouteTool(
      "webmobai_route",
      { pattern: "**/keep/*", action: "continue" },
      b,
    );
    await handleRouteTool(
      "webmobai_route",
      { pattern: "**/drop/*", action: "continue" },
      b,
    );
    await handleRouteTool("webmobai_unroute", { pattern: "**/drop/*" }, b);
    const remaining = getActiveRoutes().map((r) => r.pattern);
    expect(remaining).toEqual(["**/keep/*"]);
  });

  it("clears all when pattern omitted", async () => {
    const b = await setup();
    await handleRouteTool(
      "webmobai_route",
      { pattern: "**/a/*", action: "continue" },
      b,
    );
    await handleRouteTool(
      "webmobai_route",
      { pattern: "**/b/*", action: "continue" },
      b,
    );
    await handleRouteTool("webmobai_unroute", {}, b);
    expect(getActiveRoutes()).toHaveLength(0);
  });
});
