/**
 * Lighthouse MCP tool (Sprint 16). One-tool group, kept separate from
 * perf-tools so the `lighthouse` + `chrome-launcher` packages stay optional
 * and the browser-requirement story is clean: Lighthouse spawns its own
 * headless Chrome, so the caller's BrowserManager session is irrelevant.
 */

import type { BrowserManager } from "../playwright/browser-manager.js";
import {
  runLighthouse,
  formatLighthouseMarkdown,
  LighthouseUnavailableError,
} from "../perf/lighthouse.js";
import { logger } from "../utils/logger.js";

export function getLighthouseToolDefinitions() {
  return [
    {
      name: "webmobai_lighthouse_audit",
      description:
        "Run a full Google Lighthouse audit and return the official Performance, Accessibility, Best Practices, and SEO scores plus the lowest-scoring audits. Complements (doesn't replace) WebMobAI's per-axis tools. Lighthouse and chrome-launcher are optional dependencies — if missing, the tool returns install instructions. No browser is required: Lighthouse spawns its own headless Chrome.",
      inputSchema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description:
              "URL to audit. Defaults to the current page URL when a browser is launched.",
          },
        },
      },
    },
  ];
}

export async function handleLighthouseTool(
  name: string,
  args: Record<string, unknown>,
  browserManager: BrowserManager,
): Promise<{ content: { type: "text"; text: string }[] }> {
  if (name !== "webmobai_lighthouse_audit") {
    return text(`Unknown lighthouse tool: ${name}`);
  }
  const explicitUrl = args.url as string | undefined;
  const url =
    explicitUrl ??
    (browserManager.isLaunched ? browserManager.page.url() : undefined);
  if (!url) {
    return text(
      "Provide a `url` argument, or launch a browser first so we can audit the current page.",
    );
  }
  try {
    const result = await runLighthouse(url);
    return text(formatLighthouseMarkdown(result));
  } catch (err) {
    if (err instanceof LighthouseUnavailableError) {
      return text(err.message);
    }
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Lighthouse audit failed: ${msg}`);
    return text(`Lighthouse audit failed: ${msg}`);
  }
}

function text(message: string) {
  return { content: [{ type: "text" as const, text: message }] };
}
