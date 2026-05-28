/**
 * AI-powered MCP tools (Sprint 15). Each tool gates on WEBMOBAI_ANTHROPIC_API_KEY
 * — when no key is set, the response is a clean "AI disabled" message instead
 * of a failure. The three deliverables are:
 *
 *   - webmobai_explain_visual_diff           (no browser required)
 *   - webmobai_summarize_audit               (browser required — fresh a11y + perf)
 *   - webmobai_generate_scenario_from_prompt (browser required — current page state)
 */

import type { BrowserManager } from "../playwright/browser-manager.js";
import { PageAnalyzer } from "../playwright/page-analyzer.js";
import { isAiEnabled, AiDisabledError } from "../ai/client.js";
import { AI_DISABLED_MESSAGE } from "../ai/config.js";
import { narrateVisualDiff } from "../ai/visual-narrator.js";
import { summarizeAudit } from "../ai/audit-summarizer.js";
import { generateScenarioFromPrompt } from "../ai/scenario-generator.js";
import { getSessionResults } from "./reporting-tools.js";
import { logger } from "../utils/logger.js";

export function getAiToolDefinitions() {
  return [
    {
      name: "webmobai_explain_visual_diff",
      description:
        "AI-powered narration of a visual regression diff. Pass the paths to the baseline + actual PNGs (and optionally the diff mask PNG produced by webmobai_visual_snapshot) and Claude returns a plain-English bullet list of what visibly changed, plus a severity tag (cosmetic | content | structural). Requires WEBMOBAI_ANTHROPIC_API_KEY.",
      inputSchema: {
        type: "object" as const,
        properties: {
          baseline_path: { type: "string", description: "Absolute path to the baseline PNG." },
          actual_path: { type: "string", description: "Absolute path to the actual (current) PNG." },
          diff_path: {
            type: "string",
            description:
              "Optional path to the pixelmatch diff mask PNG (red highlights). Including this improves accuracy of the narration.",
          },
          snapshot_name: {
            type: "string",
            description: "Optional snapshot name (e.g., 'checkout/cart-empty') for context.",
          },
        },
        required: ["baseline_path", "actual_path"],
      },
    },
    {
      name: "webmobai_summarize_audit",
      description:
        "AI-powered executive summary of the current audit. Collects accumulated test results + console errors from this session, plus a fresh accessibility audit and performance snapshot, then asks Claude to produce a prioritized markdown summary with top fixes and what's working. Browser must be launched. Requires WEBMOBAI_ANTHROPIC_API_KEY.",
      inputSchema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description:
              "URL being audited (used in the summary header). Defaults to the current page URL.",
          },
        },
      },
    },
    {
      name: "webmobai_generate_scenario_from_prompt",
      description:
        "Generate a WebMobAI Scenario JSON from a natural-language description. Reads the current page (title, headings, interactive elements with selectors) and asks Claude to compose a deterministic, validated scenario you can run with webmobai-scenario. Browser must be launched on the target page. Requires WEBMOBAI_ANTHROPIC_API_KEY.",
      inputSchema: {
        type: "object" as const,
        properties: {
          description: {
            type: "string",
            description:
              "What the scenario should do, in plain English. Example: 'test the login form with a bad password and verify the inline error appears'.",
          },
        },
        required: ["description"],
      },
    },
  ];
}

export async function handleAiTool(
  name: string,
  args: Record<string, unknown>,
  browserManager: BrowserManager,
): Promise<{ content: { type: "text"; text: string }[] }> {
  if (!isAiEnabled()) return text(AI_DISABLED_MESSAGE);

  try {
    switch (name) {
      case "webmobai_explain_visual_diff": {
        // No browser required — just reads images from disk.
        const baselinePath = args.baseline_path as string;
        const actualPath = args.actual_path as string;
        const diffPath = args.diff_path as string | undefined;
        const snapshotName = args.snapshot_name as string | undefined;
        if (!baselinePath || !actualPath) {
          return text("baseline_path and actual_path are required.");
        }
        const narration = await narrateVisualDiff({
          baselinePath,
          actualPath,
          diffPath,
          snapshotName,
        });
        return text(narration);
      }

      case "webmobai_summarize_audit": {
        if (!browserManager.isLaunched) return browserRequired();
        const url = (args.url as string | undefined) ?? browserManager.page.url();
        const analyzer = new PageAnalyzer(browserManager.page, browserManager);
        const a11y = await analyzer.runAccessibilityAudit();
        const perf = await analyzer.getPerformanceMetrics();
        const consoleErrors = browserManager.getConsoleErrors();
        const summary = await summarizeAudit({
          url,
          a11y,
          perf,
          consoleErrors,
          testResults: getSessionResults(),
        });
        return text(summary);
      }

      case "webmobai_generate_scenario_from_prompt": {
        if (!browserManager.isLaunched) return browserRequired();
        const description = args.description as string;
        if (!description || description.trim().length === 0) {
          return text("`description` is required.");
        }
        const { scenario, rawText } = await generateScenarioFromPrompt({
          description,
          browserManager,
        });
        return text(
          `# Scenario\n\n\`\`\`json\n${JSON.stringify(scenario, null, 2)}\n\`\`\`\n\n` +
            `Save this JSON to a file and run it with:\n\n` +
            `    webmobai-scenario <path-to-file>.json\n\n` +
            (rawText !== JSON.stringify(scenario, null, 2)
              ? `_(Model raw output preserved internally; only the validated scenario is shown above.)_`
              : ""),
        );
      }

      default:
        return text(`Unknown AI tool: ${name}`);
    }
  } catch (err) {
    if (err instanceof AiDisabledError) return text(AI_DISABLED_MESSAGE);
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`AI tool error (${name}): ${msg}`);
    return text(`Error executing ${name}: ${msg}`);
  }
}

function text(message: string) {
  return { content: [{ type: "text" as const, text: message }] };
}

function browserRequired() {
  return text("Browser is not launched. Call webmobai_launch_browser first.");
}
