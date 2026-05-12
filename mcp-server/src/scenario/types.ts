/**
 * Scenario format. Designed so an AI client (Claude) can convert a
 * natural-language test description into structured JSON, then a deterministic
 * runner replays it. Steps map 1:1 to actions a human tester would do.
 *
 * A scenario is a JSON document with:
 *   - `name`: human-readable suite name
 *   - `url`: target URL the scenario starts from
 *   - `viewport` (optional): viewport size, or pull from RunConfig defaults
 *   - `steps`: ordered list of actions/assertions
 *
 * Each step is one verb + its arguments. The runner executes them in order,
 * stops on first failure (unless `continueOnFailure: true`), and produces a
 * standard TestReport with one TestResult per step.
 *
 * We intentionally keep the verb set narrow — the same surface as the
 * existing MCP tool calls. This means Claude already knows how to fill them.
 */

export interface Scenario {
  name: string;
  url: string;
  description?: string;
  viewport?: { width: number; height: number };
  browser?: "chromium" | "firefox" | "webkit";
  device?: string;
  continueOnFailure?: boolean;
  steps: ScenarioStep[];
}

export type ScenarioStep =
  | { type: "navigate"; url: string }
  | { type: "click"; selector: string; description?: string }
  | { type: "type"; selector: string; text: string; description?: string }
  | { type: "select"; selector: string; value: string; description?: string }
  | { type: "press"; key: string; description?: string }
  | { type: "scroll"; direction?: "up" | "down"; amount?: number }
  | {
      type: "wait";
      selector?: string;
      urlContains?: string;
      timeoutMs?: number;
      description?: string;
    }
  | {
      type: "assertVisible";
      selector: string;
      timeoutMs?: number;
      description?: string;
    }
  | {
      type: "assertHidden";
      selector: string;
      timeoutMs?: number;
      description?: string;
    }
  | {
      type: "assertText";
      selector: string;
      expected: string;
      exact?: boolean;
      timeoutMs?: number;
      description?: string;
    }
  | {
      type: "assertUrl";
      contains?: string;
      pattern?: string;
      timeoutMs?: number;
      description?: string;
    }
  | {
      type: "assertCount";
      selector: string;
      expected: number;
      timeoutMs?: number;
      description?: string;
    }
  | { type: "screenshot"; description?: string }
  | {
      type: "route";
      pattern: string;
      action: "fulfill" | "abort" | "continue";
      status?: number;
      body?: string;
      contentType?: string;
    };

export interface ScenarioStepResult {
  step: ScenarioStep;
  status: "pass" | "fail" | "skipped";
  message: string;
  durationMs: number;
}

export interface ScenarioResult {
  scenarioName: string;
  url: string;
  startedAt: number;
  completedAt: number;
  results: ScenarioStepResult[];
  summary: { total: number; passed: number; failed: number; skipped: number };
}
