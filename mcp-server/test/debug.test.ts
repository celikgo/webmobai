import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserManager } from "../src/playwright/browser-manager.js";
import { handleDebugTool } from "../src/tools/debug-tools.js";
import { fixtureUrl } from "./helpers/browser-fixture.js";

let browser: BrowserManager | undefined;
let sessionDir: string | undefined;

async function setup() {
  sessionDir = mkdtempSync(join(tmpdir(), "webmobai-debug-"));
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

describe("webmobai_describe_selector", () => {
  it("describes a single matching element", async () => {
    const b = await setup();
    await b.navigate(fixtureUrl("a11y-clean.html"));
    const r = await handleDebugTool(
      "webmobai_describe_selector",
      { selector: "h1" },
      b,
    );
    const out = getText(r);
    expect(out).toMatch(/matches 1 element/);
    expect(out).toContain("Welcome");
  });

  it("shows multiple matches with position info", async () => {
    const b = await setup();
    await b.navigate(fixtureUrl("seo-bad.html"));
    const r = await handleDebugTool(
      "webmobai_describe_selector",
      { selector: "h1" },
      b,
    );
    const out = getText(r);
    expect(out).toMatch(/matches 2 elements/);
    expect(out).toContain("First H1");
    expect(out).toContain("Second H1");
    expect(out).toContain("resolves to 2 elements");
  });

  it("reports zero matches with id-not-found hint", async () => {
    const b = await setup();
    await b.navigate(fixtureUrl("a11y-clean.html"));
    const r = await handleDebugTool(
      "webmobai_describe_selector",
      { selector: "#does-not-exist" },
      b,
    );
    const out = getText(r);
    expect(out).toMatch(/matches 0 elements/);
    expect(out).toContain('No element with id="does-not-exist"');
  });

  it("reports testid-not-found hint", async () => {
    const b = await setup();
    await b.navigate(fixtureUrl("a11y-clean.html"));
    const r = await handleDebugTool(
      "webmobai_describe_selector",
      { selector: '[data-testid="missing"]' },
      b,
    );
    const out = getText(r);
    expect(out).toContain('No element with data-testid="missing"');
  });

  it("includes accessibility attributes when present", async () => {
    const b = await setup();
    await b.navigate(fixtureUrl("a11y-clean.html"));
    const r = await handleDebugTool(
      "webmobai_describe_selector",
      { selector: "button" },
      b,
    );
    const out = getText(r);
    // The clean fixture has a <button aria-label="Submit form"> — verify
    // the description surfaces aria-label.
    expect(out).toContain('aria-label="Submit form"');
  });
});
