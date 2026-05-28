/**
 * Natural-language → Scenario JSON. The user describes a flow in English
 * ("test the login form with a bad password and verify the error"); Claude
 * reads the current live page (title, headings, interactive elements) and
 * produces a Scenario document the existing runner can execute.
 *
 * Output is validated against a Zod schema before being returned, so a
 * malformed JSON or an unknown step type fails loudly rather than producing a
 * broken scenario.
 */

import { z } from "zod";
import { complete } from "./client.js";
import type { Scenario } from "../scenario/types.js";
import type { BrowserManager } from "../playwright/browser-manager.js";

const SCENARIO_SYSTEM = `You convert a natural-language test description plus a snapshot of the current page into a WebMobAI Scenario JSON document.

You will receive:
  - the page URL (starting point)
  - the user's natural-language description of what to test
  - a compact summary of the page (title, h1s, top interactive elements with their selectors)

Output rules:
  - Output ONLY the JSON document. No prose, no code fences, no markdown.
  - The document MUST conform to the WebMobAI Scenario format below.
  - Prefer stable selectors. Order: [data-testid="…"] > #id > [aria-label="…"] > [role="…"] > text=…
  - Steps are deterministic; avoid relying on timing — use 'wait' with a selector or urlContains, not a raw timeoutMs unless unavoidable.
  - Add an assertion after each meaningful interaction so the scenario actually verifies behavior.

Scenario shape:
{
  "name": string,                       // short, imperative ("Login with bad password")
  "url": string,                        // same as the provided page URL
  "description": string,                // 1 line restating the goal
  "steps": [ ScenarioStep, ... ]
}

ScenarioStep is one of (use the exact "type" string):
  { "type": "navigate", "url": string }
  { "type": "click", "selector": string, "description"?: string }
  { "type": "type", "selector": string, "text": string, "description"?: string }
  { "type": "select", "selector": string, "value": string }
  { "type": "press", "key": string }
  { "type": "scroll", "direction"?: "up"|"down", "amount"?: number }
  { "type": "wait", "selector"?: string, "urlContains"?: string, "timeoutMs"?: number }
  { "type": "assertVisible", "selector": string, "timeoutMs"?: number }
  { "type": "assertHidden",  "selector": string, "timeoutMs"?: number }
  { "type": "assertText",    "selector": string, "expected": string, "exact"?: boolean }
  { "type": "assertUrl",     "contains"?: string, "pattern"?: string }
  { "type": "assertCount",   "selector": string, "expected": number }
  { "type": "screenshot",    "description"?: string }
  { "type": "visualSnapshot","name": string, "fullPage"?: boolean }`;

const stepSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("navigate"), url: z.string() }),
  z.object({
    type: z.literal("click"),
    selector: z.string(),
    description: z.string().optional(),
  }),
  z.object({
    type: z.literal("type"),
    selector: z.string(),
    text: z.string(),
    description: z.string().optional(),
  }),
  z.object({
    type: z.literal("select"),
    selector: z.string(),
    value: z.string(),
    description: z.string().optional(),
  }),
  z.object({
    type: z.literal("press"),
    key: z.string(),
    description: z.string().optional(),
  }),
  z.object({
    type: z.literal("scroll"),
    direction: z.enum(["up", "down"]).optional(),
    amount: z.number().optional(),
  }),
  z.object({
    type: z.literal("wait"),
    selector: z.string().optional(),
    urlContains: z.string().optional(),
    timeoutMs: z.number().optional(),
    description: z.string().optional(),
  }),
  z.object({
    type: z.literal("assertVisible"),
    selector: z.string(),
    timeoutMs: z.number().optional(),
    description: z.string().optional(),
  }),
  z.object({
    type: z.literal("assertHidden"),
    selector: z.string(),
    timeoutMs: z.number().optional(),
    description: z.string().optional(),
  }),
  z.object({
    type: z.literal("assertText"),
    selector: z.string(),
    expected: z.string(),
    exact: z.boolean().optional(),
    timeoutMs: z.number().optional(),
    description: z.string().optional(),
  }),
  z.object({
    type: z.literal("assertUrl"),
    contains: z.string().optional(),
    pattern: z.string().optional(),
    timeoutMs: z.number().optional(),
    description: z.string().optional(),
  }),
  z.object({
    type: z.literal("assertCount"),
    selector: z.string(),
    expected: z.number(),
    timeoutMs: z.number().optional(),
    description: z.string().optional(),
  }),
  z.object({
    type: z.literal("screenshot"),
    description: z.string().optional(),
  }),
  z.object({
    type: z.literal("visualSnapshot"),
    name: z.string(),
    fullPage: z.boolean().optional(),
    description: z.string().optional(),
  }),
]);

const scenarioSchema = z.object({
  name: z.string().min(1),
  url: z.string().min(1),
  description: z.string().optional(),
  steps: z.array(stepSchema).min(1),
});

export interface GenerateScenarioInput {
  /** Natural-language description of the test to author. */
  description: string;
  browserManager: BrowserManager;
}

export interface GenerateScenarioResult {
  scenario: Scenario;
  rawText: string;
}

export async function generateScenarioFromPrompt(
  input: GenerateScenarioInput,
): Promise<GenerateScenarioResult> {
  const page = input.browserManager.page;
  const url = page.url();

  // Compact page summary fed to the model. Kept short on purpose — we only
  // want the model to know which controls exist, not the full DOM.
  const pageSummary = await page.evaluate(() => {
    const trunc = (s: string | null | undefined, n: number) =>
      s ? s.replace(/\s+/g, " ").trim().slice(0, n) : "";
    const interactive = Array.from(
      document.querySelectorAll<HTMLElement>(
        'a, button, input, select, textarea, [role="button"], [role="link"]',
      ),
    )
      .slice(0, 30)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute("role") || undefined,
        testid: el.getAttribute("data-testid") || undefined,
        id: el.id || undefined,
        name: el.getAttribute("name") || undefined,
        type: el.getAttribute("type") || undefined,
        aria: el.getAttribute("aria-label") || undefined,
        text: trunc(el.innerText, 60),
        placeholder: el.getAttribute("placeholder") || undefined,
      }));
    return {
      title: document.title,
      h1s: Array.from(document.querySelectorAll("h1"))
        .map((h) => trunc((h as HTMLElement).innerText, 80))
        .slice(0, 3),
      interactive,
    };
  });

  const summaryLines: string[] = [];
  summaryLines.push(`Page URL: ${url}`);
  summaryLines.push(`Page title: ${pageSummary.title}`);
  if (pageSummary.h1s.length > 0) {
    summaryLines.push(`H1s: ${pageSummary.h1s.map((s) => `"${s}"`).join(", ")}`);
  }
  summaryLines.push("");
  summaryLines.push("Interactive elements:");
  pageSummary.interactive.forEach((el, i) => {
    const parts = [
      el.tag,
      el.type ? `type=${el.type}` : null,
      el.testid ? `data-testid="${el.testid}"` : null,
      el.id ? `id="${el.id}"` : null,
      el.name ? `name="${el.name}"` : null,
      el.aria ? `aria-label="${el.aria}"` : null,
      el.role ? `role="${el.role}"` : null,
      el.placeholder ? `placeholder="${el.placeholder}"` : null,
      el.text ? `text="${el.text}"` : null,
    ].filter(Boolean);
    summaryLines.push(`  ${i + 1}. ${parts.join(" ")}`);
  });
  summaryLines.push("");
  summaryLines.push("## User description");
  summaryLines.push(input.description);

  const { text } = await complete({
    system: SCENARIO_SYSTEM,
    userContent: summaryLines.join("\n"),
    maxTokens: 2048,
  });

  const scenario = parseAndValidateScenarioJson(text);
  return { scenario, rawText: text };
}

/**
 * Parse and zod-validate a Scenario JSON document emitted by the model.
 * Tolerates leading/trailing whitespace and optional ```json … ``` fences.
 * Exported so tests can verify validation behavior without an API call.
 */
export function parseAndValidateScenarioJson(text: string): Scenario {
  const cleaned = stripCodeFences(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Scenario generator returned non-JSON output: ${(err as Error).message}\n--- raw ---\n${text}`,
    );
  }
  return scenarioSchema.parse(parsed) as Scenario;
}

// The model is told to output bare JSON, but it sometimes still wraps the
// answer in ```json … ``` fences. Strip them defensively.
function stripCodeFences(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json|JSON)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}
