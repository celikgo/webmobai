import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import type { Scenario } from "../scenario/types.js";
import type {
  RunnableScenario,
  Suite,
  SuiteDefaults,
  SuiteEntry,
} from "./types.js";

/**
 * Read a suite JSON file and produce a flat list of runnable scenarios with
 * their tags. Path-based entries are resolved relative to the suite file's
 * directory, so a suite at /repo/suites/e2e.json with `path: "./login.json"`
 * loads /repo/suites/login.json.
 *
 * Suite defaults (browser, viewport, device, continueOnFailure) are applied
 * to each scenario as a fallback — explicit values on the scenario itself
 * win.
 */
export async function loadSuite(suitePath: string): Promise<{
  suite: Suite;
  runnables: RunnableScenario[];
}> {
  const absPath = resolve(suitePath);
  const raw = await readFile(absPath, "utf-8");
  const suite = parseSuite(raw);
  const suiteDir = dirname(absPath);
  const runnables = await resolveEntries(suite, suiteDir);
  return { suite, runnables };
}

export function parseSuite(raw: string): Suite {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Suite file is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Suite file must be a JSON object");
  }
  const obj = parsed as Partial<Suite>;
  if (!obj.name || typeof obj.name !== "string") {
    throw new Error("Suite must have a string `name`");
  }
  if (!Array.isArray(obj.scenarios)) {
    throw new Error("Suite must have a `scenarios` array");
  }
  return obj as Suite;
}

async function resolveEntries(
  suite: Suite,
  suiteDir: string,
): Promise<RunnableScenario[]> {
  const out: RunnableScenario[] = [];
  for (const entry of suite.scenarios) {
    const scenario = await resolveOne(entry, suiteDir);
    const merged = applyDefaults(scenario, suite.defaults);
    out.push({
      scenario: merged,
      tags: entry.tags ?? [],
      sourcePath: "path" in entry ? entry.path : undefined,
    });
  }
  return out;
}

async function resolveOne(
  entry: SuiteEntry,
  suiteDir: string,
): Promise<Scenario> {
  if ("scenario" in entry) {
    return entry.scenario;
  }
  const path = isAbsolute(entry.path) ? entry.path : resolve(suiteDir, entry.path);
  const raw = await readFile(path, "utf-8");
  try {
    const scenario = JSON.parse(raw) as Scenario;
    if (entry.name) scenario.name = entry.name;
    return scenario;
  } catch (err) {
    throw new Error(
      `Scenario "${path}" is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function applyDefaults(scenario: Scenario, defaults?: SuiteDefaults): Scenario {
  if (!defaults) return scenario;
  return {
    ...scenario,
    viewport: scenario.viewport ?? defaults.viewport,
    browser: scenario.browser ?? defaults.browser,
    device: scenario.device ?? defaults.device,
    continueOnFailure:
      scenario.continueOnFailure ?? defaults.continueOnFailure,
  };
}
