import { BrowserManager } from "../playwright/browser-manager.js";
import { handleAssertionTool } from "../tools/assertion-tools.js";
import { handleRouteTool } from "../tools/route-tools.js";
import { logger } from "../utils/logger.js";
import type {
  Scenario,
  ScenarioResult,
  ScenarioStep,
  ScenarioStepResult,
} from "./types.js";

/**
 * Execute a scenario from start to finish against a fresh browser session.
 * Returns a structured result with one entry per step. The caller owns the
 * BrowserManager lifecycle — pass an already-launched manager, and the
 * runner uses it.
 *
 * Stop semantics: on first failed step the runner halts and marks remaining
 * steps as "skipped" — unless the scenario has continueOnFailure: true.
 */
export async function runScenario(
  scenario: Scenario,
  browser: BrowserManager,
): Promise<ScenarioResult> {
  const startedAt = Date.now();
  const results: ScenarioStepResult[] = [];

  // Always start by navigating to the scenario's URL — explicit, since
  // BrowserManager.launch doesn't navigate by itself.
  await browser.navigate(scenario.url);

  let halted = false;
  for (const step of scenario.steps) {
    if (halted) {
      results.push({
        step,
        status: "skipped",
        message: "Skipped after earlier failure",
        durationMs: 0,
      });
      continue;
    }
    const stepStart = Date.now();
    try {
      await executeStep(step, browser);
      results.push({
        step,
        status: "pass",
        message: stepLabel(step),
        durationMs: Date.now() - stepStart,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        step,
        status: "fail",
        message: msg,
        durationMs: Date.now() - stepStart,
      });
      if (!scenario.continueOnFailure) halted = true;
    }
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skipped").length;

  return {
    scenarioName: scenario.name,
    url: scenario.url,
    startedAt,
    completedAt: Date.now(),
    results,
    summary: { total: results.length, passed, failed, skipped },
  };
}

async function executeStep(
  step: ScenarioStep,
  browser: BrowserManager,
): Promise<void> {
  logger.info(`Scenario step: ${step.type}`);
  const page = browser.page;
  switch (step.type) {
    case "navigate":
      await browser.navigate(step.url);
      return;
    case "click":
      await browser.click(step.selector);
      return;
    case "type":
      await browser.type(step.selector, step.text);
      return;
    case "select":
      await page.selectOption(step.selector, step.value);
      return;
    case "press":
      await page.keyboard.press(step.key);
      return;
    case "scroll":
      await browser.scroll(step.direction ?? "down", step.amount ?? 500);
      return;
    case "wait": {
      const timeout = step.timeoutMs ?? 10_000;
      if (step.selector) {
        await page.waitForSelector(step.selector, { state: "visible", timeout });
      } else if (step.urlContains) {
        await page.waitForURL(`**/*${step.urlContains}*`, { timeout });
      } else {
        await page.waitForTimeout(timeout);
      }
      return;
    }
    case "screenshot":
      await browser.screenshot(step.description ?? "scenario step");
      return;
    case "route":
      await handleRouteTool(
        "webmobai_route",
        {
          pattern: step.pattern,
          action: step.action,
          status: step.status,
          body: step.body,
          content_type: step.contentType,
        },
        browser,
      );
      return;
    case "assertVisible":
    case "assertHidden":
    case "assertText":
    case "assertUrl":
    case "assertCount": {
      const toolName = `webmobai_${step.type
        .replace(/^assert/, "assert_")
        .toLowerCase()}`;
      const args = scenarioAssertionArgs(step);
      const result = await handleAssertionTool(toolName, args, browser);
      const text = result.content[0]?.text ?? "";
      if (text.startsWith("FAIL")) throw new Error(text);
      return;
    }
    default: {
      // Exhaustiveness check via never. If this branch is ever reachable a
      // future ScenarioStep variant was added without handling.
      const _exhaustive: never = step;
      throw new Error(`Unknown scenario step: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function scenarioAssertionArgs(
  step: Extract<
    ScenarioStep,
    {
      type:
        | "assertVisible"
        | "assertHidden"
        | "assertText"
        | "assertUrl"
        | "assertCount";
    }
  >,
): Record<string, unknown> {
  switch (step.type) {
    case "assertVisible":
    case "assertHidden":
      return { selector: step.selector, timeout_ms: step.timeoutMs };
    case "assertText":
      return {
        selector: step.selector,
        expected: step.expected,
        exact: step.exact,
        timeout_ms: step.timeoutMs,
      };
    case "assertUrl":
      return {
        contains: step.contains,
        pattern: step.pattern,
        timeout_ms: step.timeoutMs,
      };
    case "assertCount":
      return {
        selector: step.selector,
        expected: step.expected,
        timeout_ms: step.timeoutMs,
      };
  }
}

function stepLabel(step: ScenarioStep): string {
  if ("description" in step && step.description) return step.description;
  switch (step.type) {
    case "navigate":
      return `Navigate to ${step.url}`;
    case "click":
      return `Click ${step.selector}`;
    case "type":
      return `Type into ${step.selector}`;
    case "select":
      return `Select ${step.value} in ${step.selector}`;
    case "press":
      return `Press ${step.key}`;
    case "scroll":
      return `Scroll ${step.direction ?? "down"} ${step.amount ?? 500}px`;
    case "wait":
      return step.selector
        ? `Wait for ${step.selector}`
        : step.urlContains
          ? `Wait for URL contains ${step.urlContains}`
          : `Wait ${step.timeoutMs ?? 10000}ms`;
    case "screenshot":
      return `Screenshot${step.description ? ` (${step.description})` : ""}`;
    case "route":
      return `Route ${step.pattern} → ${step.action}`;
    case "assertVisible":
      return `Assert ${step.selector} visible`;
    case "assertHidden":
      return `Assert ${step.selector} hidden`;
    case "assertText":
      return `Assert ${step.selector} contains "${step.expected}"`;
    case "assertUrl":
      return `Assert URL matches`;
    case "assertCount":
      return `Assert ${step.selector} count = ${step.expected}`;
  }
}
