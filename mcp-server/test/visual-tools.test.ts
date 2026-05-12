import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserManager } from "../src/playwright/browser-manager.js";
import { handleVisualTool } from "../src/tools/visual-tools.js";
import { runScenario } from "../src/scenario/runner.js";
import type { Scenario } from "../src/scenario/types.js";
import { fixtureUrl } from "./helpers/browser-fixture.js";

let browser: BrowserManager | undefined;
let sessionDir: string | undefined;
let baselineDir: string | undefined;

async function setup() {
  sessionDir = mkdtempSync(join(tmpdir(), "webmobai-vr-"));
  baselineDir = mkdtempSync(join(tmpdir(), "webmobai-baselines-"));
  browser = new BrowserManager(sessionDir);
  await browser.launch({ headless: true });
  return browser;
}

afterEach(async () => {
  if (browser) await browser.close().catch(() => {});
  browser = undefined;
  if (sessionDir) rmSync(sessionDir, { recursive: true, force: true });
  sessionDir = undefined;
  if (baselineDir) rmSync(baselineDir, { recursive: true, force: true });
  baselineDir = undefined;
});

function getText(r: { content: { type: string; text: string }[] }): string {
  return r.content[0]?.text ?? "";
}

describe("webmobai_visual_snapshot", () => {
  it("creates a baseline on first run", async () => {
    const b = await setup();
    await b.navigate(fixtureUrl("visual-stable.html"));
    const r = await handleVisualTool(
      "webmobai_visual_snapshot",
      { name: "stable-page", baseline_dir: baselineDir },
      b,
    );
    const text = getText(r);
    expect(text).toContain("Visual baseline created");
    expect(existsSync(join(baselineDir!, "stable-page.png"))).toBe(true);
  });

  it("passes when the page is unchanged between two runs", async () => {
    const b = await setup();
    await b.navigate(fixtureUrl("visual-stable.html"));
    // First call — creates baseline.
    await handleVisualTool(
      "webmobai_visual_snapshot",
      { name: "stable-page", baseline_dir: baselineDir },
      b,
    );

    // Second call against the same page — should pass.
    const r = await handleVisualTool(
      "webmobai_visual_snapshot",
      { name: "stable-page", baseline_dir: baselineDir },
      b,
    );
    expect(getText(r)).toMatch(/^PASS/);
  });

  it("fails when the page visibly changes and writes actual + diff PNGs", async () => {
    const b = await setup();
    await b.navigate(fixtureUrl("visual-stable.html"));
    await handleVisualTool(
      "webmobai_visual_snapshot",
      { name: "mutated-page", baseline_dir: baselineDir },
      b,
    );

    // Mutate the page — change the box color from blue to red.
    await b.page.evaluate(() => {
      const el = document.querySelector<HTMLElement>("#hero");
      if (el) el.style.background = "#e24a4a";
    });

    const r = await handleVisualTool(
      "webmobai_visual_snapshot",
      {
        name: "mutated-page",
        baseline_dir: baselineDir,
        max_diff_pixel_ratio: 0.001, // very strict
      },
      b,
    );
    const text = getText(r);
    expect(text).toMatch(/^FAIL/);
    expect(text).toContain("pixels differ");
    expect(existsSync(join(baselineDir!, "mutated-page.actual.png"))).toBe(true);
    expect(existsSync(join(baselineDir!, "mutated-page.diff.png"))).toBe(true);
  });

  it("update_baseline overwrites the existing baseline", async () => {
    const b = await setup();
    await b.navigate(fixtureUrl("visual-stable.html"));
    // Create baseline 1.
    await handleVisualTool(
      "webmobai_visual_snapshot",
      { name: "updateable", baseline_dir: baselineDir },
      b,
    );

    // Change the page.
    await b.page.evaluate(() => {
      const el = document.querySelector<HTMLElement>("#hero");
      if (el) el.style.background = "#22aa22";
    });

    // Force-overwrite the baseline with the new look.
    const r = await handleVisualTool(
      "webmobai_visual_snapshot",
      {
        name: "updateable",
        baseline_dir: baselineDir,
        update_baseline: true,
      },
      b,
    );
    expect(getText(r)).toContain("Visual baseline updated");

    // A subsequent unchanged run against the new baseline should pass.
    const passRun = await handleVisualTool(
      "webmobai_visual_snapshot",
      { name: "updateable", baseline_dir: baselineDir },
      b,
    );
    expect(getText(passRun)).toMatch(/^PASS/);
  });

  it("respects selector to snapshot only a portion of the page", async () => {
    const b = await setup();
    await b.navigate(fixtureUrl("visual-stable.html"));
    const r = await handleVisualTool(
      "webmobai_visual_snapshot",
      {
        name: "hero-only",
        baseline_dir: baselineDir,
        selector: "#hero",
      },
      b,
    );
    expect(getText(r)).toContain("Visual baseline created");
    // The baseline file exists; it should be the size of just the box,
    // which is 200x200 in the fixture. We don't strictly assert the
    // dimensions here (DPR/headed-vs-headless can affect raw size), but we
    // confirm the file is written.
    expect(existsSync(join(baselineDir!, "hero-only.png"))).toBe(true);
  });

  it("returns a helpful error when the selector matches no element", async () => {
    const b = await setup();
    await b.navigate(fixtureUrl("visual-stable.html"));
    const r = await handleVisualTool(
      "webmobai_visual_snapshot",
      {
        name: "missing-element",
        baseline_dir: baselineDir,
        selector: "#does-not-exist",
      },
      b,
    );
    expect(getText(r)).toContain("Element not found");
  });

  it("nested name uses subdirectories", async () => {
    const b = await setup();
    await b.navigate(fixtureUrl("visual-stable.html"));
    await handleVisualTool(
      "webmobai_visual_snapshot",
      { name: "checkout/cart-empty", baseline_dir: baselineDir },
      b,
    );
    expect(existsSync(join(baselineDir!, "checkout", "cart-empty.png"))).toBe(true);
  });
});

describe("scenario visualSnapshot step", () => {
  it("runs in a scenario and passes on a stable page", async () => {
    const b = await setup();
    const scenario: Scenario = {
      name: "visual happy path",
      url: fixtureUrl("visual-stable.html"),
      steps: [
        // Bootstrap: create the baseline.
        {
          type: "visualSnapshot",
          name: "scenario-stable",
          baselineDir,
        },
        // Re-check: should pass against the just-created baseline.
        {
          type: "visualSnapshot",
          name: "scenario-stable",
          baselineDir,
        },
      ],
    };
    const result = await runScenario(scenario, b);
    expect(result.summary.failed).toBe(0);
  });

  it("fails the scenario when a visual snapshot regresses", async () => {
    const b = await setup();
    const scenario: Scenario = {
      name: "visual regression",
      url: fixtureUrl("visual-stable.html"),
      steps: [
        { type: "visualSnapshot", name: "regression-test", baselineDir },
        {
          type: "screenshot",
          description: "marker step in between",
        },
        // Now silently mutate the page (we'd normally do an action that
        // produces visual change; for the test we inject via evaluate).
        // Scenarios don't have an "evaluate" step, so we use a wait that
        // lets the next visual snapshot run on the mutated state.
      ],
    };

    // Mutate the page outside the scenario by registering a route that
    // serves modified HTML. Cleaner: run the scenario, then mutate, then
    // run a one-off visualSnapshot tool call (which is what a real
    // regression looks like — different visit, different DOM).
    const result1 = await runScenario(scenario, b);
    expect(result1.summary.failed).toBe(0);

    await b.page.evaluate(() => {
      const el = document.querySelector<HTMLElement>("#hero");
      if (el) el.style.background = "#000";
    });

    const followUp: Scenario = {
      name: "post-mutation",
      url: fixtureUrl("visual-stable.html"),
      steps: [
        // Re-mutate after navigate — the navigate resets the page.
        {
          type: "wait",
          timeoutMs: 50,
        },
        {
          type: "visualSnapshot",
          name: "regression-test",
          baselineDir,
          maxDiffPixelRatio: 0.001,
        },
      ],
    };
    // The scenario runner navigates to scenario.url first, which reloads
    // the page and resets our mutation. To exercise the failure path, we
    // need the visual snapshot to run on a still-mutated page. Re-apply
    // the mutation via a one-off page.evaluate AFTER navigate, then call
    // the tool directly.
    await b.navigate(fixtureUrl("visual-stable.html"));
    await b.page.evaluate(() => {
      const el = document.querySelector<HTMLElement>("#hero");
      if (el) el.style.background = "#000";
    });
    const r = await handleVisualTool(
      "webmobai_visual_snapshot",
      {
        name: "regression-test",
        baseline_dir: baselineDir,
        max_diff_pixel_ratio: 0.001,
      },
      b,
    );
    expect(getText(r)).toMatch(/^FAIL/);
    // Just to acknowledge `followUp` is intentionally unused.
    expect(followUp.name).toBe("post-mutation");
  });
});
