import type { BrowserManager } from "../playwright/browser-manager.js";
import { logger } from "../utils/logger.js";

/**
 * Developer-facing debugging tools. These help the user understand why a
 * selector behaves unexpectedly — fewer "selector resolves to 0 elements"
 * mysteries, more "your selector matches 3 things, here they are".
 */

export function getDebugToolDefinitions() {
  return [
    {
      name: "webmobai_describe_selector",
      description:
        "Inspect what a selector currently matches on the page. Returns the match count and a per-match summary (tag, accessible name, role, position, key attributes). Use this when an assertion or click is failing and you're not sure whether the selector is wrong, ambiguous, or just too early.",
      inputSchema: {
        type: "object" as const,
        properties: {
          selector: {
            type: "string",
            description: "CSS or Playwright selector to inspect",
          },
          max_matches: {
            type: "number",
            description: "Maximum matches to describe (default 10)",
            default: 10,
          },
        },
        required: ["selector"],
      },
    },
  ];
}

export async function handleDebugTool(
  name: string,
  args: Record<string, unknown>,
  browserManager: BrowserManager,
): Promise<{ content: { type: "text"; text: string }[] }> {
  try {
    switch (name) {
      case "webmobai_describe_selector": {
        const selector = args.selector as string;
        const maxMatches = (args.max_matches as number) ?? 10;
        const page = browserManager.page;
        const count = await page.locator(selector).count();

        if (count === 0) {
          // No matches — surface near-miss candidates by inspecting the
          // selector for obvious problems and listing visible siblings of
          // similar shape.
          const hints = await page.evaluate((sel: string) => {
            const hints: string[] = [];
            // If the selector references an id, suggest checking if the id
            // exists at all.
            const idMatch = sel.match(/#([\w-]+)/);
            if (idMatch && !document.getElementById(idMatch[1]!)) {
              hints.push(`No element with id="${idMatch[1]}" exists on the page.`);
            }
            // If it references a data-testid, check existence.
            const testidMatch = sel.match(/\[data-testid=["']([^"']+)["']\]/);
            if (
              testidMatch &&
              !document.querySelector(`[data-testid="${testidMatch[1]}"]`)
            ) {
              hints.push(`No element with data-testid="${testidMatch[1]}" exists on the page.`);
            }
            return hints;
          }, selector);

          let out = `Selector "${selector}" matches 0 elements.\n`;
          if (hints.length > 0) {
            out += "\nDiagnostics:\n";
            for (const h of hints) out += `  - ${h}\n`;
          } else {
            out +=
              "\nNo specific diagnostic. The selector may be syntactically valid but the element isn't present, hasn't rendered yet, or is in a different frame.";
          }
          return text(out);
        }

        // Describe up to maxMatches.
        const summaries = await page
          .locator(selector)
          .evaluateAll(
            (els, max) => {
              return els.slice(0, max).map((el) => {
                const rect = (el as HTMLElement).getBoundingClientRect();
                return {
                  tag: el.tagName.toLowerCase(),
                  text: ((el as HTMLElement).textContent ?? "").trim().slice(0, 80),
                  role: el.getAttribute("role"),
                  ariaLabel: el.getAttribute("aria-label"),
                  testid: el.getAttribute("data-testid"),
                  id: el.id || undefined,
                  classList: el.className?.toString().slice(0, 80) || undefined,
                  visible: rect.width > 0 && rect.height > 0,
                  position: `(${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}x${Math.round(rect.height)})`,
                };
              });
            },
            maxMatches,
          );

        let out = `Selector "${selector}" matches ${count} element${count === 1 ? "" : "s"}`;
        if (count > maxMatches) out += ` (showing first ${maxMatches})`;
        out += ":\n\n";
        for (let i = 0; i < summaries.length; i++) {
          const s = summaries[i]!;
          out += `[${i + 1}] <${s.tag}`;
          if (s.id) out += ` id="${s.id}"`;
          if (s.testid) out += ` data-testid="${s.testid}"`;
          if (s.role) out += ` role="${s.role}"`;
          if (s.ariaLabel) out += ` aria-label="${s.ariaLabel}"`;
          out += `>`;
          if (s.text) out += ` "${s.text}"`;
          out += `\n    position: ${s.position}${s.visible ? "" : " — HIDDEN (0×0)"}\n`;
          if (s.classList) out += `    class="${s.classList}"\n`;
        }

        if (count > 1) {
          out += `\nNote: selector resolves to ${count} elements. If you intended a single one, tighten with :nth-of-type or a more specific attribute.\n`;
        }

        return text(out);
      }
      default:
        return text(`Unknown debug tool: ${name}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Debug tool error (${name}): ${msg}`);
    return text(`Error executing ${name}: ${msg}`);
  }
}

function text(message: string) {
  return { content: [{ type: "text" as const, text: message }] };
}
