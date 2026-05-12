import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSuite, parseSuite } from "../src/suite/loader.js";

let dir: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

async function setupSuite(
  files: Record<string, unknown>,
): Promise<{ suitePath: string }> {
  dir = mkdtempSync(join(tmpdir(), "webmobai-suite-"));
  for (const [name, data] of Object.entries(files)) {
    await writeFile(join(dir, name), JSON.stringify(data), "utf-8");
  }
  return { suitePath: join(dir, "suite.json") };
}

describe("parseSuite", () => {
  it("accepts a minimal valid suite", () => {
    const s = parseSuite(
      JSON.stringify({ name: "minimal", scenarios: [] }),
    );
    expect(s.name).toBe("minimal");
    expect(s.scenarios).toHaveLength(0);
  });

  it("rejects non-JSON", () => {
    expect(() => parseSuite("{not json")).toThrow(/not valid JSON/);
  });

  it("rejects missing name", () => {
    expect(() => parseSuite("{}")).toThrow(/`name`/);
  });

  it("rejects missing scenarios array", () => {
    expect(() => parseSuite(JSON.stringify({ name: "x" }))).toThrow(/scenarios/);
  });
});

describe("loadSuite", () => {
  it("resolves path-based entries relative to the suite file", async () => {
    const scenario1 = {
      name: "login",
      url: "https://example.com/login",
      steps: [{ type: "assertVisible", selector: "h1" }],
    };
    const scenario2 = {
      name: "signup",
      url: "https://example.com/signup",
      steps: [{ type: "assertVisible", selector: "form" }],
    };
    const { suitePath } = await setupSuite({
      "suite.json": {
        name: "auth",
        scenarios: [
          { path: "./login.json", tags: ["smoke"] },
          { path: "./signup.json", tags: ["e2e"] },
        ],
      },
      "login.json": scenario1,
      "signup.json": scenario2,
    });

    const { runnables } = await loadSuite(suitePath);
    expect(runnables).toHaveLength(2);
    expect(runnables[0]!.scenario.name).toBe("login");
    expect(runnables[0]!.tags).toEqual(["smoke"]);
    expect(runnables[1]!.scenario.name).toBe("signup");
    expect(runnables[1]!.tags).toEqual(["e2e"]);
  });

  it("supports inline scenario entries", async () => {
    const { suitePath } = await setupSuite({
      "suite.json": {
        name: "inline",
        scenarios: [
          {
            scenario: {
              name: "smoke check",
              url: "https://example.com",
              steps: [],
            },
            tags: ["smoke"],
          },
        ],
      },
    });
    const { runnables } = await loadSuite(suitePath);
    expect(runnables).toHaveLength(1);
    expect(runnables[0]!.scenario.name).toBe("smoke check");
  });

  it("applies suite defaults to scenarios that don't override them", async () => {
    const { suitePath } = await setupSuite({
      "suite.json": {
        name: "with defaults",
        defaults: {
          browser: "firefox",
          viewport: { width: 1024, height: 768 },
          continueOnFailure: true,
        },
        scenarios: [
          {
            scenario: { name: "uses defaults", url: "https://example.com", steps: [] },
          },
          {
            scenario: {
              name: "overrides browser",
              url: "https://example.com",
              browser: "webkit",
              steps: [],
            },
          },
        ],
      },
    });
    const { runnables } = await loadSuite(suitePath);
    expect(runnables[0]!.scenario.browser).toBe("firefox");
    expect(runnables[0]!.scenario.viewport).toEqual({
      width: 1024,
      height: 768,
    });
    expect(runnables[0]!.scenario.continueOnFailure).toBe(true);
    // The second scenario keeps its explicit browser.
    expect(runnables[1]!.scenario.browser).toBe("webkit");
    // But picks up the default viewport since it didn't override it.
    expect(runnables[1]!.scenario.viewport).toEqual({
      width: 1024,
      height: 768,
    });
  });

  it("preserves the original tag list", async () => {
    const { suitePath } = await setupSuite({
      "suite.json": {
        name: "tagged",
        scenarios: [
          {
            scenario: { name: "x", url: "https://example.com", steps: [] },
            tags: ["a", "b", "c"],
          },
        ],
      },
    });
    const { runnables } = await loadSuite(suitePath);
    expect(runnables[0]!.tags).toEqual(["a", "b", "c"]);
  });
});
