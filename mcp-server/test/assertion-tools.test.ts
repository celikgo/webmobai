import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserManager } from "../src/playwright/browser-manager.js";
import { handleAssertionTool } from "../src/tools/assertion-tools.js";
import { fixtureUrl } from "./helpers/browser-fixture.js";

let browser: BrowserManager | undefined;
let sessionDir: string | undefined;

async function setup() {
  sessionDir = mkdtempSync(join(tmpdir(), "webmobai-assert-"));
  browser = new BrowserManager(sessionDir);
  await browser.launch({ headless: true });
  await browser.navigate(fixtureUrl("assertion-target.html"));
  return browser;
}

afterEach(async () => {
  if (browser) await browser.close().catch(() => {});
  browser = undefined;
  if (sessionDir) rmSync(sessionDir, { recursive: true, force: true });
  sessionDir = undefined;
});

function getText(result: { content: { type: string; text: string }[] }): string {
  return result.content[0]?.text ?? "";
}

describe("webmobai_assert_visible", () => {
  it("passes for a visible element", async () => {
    const b = await setup();
    const r = await handleAssertionTool(
      "webmobai_assert_visible",
      { selector: "#title" },
      b,
    );
    expect(getText(r)).toContain("PASS");
  });

  it("fails for a missing element", async () => {
    const b = await setup();
    const r = await handleAssertionTool(
      "webmobai_assert_visible",
      { selector: "#does-not-exist", timeout_ms: 300 },
      b,
    );
    expect(getText(r)).toContain("FAIL");
    expect(getText(r)).toContain("not visible");
  });

  it("auto-waits for a delayed element", async () => {
    const b = await setup();
    // Fixture inserts <p id="delayed"> at 200ms.
    const r = await handleAssertionTool(
      "webmobai_assert_visible",
      { selector: "#delayed", timeout_ms: 2000 },
      b,
    );
    expect(getText(r)).toContain("PASS");
  });
});

describe("webmobai_assert_hidden", () => {
  it("passes when the element is display:none", async () => {
    const b = await setup();
    const r = await handleAssertionTool(
      "webmobai_assert_hidden",
      { selector: "[data-testid=banner]" },
      b,
    );
    expect(getText(r)).toContain("PASS");
  });

  it("fails when the element becomes visible", async () => {
    const b = await setup();
    // Click reveal to flip display:none → block.
    await b.click("#reveal");
    const r = await handleAssertionTool(
      "webmobai_assert_hidden",
      { selector: "[data-testid=banner]", timeout_ms: 300 },
      b,
    );
    expect(getText(r)).toContain("FAIL");
  });
});

describe("webmobai_assert_text", () => {
  it("passes on substring match", async () => {
    const b = await setup();
    const r = await handleAssertionTool(
      "webmobai_assert_text",
      { selector: "#title", expected: "Hello" },
      b,
    );
    expect(getText(r)).toContain("PASS");
  });

  it("fails on mismatch with last-seen value in the error", async () => {
    const b = await setup();
    const r = await handleAssertionTool(
      "webmobai_assert_text",
      { selector: "#title", expected: "Goodbye", timeout_ms: 300 },
      b,
    );
    expect(getText(r)).toContain("FAIL");
    expect(getText(r)).toContain("Hello, world"); // Tells the user what we saw.
  });

  it("exact mode requires the trimmed innerText to equal expected", async () => {
    const b = await setup();
    const r = await handleAssertionTool(
      "webmobai_assert_text",
      { selector: "#title", expected: "Hello, world", exact: true },
      b,
    );
    expect(getText(r)).toContain("PASS");
  });
});

describe("webmobai_assert_url", () => {
  it("passes on substring match", async () => {
    const b = await setup();
    const r = await handleAssertionTool(
      "webmobai_assert_url",
      { contains: "assertion-target.html" },
      b,
    );
    expect(getText(r)).toContain("PASS");
  });

  it("fails when URL doesn't match the pattern", async () => {
    const b = await setup();
    const r = await handleAssertionTool(
      "webmobai_assert_url",
      { pattern: "^https://example\\.com", timeout_ms: 300 },
      b,
    );
    expect(getText(r)).toContain("FAIL");
  });
});

describe("webmobai_assert_count", () => {
  it("matches the fixture's three <li> elements", async () => {
    const b = await setup();
    const r = await handleAssertionTool(
      "webmobai_assert_count",
      { selector: "#items li", expected: 3 },
      b,
    );
    expect(getText(r)).toContain("PASS");
  });

  it("fails on wrong count and reports actual", async () => {
    const b = await setup();
    const r = await handleAssertionTool(
      "webmobai_assert_count",
      { selector: "#items li", expected: 7, timeout_ms: 300 },
      b,
    );
    expect(getText(r)).toContain("FAIL");
    expect(getText(r)).toMatch(/was 3/);
  });
});
