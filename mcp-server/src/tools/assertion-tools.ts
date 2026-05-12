import type { BrowserManager } from "../playwright/browser-manager.js";
import { logger } from "../utils/logger.js";

/**
 * Assertion tools. These differ from the audit tools in two ways:
 *   1. They check a user-defined expectation, not a heuristic.
 *   2. They throw (return error status) if the expectation isn't met — which
 *      is what makes WebMobAI usable as a real test runner, not just an
 *      auditor.
 *
 * Auto-waiting: each assertion waits up to `timeoutMs` (default 5s) for the
 * expectation to hold, retrying on a fixed cadence. Aligns with Playwright's
 * locator behavior — most flakes are timing, not real failures.
 */

const DEFAULT_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 100;

export function getAssertionToolDefinitions() {
  return [
    {
      name: "webmobai_assert_visible",
      description:
        "Assert that an element matching the selector is visible on the page within a timeout (default 5s). Fails the test if the element is missing or hidden after the timeout.",
      inputSchema: {
        type: "object" as const,
        properties: {
          selector: { type: "string", description: "CSS or Playwright selector" },
          timeout_ms: {
            type: "number",
            description: "Maximum wait time in milliseconds (default: 5000)",
            default: DEFAULT_TIMEOUT_MS,
          },
        },
        required: ["selector"],
      },
    },
    {
      name: "webmobai_assert_hidden",
      description:
        "Assert that an element matching the selector is NOT visible on the page (either absent or display:none). Fails if the element becomes visible within the timeout.",
      inputSchema: {
        type: "object" as const,
        properties: {
          selector: { type: "string", description: "CSS or Playwright selector" },
          timeout_ms: {
            type: "number",
            description: "Maximum wait time in milliseconds (default: 5000)",
            default: DEFAULT_TIMEOUT_MS,
          },
        },
        required: ["selector"],
      },
    },
    {
      name: "webmobai_assert_text",
      description:
        "Assert that an element matching the selector contains the expected text (substring match, case-sensitive). Useful for verifying labels, headings, error messages.",
      inputSchema: {
        type: "object" as const,
        properties: {
          selector: { type: "string", description: "CSS or Playwright selector" },
          expected: { type: "string", description: "Substring the element should contain" },
          exact: {
            type: "boolean",
            description:
              "If true, match the element's trimmed innerText exactly. Default false (substring match).",
            default: false,
          },
          timeout_ms: { type: "number", default: DEFAULT_TIMEOUT_MS },
        },
        required: ["selector", "expected"],
      },
    },
    {
      name: "webmobai_assert_url",
      description:
        "Assert that the current page URL matches an expected substring or pattern. Use this after navigation, form submit, or redirect to verify the user landed where you expected.",
      inputSchema: {
        type: "object" as const,
        properties: {
          contains: {
            type: "string",
            description: "Substring the current URL should contain",
          },
          pattern: {
            type: "string",
            description:
              "Optional regex (without delimiters) the URL must match. If both `contains` and `pattern` are provided, both must hold.",
          },
          timeout_ms: { type: "number", default: DEFAULT_TIMEOUT_MS },
        },
      },
    },
    {
      name: "webmobai_assert_count",
      description:
        "Assert the number of elements matching a selector. Useful for verifying list lengths, table row counts, etc.",
      inputSchema: {
        type: "object" as const,
        properties: {
          selector: { type: "string", description: "CSS or Playwright selector" },
          expected: { type: "number", description: "Expected element count" },
          timeout_ms: { type: "number", default: DEFAULT_TIMEOUT_MS },
        },
        required: ["selector", "expected"],
      },
    },
  ];
}

export async function handleAssertionTool(
  name: string,
  args: Record<string, unknown>,
  browserManager: BrowserManager,
): Promise<{ content: { type: "text"; text: string }[] }> {
  const page = browserManager.page;
  const timeout = (args.timeout_ms as number) ?? DEFAULT_TIMEOUT_MS;

  try {
    switch (name) {
      case "webmobai_assert_visible": {
        const selector = args.selector as string;
        await waitFor(
          async () => {
            const el = await page.$(selector);
            return el !== null && (await el.isVisible());
          },
          timeout,
          () => `Element "${selector}" was not visible within ${timeout}ms`,
        );
        return ok(`PASS — "${selector}" is visible`);
      }

      case "webmobai_assert_hidden": {
        const selector = args.selector as string;
        await waitFor(
          async () => {
            const el = await page.$(selector);
            return el === null || !(await el.isVisible());
          },
          timeout,
          () => `Element "${selector}" remained visible within ${timeout}ms`,
        );
        return ok(`PASS — "${selector}" is hidden or absent`);
      }

      case "webmobai_assert_text": {
        const selector = args.selector as string;
        const expected = args.expected as string;
        const exact = (args.exact as boolean) ?? false;

        let lastSeen = "";
        await waitFor(
          async () => {
            const el = await page.$(selector);
            if (!el) return false;
            const actual = (await el.innerText()).trim();
            lastSeen = actual;
            return exact ? actual === expected : actual.includes(expected);
          },
          timeout,
          () =>
            `Element "${selector}" did not ${exact ? "exactly equal" : "contain"} "${expected}" within ${timeout}ms. Last seen: "${lastSeen.slice(0, 120)}"`,
        );
        return ok(
          `PASS — "${selector}" ${exact ? "equals" : "contains"} "${expected}"`,
        );
      }

      case "webmobai_assert_url": {
        const contains = args.contains as string | undefined;
        const pattern = args.pattern as string | undefined;
        const re = pattern ? new RegExp(pattern) : undefined;
        let lastUrl = "";
        await waitFor(
          () => {
            lastUrl = page.url();
            const containsOk = contains ? lastUrl.includes(contains) : true;
            const patternOk = re ? re.test(lastUrl) : true;
            return Promise.resolve(containsOk && patternOk);
          },
          timeout,
          () =>
            `URL did not match within ${timeout}ms. Last seen: "${lastUrl}"`,
        );
        return ok(`PASS — URL matches (${lastUrl})`);
      }

      case "webmobai_assert_count": {
        const selector = args.selector as string;
        const expected = args.expected as number;
        let lastCount = -1;
        await waitFor(
          async () => {
            lastCount = await page.locator(selector).count();
            return lastCount === expected;
          },
          timeout,
          () =>
            `Count of "${selector}" was ${lastCount}, expected ${expected} (after ${timeout}ms)`,
        );
        return ok(`PASS — "${selector}" has ${expected} match${expected === 1 ? "" : "es"}`);
      }

      default:
        return fail(`Unknown assertion tool: ${name}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Assertion failed (${name}): ${msg}`);
    return fail(`FAIL — ${msg}`);
  }
}

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs: number,
  onTimeout: () => string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  // One last try after the loop in case the predicate just settled.
  if (await predicate()) return;
  throw new Error(onTimeout());
}

function ok(message: string) {
  return { content: [{ type: "text" as const, text: message }] };
}

function fail(message: string) {
  return { content: [{ type: "text" as const, text: message }] };
}
