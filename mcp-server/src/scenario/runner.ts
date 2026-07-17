import { BrowserManager } from "../playwright/browser-manager.js";
import { handleAssertionTool } from "../tools/assertion-tools.js";
import { handleRouteTool } from "../tools/route-tools.js";
import { handleVisualTool } from "../tools/visual-tools.js";
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

/**
 * A tool handler signals success with a known text prefix and signals failure
 * either by throwing or by returning an error/FAIL string. Treat anything that
 * is not an explicit success as a step failure — otherwise a capture error, a
 * missing baseline, or a failed route install slips through as PASS, which is
 * the "reports green on a red build" defect this runner must never have.
 */
function requireToolSuccess(
  result: { content: { type: "text"; text: string }[] },
  successPrefixes: string[],
): void {
  const text = result.content[0]?.text ?? "";
  if (!successPrefixes.some((p) => text.startsWith(p))) {
    throw new Error(text || "Tool returned no result");
  }
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
    case "saveStorageState":
      // Persist the current (typically just-logged-in) session for later
      // authenticated replays. Never log the path here — it's a secrets file.
      await browser.saveStorageState(step.path);
      return;
    case "pauseForManual": {
      const promptMsg =
        step.prompt ?? "Complete the manual step (MFA / CAPTCHA / SSO), then wait.";
      if (browser.isHeadless) {
        // No human is watching a headless run — waiting would just burn time
        // and still fail. Record a clear warning and continue immediately.
        logger.warn(
          `pauseForManual skipped in headless mode: "${promptMsg}". ` +
            "Run headed (or pre-save a storageState) so a human can complete it.",
        );
        return;
      }
      // Headed: give the human a bounded window to act, then continue. We do a
      // timed wait rather than blocking on stdin so the same runner is safe
      // under the MCP server and parallel suite workers (which have no TTY).
      const waitMs = Math.min(Math.max(step.timeoutMs ?? 30_000, 0), 300_000);
      logger.info(
        `pauseForManual: ${promptMsg} — continuing in ${Math.round(waitMs / 1000)}s.`,
      );
      await page.waitForTimeout(waitMs);
      return;
    }
    case "route": {
      const result = await handleRouteTool(
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
      // A failed route install ("Error executing …") would otherwise be
      // silently ignored, leaving the mock uninstalled while the step passes
      // and later steps hit the real backend.
      requireToolSuccess(result, ["Route active"]);
      return;
    }
    case "visualSnapshot": {
      const result = await handleVisualTool(
        "webmobai_visual_snapshot",
        {
          name: step.name,
          baseline_dir: step.baselineDir,
          selector: step.selector,
          full_page: step.fullPage,
          threshold: step.threshold,
          max_diff_pixels: step.maxDiffPixels,
          max_diff_pixel_ratio: step.maxDiffPixelRatio,
          update_baseline: step.updateBaseline,
        },
        browser,
      );
      // The visual tool signals a real diff with "FAIL" but signals a capture
      // error / missing baseline / bad selector with "Error executing …" or a
      // validation string — none of which start with "FAIL". Whitelist the two
      // success prefixes so only an explicit pass is a pass.
      requireToolSuccess(result, ["PASS", "Visual baseline"]);
      return;
    }
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
      requireToolSuccess(result, ["PASS"]);
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
    case "saveStorageState":
      return "Save authenticated session (storageState)";
    case "pauseForManual":
      return `Pause for manual step${step.prompt ? ` (${step.prompt})` : ""}`;
    case "route":
      return `Route ${step.pattern} → ${step.action}`;
    case "visualSnapshot":
      return `Visual snapshot "${step.name}"`;
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
