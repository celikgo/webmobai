import type { BrowserManager } from "../playwright/browser-manager.js";
import { PageAnalyzer } from "../playwright/page-analyzer.js";
import { logger } from "../utils/logger.js";

export function getTestingToolDefinitions() {
  return [
    {
      name: "webmobai_get_page_state",
      description:
        "Get a comprehensive summary of the current page state including DOM structure, interactive elements, links, forms, and buttons. Essential for understanding what you can interact with.",
      inputSchema: {
        type: "object" as const,
        properties: {
          include_accessibility_tree: {
            type: "boolean",
            description: "Include the full accessibility tree (default: false — can be verbose)",
            default: false,
          },
        },
      },
    },
    {
      name: "webmobai_get_interactive_elements",
      description:
        "List all interactive elements on the page (links, buttons, inputs, selects). Returns each element with its selector, text content, and position. Use this to decide what to click or interact with.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
    {
      name: "webmobai_get_links",
      description:
        "Get all links on the current page. Useful for exploration and discovering which pages to test next.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
    {
      name: "webmobai_check_errors",
      description:
        "Check for errors on the current page: broken images, console errors, and network failures.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
    {
      name: "webmobai_get_console_errors",
      description:
        "Get all console errors and warnings captured since the browser launched.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
    {
      name: "webmobai_evaluate",
      description:
        "Execute JavaScript code in the browser page context and return the result. Useful for custom checks, reading computed styles, or querying the DOM.",
      inputSchema: {
        type: "object" as const,
        properties: {
          script: {
            type: "string",
            description: "JavaScript code to execute in the page context. Must return a serializable value.",
          },
        },
        required: ["script"],
      },
    },
    {
      name: "webmobai_wait_for",
      description:
        "Wait for a selector to appear, a URL to match, or a specified timeout.",
      inputSchema: {
        type: "object" as const,
        properties: {
          selector: {
            type: "string",
            description: "CSS selector to wait for (waits until element is visible)",
          },
          url_contains: {
            type: "string",
            description: "Wait until the URL contains this string",
          },
          timeout: {
            type: "number",
            description: "Maximum time to wait in ms (default: 10000)",
            default: 10000,
          },
        },
      },
    },
    {
      name: "webmobai_hover",
      description: "Hover over an element. Useful for testing dropdown menus, tooltips, and hover states.",
      inputSchema: {
        type: "object" as const,
        properties: {
          selector: {
            type: "string",
            description: "CSS selector of the element to hover over",
          },
        },
        required: ["selector"],
      },
    },
    {
      name: "webmobai_select_option",
      description: "Select an option from a <select> dropdown.",
      inputSchema: {
        type: "object" as const,
        properties: {
          selector: {
            type: "string",
            description: "CSS selector of the <select> element",
          },
          value: {
            type: "string",
            description: "Option value or label to select",
          },
        },
        required: ["selector", "value"],
      },
    },
    {
      name: "webmobai_press_key",
      description: "Press a keyboard key (e.g., Enter, Tab, Escape, ArrowDown).",
      inputSchema: {
        type: "object" as const,
        properties: {
          key: {
            type: "string",
            description: "Key to press (e.g., 'Enter', 'Tab', 'Escape', 'ArrowDown')",
          },
        },
        required: ["key"],
      },
    },
    {
      name: "webmobai_go_back",
      description: "Navigate back in browser history.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
  ];
}

export async function handleTestingTool(
  name: string,
  args: Record<string, unknown>,
  browserManager: BrowserManager,
): Promise<{ content: { type: "text"; text: string }[] }> {
  try {
    const page = browserManager.page;
    const analyzer = new PageAnalyzer(page, browserManager);

    switch (name) {
      case "webmobai_get_page_state": {
        const includeA11y = (args.include_accessibility_tree as boolean) ?? false;
        const url = page.url();
        const title = await page.title();
        const domSummary = await analyzer.getDomSummary();

        let result = `# Page State\nURL: ${url}\nTitle: "${title}"\n\n${domSummary}`;

        if (includeA11y) {
          const a11yTree = await analyzer.getAccessibilityTree();
          result += `\n\n# Accessibility Tree\n${a11yTree}`;
        }

        return text(result);
      }

      case "webmobai_get_interactive_elements": {
        const elements = await analyzer.getInteractiveElements();
        return text(
          `# Interactive Elements on ${page.url()}\n\n${elements || "No interactive elements found."}`,
        );
      }

      case "webmobai_get_links": {
        const links = await analyzer.getLinks();
        const currentOrigin = new URL(page.url()).origin;
        const internal = links.filter((l) => l.startsWith(currentOrigin));
        const external = links.filter((l) => !l.startsWith(currentOrigin));

        let result = `# Links on ${page.url()}\n`;
        result += `\nTotal: ${links.length} (${internal.length} internal, ${external.length} external)\n`;
        if (internal.length > 0) {
          result += `\n## Internal Links\n${internal.map((l) => `  ${l}`).join("\n")}`;
        }
        if (external.length > 0) {
          result += `\n\n## External Links\n${external.map((l) => `  ${l}`).join("\n")}`;
        }
        return text(result);
      }

      case "webmobai_check_errors": {
        const errors = await analyzer.checkForErrors();
        const consoleErrors = browserManager.getConsoleErrors();
        const networkErrors = browserManager.getNetworkErrors();
        let result = "# Error Check\n";

        if (errors.brokenImages.length > 0) {
          result += `\n## Broken Images (${errors.brokenImages.length})\n`;
          result += errors.brokenImages.map((img) => `  - ${img}`).join("\n");
        } else {
          result += "\n## Images: All loaded correctly";
        }

        const consoleErrorOnly = consoleErrors.filter((e) => e.type === "error");
        if (consoleErrorOnly.length > 0) {
          result += `\n\n## Console Errors (${consoleErrorOnly.length})\n`;
          result += consoleErrorOnly.map((e) => `  [${e.type}] ${e.message}`).join("\n");
        } else {
          result += "\n\n## Console: No errors";
        }

        if (networkErrors.length > 0) {
          result += `\n\n## Network Errors (${networkErrors.length})\n`;
          result += networkErrors
            .map((e) => `  ${e.method} ${e.url} — ${e.failure} (${e.resourceType})`)
            .join("\n");
        } else {
          result += "\n\n## Network: No failed requests";
        }

        return text(result);
      }

      case "webmobai_get_console_errors": {
        const errors = browserManager.getConsoleErrors();
        if (errors.length === 0) {
          return text("No console errors or warnings captured.");
        }
        const formatted = errors
          .map(
            (e) =>
              `[${new Date(e.timestamp).toISOString().substring(11, 23)}] [${e.type.toUpperCase()}] ${e.message}${e.url ? ` (${e.url})` : ""}`,
          )
          .join("\n");
        return text(`# Console Errors & Warnings (${errors.length})\n\n${formatted}`);
      }

      case "webmobai_evaluate": {
        const script = args.script as string;
        const result = await page.evaluate(script);
        return text(`Result: ${JSON.stringify(result, null, 2)}`);
      }

      case "webmobai_wait_for": {
        const timeout = (args.timeout as number) ?? 10000;
        if (args.selector) {
          await page.waitForSelector(args.selector as string, {
            state: "visible",
            timeout,
          });
          return text(`Element "${args.selector}" is now visible.`);
        }
        if (args.url_contains) {
          await page.waitForURL(`**/*${args.url_contains}*`, { timeout });
          return text(`URL now contains "${args.url_contains}". Current URL: ${page.url()}`);
        }
        await page.waitForTimeout(timeout);
        return text(`Waited ${timeout}ms.`);
      }

      case "webmobai_hover": {
        await page.hover(args.selector as string, { timeout: 10000 });
        return text(`Hovering over: ${args.selector}`);
      }

      case "webmobai_select_option": {
        await page.selectOption(args.selector as string, args.value as string);
        return text(`Selected "${args.value}" in ${args.selector}`);
      }

      case "webmobai_press_key": {
        await page.keyboard.press(args.key as string);
        return text(`Pressed key: ${args.key}`);
      }

      case "webmobai_go_back": {
        await page.goBack({ waitUntil: "domcontentloaded" });
        const url = page.url();
        const title = await page.title();
        return text(`Navigated back.\nCurrent URL: ${url}\nTitle: "${title}"`);
      }

      default:
        return text(`Unknown testing tool: ${name}`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Testing tool error (${name}): ${msg}`);
    return text(`Error executing ${name}: ${msg}`);
  }
}

function text(message: string) {
  return { content: [{ type: "text" as const, text: message }] };
}
