import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserManager } from "../src/playwright/browser-manager.js";
import { handlePwaTool } from "../src/tools/pwa-tools.js";
import {
  html,
  json,
  raw,
  startLocalServer,
  type LocalServer,
} from "./helpers/local-server.js";

let browser: BrowserManager | undefined;
let sessionDir: string | undefined;
let server: LocalServer | undefined;

async function setup() {
  sessionDir = mkdtempSync(join(tmpdir(), "webmobai-pwa-"));
  browser = new BrowserManager(sessionDir);
  await browser.launch({ headless: true });
  return browser;
}

afterEach(async () => {
  if (browser) await browser.close().catch(() => {});
  browser = undefined;
  if (sessionDir) rmSync(sessionDir, { recursive: true, force: true });
  sessionDir = undefined;
  if (server) await server.close();
  server = undefined;
});

function getText(r: { content: { type: string; text: string }[] }): string {
  return r.content[0]?.text ?? "";
}

describe("webmobai_pwa_audit", () => {
  it("flags missing manifest link", async () => {
    const b = await setup();
    server = await startLocalServer({
      "/": html("<html><head><title>x</title></head><body>no manifest</body></html>"),
    });
    await b.navigate(server.origin);
    const r = await handlePwaTool("webmobai_pwa_audit", {}, b);
    const out = getText(r);
    expect(out).toMatch(/manifest-link-missing/);
  });

  it("flags missing service worker registration", async () => {
    const b = await setup();
    server = await startLocalServer({
      "/": html("<html><body>no sw</body></html>"),
    });
    await b.navigate(server.origin);
    const r = await handlePwaTool("webmobai_pwa_audit", {}, b);
    const out = getText(r);
    expect(out).toMatch(/sw-not-registered/);
  });

  it("flags non-HTTPS page as a PWA blocker (non-localhost http)", async () => {
    const b = await setup();
    server = await startLocalServer({
      "/": html("<html><body>plain http</body></html>"),
    });
    // 127.0.0.1 is treated as localhost by Chromium for SW purposes, so we
    // can't trigger pwa-not-https through the local server. Use a data:
    // URL — Chromium treats it as opaque-origin, not HTTPS.
    await b.page.goto("data:text/html,<html><body>data origin</body></html>");
    const r = await handlePwaTool("webmobai_pwa_audit", {}, b);
    const out = getText(r);
    expect(out).toMatch(/pwa-not-https/);
  });

  it("flags invalid manifest JSON", async () => {
    const b = await setup();
    server = await startLocalServer({
      "/": html(
        '<html><head><link rel="manifest" href="/manifest.webmanifest"></head><body>broken manifest</body></html>',
      ),
      "/manifest.webmanifest": raw(
        "{ this is not json",
        200,
        "application/json",
      ),
    });
    await b.navigate(server.origin);
    const r = await handlePwaTool("webmobai_pwa_audit", {}, b);
    const out = getText(r);
    expect(out).toMatch(/manifest-invalid-json/);
  });

  it("flags missing required manifest fields and small icons", async () => {
    const b = await setup();
    server = await startLocalServer({
      "/": html(
        '<html><head><link rel="manifest" href="/manifest.webmanifest"></head><body>app</body></html>',
      ),
      "/manifest.webmanifest": json({
        // Missing: short_name, start_url, display
        name: "My App",
        icons: [{ src: "/icon-64.png", sizes: "64x64", type: "image/png" }],
      }),
    });
    await b.navigate(server.origin);
    const r = await handlePwaTool("webmobai_pwa_audit", {}, b);
    const out = getText(r);
    expect(out).toMatch(/manifest-missing-short_name/);
    expect(out).toMatch(/manifest-missing-start_url/);
    expect(out).toMatch(/manifest-missing-display/);
    expect(out).toMatch(/manifest-icon-too-small/);
  });

  it("passes core checks for a complete manifest", async () => {
    const b = await setup();
    server = await startLocalServer({
      "/": html(
        '<html><head><link rel="manifest" href="/manifest.webmanifest"></head><body>app</body></html>',
      ),
      "/manifest.webmanifest": json({
        name: "Complete App",
        short_name: "App",
        start_url: "/",
        display: "standalone",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      }),
    });
    await b.navigate(server.origin);
    const r = await handlePwaTool("webmobai_pwa_audit", {}, b);
    const out = getText(r);
    expect(out).not.toMatch(/manifest-missing-/);
    expect(out).not.toMatch(/manifest-icon-too-small/);
    expect(out).not.toMatch(/manifest-invalid-json/);
  });

  it("test_offline flag exercises the offline-fallback path", async () => {
    const b = await setup();
    server = await startLocalServer({
      "/": html("<html><body><h1>Live page</h1></body></html>"),
    });
    await b.navigate(server.origin);
    const r = await handlePwaTool(
      "webmobai_pwa_audit",
      { test_offline: true },
      b,
    );
    const out = getText(r);
    expect(out).toMatch(/offline-no-fallback|offline-renders/);
  });
});
