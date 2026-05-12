import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserManager } from "../src/playwright/browser-manager.js";
import { runScenario } from "../src/scenario/runner.js";
import { scaffoldScenario } from "../src/scenario/scaffolder.js";
import type { Scenario } from "../src/scenario/types.js";
import { fixtureUrl } from "./helpers/browser-fixture.js";

let browser: BrowserManager | undefined;
let sessionDir: string | undefined;

async function setup() {
  sessionDir = mkdtempSync(join(tmpdir(), "webmobai-sc-"));
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

describe("scenario runner", () => {
  it("executes a passing scenario end-to-end", async () => {
    const b = await setup();
    const scenario: Scenario = {
      name: "Signup happy path",
      url: fixtureUrl("scenario-form.html"),
      steps: [
        { type: "assertVisible", selector: "h1" },
        { type: "assertText", selector: "h1", expected: "Create an account" },
        { type: "type", selector: "#email", text: "test@example.com" },
        { type: "type", selector: "#password", text: "Password123!" },
        { type: "click", selector: "[data-testid=submit]" },
        { type: "assertText", selector: "#status", expected: "Account created!" },
      ],
    };
    const result = await runScenario(scenario, b);
    expect(result.summary.failed).toBe(0);
    expect(result.summary.passed).toBe(6);
    expect(result.results.every((r) => r.status === "pass")).toBe(true);
  });

  it("halts on first failure and marks subsequent steps as skipped", async () => {
    const b = await setup();
    const scenario: Scenario = {
      name: "Bad path",
      url: fixtureUrl("scenario-form.html"),
      steps: [
        { type: "assertVisible", selector: "h1" },
        // This will fail — element doesn't exist.
        { type: "assertVisible", selector: "#nope", timeoutMs: 200 },
        // These should be skipped.
        { type: "click", selector: "[data-testid=submit]" },
        { type: "assertText", selector: "#status", expected: "anything" },
      ],
    };
    const result = await runScenario(scenario, b);
    expect(result.summary.failed).toBe(1);
    expect(result.summary.skipped).toBe(2);
    expect(result.summary.passed).toBe(1);
    expect(result.results[2]!.status).toBe("skipped");
    expect(result.results[3]!.status).toBe("skipped");
  });

  it("continueOnFailure runs every step regardless", async () => {
    const b = await setup();
    const scenario: Scenario = {
      name: "Tolerant",
      url: fixtureUrl("scenario-form.html"),
      continueOnFailure: true,
      steps: [
        { type: "assertVisible", selector: "h1" },
        { type: "assertVisible", selector: "#nope", timeoutMs: 200 },
        { type: "assertVisible", selector: "form#signup" },
      ],
    };
    const result = await runScenario(scenario, b);
    expect(result.summary.failed).toBe(1);
    expect(result.summary.skipped).toBe(0);
    expect(result.summary.passed).toBe(2);
  });

  it("records assertion failure messages including the self-healing diagnostic", async () => {
    const b = await setup();
    // Visit a page and click something so a snapshot exists, then run a
    // scenario that misses on the same selector.
    await b.navigate(fixtureUrl("scenario-form.html"));
    await b.click("[data-testid=submit]");

    const scenario: Scenario = {
      name: "Diagnostic test",
      url: fixtureUrl("scenario-form.html"),
      steps: [
        // After the navigate, the page is reloaded. The selector for the
        // submit button is technically valid, so this should still pass.
        { type: "assertVisible", selector: "[data-testid=submit]" },
        // Now ask for a selector that doesn't exist; the failure should
        // include the triage bundle.
        { type: "assertVisible", selector: "#definitely-not-here", timeoutMs: 200 },
      ],
    };
    const result = await runScenario(scenario, b);
    const failed = result.results.find((r) => r.status === "fail");
    expect(failed).toBeDefined();
    // Triage adds "Current URL" — proves the failure-context bundle was
    // attached.
    expect(failed!.message).toContain("Current URL");
  });
});

describe("scenario scaffolder", () => {
  it("emits assertText for the H1, assertVisible for form, and fills inputs", async () => {
    const b = await setup();
    await b.navigate(fixtureUrl("scenario-form.html"));
    const url = b.page.url();
    const scenario = await scaffoldScenario(b.page, url);

    expect(scenario.name).toContain("Generated scenario");
    expect(scenario.url).toBe(url);

    // H1 assertion.
    const h1Assert = scenario.steps.find(
      (s) => s.type === "assertText" && "selector" in s && s.selector === "h1",
    );
    expect(h1Assert).toBeDefined();
    if (h1Assert?.type === "assertText") {
      expect(h1Assert.expected).toBe("Create an account");
    }

    // Form should produce an assertVisible.
    const formAssert = scenario.steps.find(
      (s) => s.type === "assertVisible" && "selector" in s && s.selector.includes("signup"),
    );
    expect(formAssert).toBeDefined();

    // Inputs should produce type steps. Email gets the sample email value.
    const emailType = scenario.steps.find(
      (s) => s.type === "type" && "selector" in s && s.selector === "#email",
    );
    expect(emailType).toBeDefined();
    if (emailType?.type === "type") {
      expect(emailType.text).toBe("test@example.com");
    }
    const passType = scenario.steps.find(
      (s) => s.type === "type" && "selector" in s && s.selector === "#password",
    );
    expect(passType).toBeDefined();
    if (passType?.type === "type") {
      expect(passType.text).toBe("Password123!");
    }

    // Nav links produce click + assertUrl + navigate-back steps.
    const navClick = scenario.steps.find(
      (s) =>
        s.type === "click" &&
        "description" in s &&
        (s.description?.includes("Pricing") ?? false),
    );
    expect(navClick).toBeDefined();
  });

  it("does not include hidden inputs or submit/button as fillable", async () => {
    const b = await setup();
    await b.page.goto(
      "data:text/html,<form><input id='visible' name='foo'><input id='hidden' name='csrf' type='hidden' value='x'><button type='submit'>Go</button></form>",
    );
    const scenario = await scaffoldScenario(b.page, b.page.url());
    const typed = scenario.steps.filter((s) => s.type === "type");
    // Only the visible <input name='foo'> should be filled; not the hidden.
    expect(typed).toHaveLength(1);
  });

  it("produces a JSON-serializable scenario", async () => {
    const b = await setup();
    await b.navigate(fixtureUrl("scenario-form.html"));
    const scenario = await scaffoldScenario(b.page, b.page.url());
    // Round-trip through JSON.
    const round = JSON.parse(JSON.stringify(scenario));
    expect(round.name).toBe(scenario.name);
    expect(round.steps.length).toBe(scenario.steps.length);
  });
});
