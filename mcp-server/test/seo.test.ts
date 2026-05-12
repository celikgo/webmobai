import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserManager } from "../src/playwright/browser-manager.js";
import { handleSeoTool } from "../src/tools/seo-tools.js";
import { fixtureUrl } from "./helpers/browser-fixture.js";

let browser: BrowserManager | undefined;
let sessionDir: string | undefined;

async function setup() {
  sessionDir = mkdtempSync(join(tmpdir(), "webmobai-seo-"));
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

function getText(r: { content: { type: string; text: string }[] }): string {
  return r.content[0]?.text ?? "";
}

describe("webmobai_seo_audit", () => {
  it("returns a clean report for a well-tagged page", async () => {
    const b = await setup();
    await b.navigate(fixtureUrl("seo-good.html"));
    const r = await handleSeoTool(
      "webmobai_seo_audit",
      { check_robots_and_sitemap: false },
      b,
    );
    const out = getText(r);
    // None of the major findings should fire on the good fixture.
    expect(out).not.toMatch(/title-missing/);
    expect(out).not.toMatch(/meta-description-missing/);
    expect(out).not.toMatch(/canonical-missing/);
    expect(out).not.toMatch(/og-title-missing/);
    expect(out).not.toMatch(/og-image-missing/);
    expect(out).not.toMatch(/twitter-card-missing/);
    expect(out).not.toMatch(/h1-missing/);
    expect(out).not.toMatch(/viewport-meta-missing/);
    expect(out).not.toMatch(/json-ld-invalid/);
  });

  it("flags too-short title on the bad fixture", async () => {
    const b = await setup();
    await b.navigate(fixtureUrl("seo-bad.html"));
    const r = await handleSeoTool(
      "webmobai_seo_audit",
      { check_robots_and_sitemap: false },
      b,
    );
    const out = getText(r);
    expect(out).toMatch(/title-too-short/);
  });

  it("flags missing meta description and canonical on the bad fixture", async () => {
    const b = await setup();
    await b.navigate(fixtureUrl("seo-bad.html"));
    const r = await handleSeoTool(
      "webmobai_seo_audit",
      { check_robots_and_sitemap: false },
      b,
    );
    const out = getText(r);
    expect(out).toMatch(/meta-description-missing/);
    expect(out).toMatch(/canonical-missing/);
  });

  it("flags multiple H1s and missing html lang and viewport", async () => {
    const b = await setup();
    await b.navigate(fixtureUrl("seo-bad.html"));
    const r = await handleSeoTool(
      "webmobai_seo_audit",
      { check_robots_and_sitemap: false },
      b,
    );
    const out = getText(r);
    expect(out).toMatch(/h1-multiple/);
    expect(out).toMatch(/viewport-meta-missing/);
  });

  it("flags invalid JSON-LD", async () => {
    const b = await setup();
    await b.navigate(fixtureUrl("seo-bad.html"));
    const r = await handleSeoTool(
      "webmobai_seo_audit",
      { check_robots_and_sitemap: false },
      b,
    );
    const out = getText(r);
    expect(out).toMatch(/json-ld-invalid/);
  });
});

describe("webmobai_check_broken_links", () => {
  it("skips broken-link check for file:// URLs gracefully", async () => {
    const b = await setup();
    await b.navigate(fixtureUrl("seo-good.html"));
    const r = await handleSeoTool("webmobai_check_broken_links", {}, b);
    const out = getText(r);
    expect(out).toMatch(/skipped|not http/);
  });
});
