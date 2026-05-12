import type { Scenario } from "../scenario/types.js";

/**
 * A Suite is a collection of scenarios that run together. Suite files are
 * JSON. Scenarios are referenced either by path (resolved relative to the
 * suite file) or inlined directly.
 *
 * `defaults` lets the suite override browser/viewport/etc. for every
 * scenario without modifying each one — useful when running the same suite
 * across mobile/desktop or chromium/firefox.
 *
 * Tags drive filtering (`--tag smoke`) and let teams group scenarios by
 * scope, criticality, or feature area.
 */
export interface Suite {
  name: string;
  description?: string;
  defaults?: SuiteDefaults;
  scenarios: SuiteEntry[];
}

export interface SuiteDefaults {
  viewport?: { width: number; height: number };
  browser?: "chromium" | "firefox" | "webkit";
  device?: string;
  continueOnFailure?: boolean;
}

export type SuiteEntry = SuitePathEntry | SuiteInlineEntry;

export interface SuitePathEntry {
  path: string;
  name?: string;
  tags?: string[];
}

export interface SuiteInlineEntry {
  scenario: Scenario;
  tags?: string[];
}

/**
 * After the loader resolves SuiteEntry instances we have a flat list of
 * runnable scenarios with their tags. This is the shape the filter,
 * shard, and runner operate on.
 */
export interface RunnableScenario {
  scenario: Scenario;
  tags: string[];
  sourcePath?: string;
}

export interface SuiteRunOptions {
  workers?: number;
  shard?: { index: number; total: number };
  includeTags?: string[];
  excludeTags?: string[];
}
