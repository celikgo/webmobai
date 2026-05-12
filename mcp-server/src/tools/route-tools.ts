import type { BrowserManager } from "../playwright/browser-manager.js";
import { logger } from "../utils/logger.js";

/**
 * Request interception tools. Lets Claude (or the standalone runner) freeze
 * API responses, simulate error states, or block third-party requests during
 * a test — the same Playwright capability that makes deterministic E2E
 * possible.
 *
 * Routes are tracked here so unroute can target a specific pattern; this
 * matters because Playwright's page.unroute requires the same handler
 * reference, not just the URL.
 */

interface ActiveRoute {
  pattern: string;
  handler: Parameters<
    import("playwright").Page["route"]
  >[1];
}

const activeRoutes: ActiveRoute[] = [];

export function getRouteToolDefinitions() {
  return [
    {
      name: "webmobai_route",
      description:
        "Intercept network requests matching the URL pattern and either return a stubbed response, abort the request, or pass it through. Use to mock API responses, simulate failures, or block third-party scripts during a test.",
      inputSchema: {
        type: "object" as const,
        properties: {
          pattern: {
            type: "string",
            description:
              "URL pattern to intercept. Supports glob syntax (e.g., '**/api/users/*') or full URLs.",
          },
          action: {
            type: "string",
            enum: ["fulfill", "abort", "continue"],
            description:
              "What to do with matched requests: 'fulfill' returns the stub response, 'abort' fails the request, 'continue' passes it through to the real server.",
          },
          status: {
            type: "number",
            description: "HTTP status code when action='fulfill' (default 200)",
            default: 200,
          },
          body: {
            type: "string",
            description: "Response body when action='fulfill'. Plain text or JSON-serialized.",
          },
          content_type: {
            type: "string",
            description: "Response Content-Type when action='fulfill' (default application/json)",
            default: "application/json",
          },
          abort_reason: {
            type: "string",
            description:
              "Failure reason when action='abort' (default 'failed'). Useful for simulating specific network errors.",
            default: "failed",
          },
        },
        required: ["pattern", "action"],
      },
    },
    {
      name: "webmobai_unroute",
      description:
        "Remove an active route interception. If pattern is omitted, all active routes are removed.",
      inputSchema: {
        type: "object" as const,
        properties: {
          pattern: {
            type: "string",
            description:
              "URL pattern to stop intercepting. Must match the pattern used in webmobai_route. Omit to clear all.",
          },
        },
      },
    },
  ];
}

export async function handleRouteTool(
  name: string,
  args: Record<string, unknown>,
  browserManager: BrowserManager,
): Promise<{ content: { type: "text"; text: string }[] }> {
  const page = browserManager.page;

  try {
    switch (name) {
      case "webmobai_route": {
        const pattern = args.pattern as string;
        const action = args.action as "fulfill" | "abort" | "continue";
        const status = (args.status as number) ?? 200;
        const body = args.body as string | undefined;
        const contentType = (args.content_type as string) ?? "application/json";
        const abortReason = (args.abort_reason as string) ?? "failed";

        const handler: ActiveRoute["handler"] = async (route) => {
          if (action === "fulfill") {
            await route.fulfill({
              status,
              contentType,
              body: body ?? "",
            });
          } else if (action === "abort") {
            await route.abort(
              abortReason as Parameters<typeof route.abort>[0],
            );
          } else {
            await route.continue();
          }
        };

        await page.route(pattern, handler);
        activeRoutes.push({ pattern, handler });
        return text(
          `Route active: ${pattern} → ${action}${action === "fulfill" ? ` (HTTP ${status})` : ""}`,
        );
      }

      case "webmobai_unroute": {
        const pattern = args.pattern as string | undefined;
        if (!pattern) {
          // Clear everything.
          for (const r of activeRoutes) {
            await page.unroute(r.pattern, r.handler).catch(() => {});
          }
          const cleared = activeRoutes.length;
          activeRoutes.length = 0;
          return text(`Cleared ${cleared} active route(s)`);
        }
        const matches = activeRoutes.filter((r) => r.pattern === pattern);
        for (const r of matches) {
          await page.unroute(r.pattern, r.handler).catch(() => {});
        }
        // Mutate the array in place.
        for (let i = activeRoutes.length - 1; i >= 0; i--) {
          if (activeRoutes[i]?.pattern === pattern) activeRoutes.splice(i, 1);
        }
        return text(`Cleared ${matches.length} route(s) matching "${pattern}"`);
      }

      default:
        return text(`Unknown route tool: ${name}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Route tool error (${name}): ${msg}`);
    return text(`Error executing ${name}: ${msg}`);
  }
}

function text(message: string) {
  return { content: [{ type: "text" as const, text: message }] };
}

/**
 * For tests / cleanup. Returns the current list of active routes.
 */
export function getActiveRoutes(): ReadonlyArray<{ pattern: string }> {
  return activeRoutes.map((r) => ({ pattern: r.pattern }));
}

/**
 * Reset all route state. Called when the browser closes.
 */
export function resetRoutes(): void {
  activeRoutes.length = 0;
}
