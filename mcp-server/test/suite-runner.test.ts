import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSuite } from "../src/suite/runner.js";
import type { RunnableScenario } from "../src/suite/types.js";
import { fixtureUrl } from "./helpers/browser-fixture.js";

let sessionDirs: string[] = [];

afterEach(() => {
  for (const d of sessionDirs) rmSync(d, { recursive: true, force: true });
  sessionDirs = [];
});

function scenarioFor(name: string, fixture: string, steps: unknown[] = []): RunnableScenario {
  return {
    scenario: {
      name,
      url: fixtureUrl(fixture),
      steps: steps as RunnableScenario["scenario"]["steps"],
    },
    tags: [],
  };
}

describe("runSuite — parallel execution", () => {
  it("runs scenarios in parallel and aggregates results", async () => {
    const scenarios: RunnableScenario[] = [
      scenarioFor("scenario A", "a11y-clean.html", [
        { type: "assertVisible", selector: "h1" },
      ]),
      scenarioFor("scenario B", "a11y-clean.html", [
        { type: "assertVisible", selector: "main" },
      ]),
      scenarioFor("scenario C", "a11y-clean.html", [
        { type: "assertText", selector: "h1", expected: "Welcome" },
      ]),
    ];

    const result = await runSuite(scenarios, { workers: 3 });

    expect(result.summary.totalScenarios).toBe(3);
    expect(result.summary.failedScenarios).toBe(0);
    expect(result.summary.passedSteps).toBe(3);
    for (const s of result.scenarios) {
      sessionDirs.push(s.sessionDir);
      expect(s.result.summary.failed).toBe(0);
    }
  });

  it("captures a failed scenario without halting the suite", async () => {
    const scenarios: RunnableScenario[] = [
      scenarioFor("passing", "a11y-clean.html", [
        { type: "assertVisible", selector: "h1" },
      ]),
      scenarioFor("failing", "a11y-clean.html", [
        // Selector doesn't exist; assertion times out fast.
        { type: "assertVisible", selector: "#does-not-exist", timeoutMs: 300 },
      ]),
      scenarioFor("passing-2", "a11y-clean.html", [
        { type: "assertVisible", selector: "main" },
      ]),
    ];

    const result = await runSuite(scenarios, { workers: 3 });
    expect(result.summary.totalScenarios).toBe(3);
    expect(result.summary.passedScenarios).toBe(2);
    expect(result.summary.failedScenarios).toBe(1);
    for (const s of result.scenarios) sessionDirs.push(s.sessionDir);
  });

  it("each scenario gets its own session dir", async () => {
    const scenarios: RunnableScenario[] = [
      scenarioFor("alpha", "a11y-clean.html", [
        { type: "assertVisible", selector: "h1" },
      ]),
      scenarioFor("beta", "a11y-clean.html", [
        { type: "assertVisible", selector: "h1" },
      ]),
    ];
    const result = await runSuite(scenarios, { workers: 2 });
    const dirs = result.scenarios.map((s) => s.sessionDir);
    sessionDirs.push(...dirs);
    expect(new Set(dirs).size).toBe(2);
    for (const d of dirs) expect(existsSync(d)).toBe(true);
  });

  it("workers=1 forces strict serial execution", async () => {
    // We don't time this — Vitest workers run on isolated forks. We just
    // verify the result correctness with workers=1 (most likely to expose
    // any "must run in parallel" assumption in the runner).
    const scenarios: RunnableScenario[] = [
      scenarioFor("first", "a11y-clean.html", [
        { type: "assertVisible", selector: "h1" },
      ]),
      scenarioFor("second", "a11y-clean.html", [
        { type: "assertVisible", selector: "h1" },
      ]),
    ];
    const result = await runSuite(scenarios, { workers: 1 });
    expect(result.summary.failedScenarios).toBe(0);
    for (const s of result.scenarios) sessionDirs.push(s.sessionDir);
  });

  it("respects per-scenario browser/viewport overrides", async () => {
    const scenarios: RunnableScenario[] = [
      {
        scenario: {
          name: "mobile",
          url: fixtureUrl("a11y-clean.html"),
          viewport: { width: 375, height: 667 },
          steps: [{ type: "assertVisible", selector: "h1" }],
        },
        tags: [],
      },
      {
        scenario: {
          name: "desktop",
          url: fixtureUrl("a11y-clean.html"),
          viewport: { width: 1440, height: 900 },
          steps: [{ type: "assertVisible", selector: "h1" }],
        },
        tags: [],
      },
    ];
    const result = await runSuite(scenarios, { workers: 2 });
    expect(result.summary.failedScenarios).toBe(0);
    for (const s of result.scenarios) sessionDirs.push(s.sessionDir);
  });

  it("emits progress events for each scenario", async () => {
    const events: { type: string; name: string; status?: string }[] = [];
    const scenarios: RunnableScenario[] = [
      scenarioFor("p1", "a11y-clean.html", [
        { type: "assertVisible", selector: "h1" },
      ]),
      scenarioFor("p2", "a11y-clean.html", [
        { type: "assertVisible", selector: "h1" },
      ]),
    ];
    const result = await runSuite(scenarios, {
      workers: 2,
      onProgress: (e) => events.push({ type: e.type, name: e.name, status: e.status }),
    });
    for (const s of result.scenarios) sessionDirs.push(s.sessionDir);

    const starts = events.filter((e) => e.type === "scenario-start");
    const completes = events.filter((e) => e.type === "scenario-complete");
    expect(starts).toHaveLength(2);
    expect(completes).toHaveLength(2);
    expect(completes.every((e) => e.status === "pass")).toBe(true);
  });
});
