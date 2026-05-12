import type { BrowserManager } from "../playwright/browser-manager.js";
import { scaffoldScenario } from "../scenario/scaffolder.js";
import { logger } from "../utils/logger.js";

export function getScenarioToolDefinitions() {
  return [
    {
      name: "webmobai_generate_scenario",
      description:
        "Inspect the currently-loaded page and produce a starter scenario JSON. Detects forms, navigation links, and CTAs; emits assertVisible/assertText steps plus sample form fills. The result is a first draft — review, tighten, and save to disk before running with webmobai-scenario.",
      inputSchema: {
        type: "object" as const,
        properties: {
          name: {
            type: "string",
            description: "Optional human-readable name for the scenario.",
          },
        },
      },
    },
  ];
}

export async function handleScenarioTool(
  name: string,
  args: Record<string, unknown>,
  browserManager: BrowserManager,
): Promise<{ content: { type: "text"; text: string }[] }> {
  try {
    switch (name) {
      case "webmobai_generate_scenario": {
        const scenarioName = args.name as string | undefined;
        const url = browserManager.page.url();
        const scenario = await scaffoldScenario(browserManager.page, url, {
          name: scenarioName,
        });
        return {
          content: [
            {
              type: "text" as const,
              text:
                `# Generated scenario (${scenario.steps.length} steps)\n\n` +
                "Review, tighten, and save to disk; run with `webmobai-scenario path.json`.\n\n" +
                "```json\n" +
                JSON.stringify(scenario, null, 2) +
                "\n```",
            },
          ],
        };
      }
      default:
        return text(`Unknown scenario tool: ${name}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Scenario tool error (${name}): ${msg}`);
    return text(`Error executing ${name}: ${msg}`);
  }
}

function text(message: string) {
  return { content: [{ type: "text" as const, text: message }] };
}
