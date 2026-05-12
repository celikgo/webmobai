import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserManager } from "../src/playwright/browser-manager.js";
import {
  findSimilarElements,
  snapshotElement,
} from "../src/playwright/element-snapshot.js";
import { handleAssertionTool } from "../src/tools/assertion-tools.js";
import { fixtureUrl } from "./helpers/browser-fixture.js";

let browser: BrowserManager | undefined;
let sessionDir: string | undefined;

async function setup() {
  sessionDir = mkdtempSync(join(tmpdir(), "webmobai-sh-"));
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

describe("element snapshot capture", () => {
  it("captures id/testid/role/text for an element", async () => {
    const b = await setup();
    await b.navigate(fixtureUrl("self-healing-v1.html"));
    const snap = await snapshotElement(b.page, "#signup-btn");
    expect(snap).not.toBeNull();
    expect(snap!.tag).toBe("button");
    expect(snap!.text).toBe("Sign Up");
    expect(snap!.testid).toBe("signup");
    expect(snap!.attrs.id).toBe("signup-btn");
  });

  it("returns null when the selector matches nothing", async () => {
    const b = await setup();
    await b.navigate(fixtureUrl("self-healing-v1.html"));
    const snap = await snapshotElement(b.page, "#does-not-exist");
    expect(snap).toBeNull();
  });
});

describe("BrowserManager — selector snapshot recording", () => {
  it("records a snapshot after a successful click", async () => {
    const b = await setup();
    await b.navigate(fixtureUrl("self-healing-v1.html"));
    await b.click("#signup-btn");
    const snap = b.getSelectorSnapshot("#signup-btn");
    expect(snap).toBeDefined();
    expect(snap!.testid).toBe("signup");
  });

  it("records a snapshot after a successful type", async () => {
    const b = await setup();
    // Quick inline fixture with an input.
    await b.page.goto(
      "data:text/html,<input id='email' type='email' name='email'>",
    );
    await b.type("#email", "test@example.com");
    const snap = b.getSelectorSnapshot("#email");
    expect(snap).toBeDefined();
    expect(snap!.tag).toBe("input");
  });
});

describe("BrowserManager — self-healing on selector failure", () => {
  it("returns suggested replacements when the old selector misses but a similar element exists", async () => {
    const b = await setup();

    // v1: click using the old #signup-btn selector — records a snapshot.
    await b.navigate(fixtureUrl("self-healing-v1.html"));
    await b.click("#signup-btn");
    expect(b.getSelectorSnapshot("#signup-btn")).toBeDefined();

    // v2: same button content but the id is renamed. The old selector now
    // misses; we expect the error message to include candidate replacements
    // with data-testid="signup" prominently.
    await b.navigate(fixtureUrl("self-healing-v2.html"));

    let err: Error | undefined;
    await b.click("#signup-btn").catch((e: Error) => {
      err = e;
    });
    expect(err).toBeDefined();
    const msg = err!.message;
    expect(msg).toContain("Selector \"#signup-btn\" failed");
    expect(msg).toContain("Prior snapshot");
    expect(msg).toContain("Suggested replacements");
    // The candidate's suggested selector should prefer data-testid since
    // it's the most stable identifier.
    expect(msg).toMatch(/data-testid="signup"/);
  });

  it("findSimilarElements scores testid-matching elements highest", async () => {
    const b = await setup();
    await b.navigate(fixtureUrl("self-healing-v1.html"));
    const prior = (await snapshotElement(b.page, "#signup-btn"))!;
    // Now load v2 and look for similar elements.
    await b.navigate(fixtureUrl("self-healing-v2.html"));
    const candidates = await findSimilarElements(b.page, prior);
    expect(candidates.length).toBeGreaterThan(0);
    // The top candidate should match by testid + role + text.
    expect(candidates[0]!.snapshot.testid).toBe("signup");
    expect(candidates[0]!.suggestedSelector).toBe('[data-testid="signup"]');
  });
});

describe("assertion failure triage", () => {
  it("includes the failure-context bundle in the response when an assertion fails", async () => {
    const b = await setup();
    await b.navigate(fixtureUrl("self-healing-v1.html"));
    const r = await handleAssertionTool(
      "webmobai_assert_visible",
      { selector: "#does-not-exist", timeout_ms: 300 },
      b,
    );
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("FAIL");
    // Triage bundle has the page URL.
    expect(text).toContain("Current URL");
    // Triage bundle ends in a screenshot path under the session dir.
    expect(text).toMatch(/Screenshot saved:.*webmobai-sh-/);
  });

  it("includes a self-healing diagnostic for a selector with a prior snapshot", async () => {
    const b = await setup();
    await b.navigate(fixtureUrl("self-healing-v1.html"));
    // Record a snapshot via successful click.
    await b.click("#signup-btn");
    // Navigate to v2 where the id no longer matches.
    await b.navigate(fixtureUrl("self-healing-v2.html"));

    const r = await handleAssertionTool(
      "webmobai_assert_visible",
      { selector: "#signup-btn", timeout_ms: 300 },
      b,
    );
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("FAIL");
    expect(text).toContain("Prior snapshot");
    expect(text).toContain("Suggested replacements");
  });
});
