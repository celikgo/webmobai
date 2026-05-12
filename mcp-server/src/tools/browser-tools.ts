import type { BrowserManager } from "../playwright/browser-manager.js";
import { logger } from "../utils/logger.js";

export function getBrowserToolDefinitions() {
  return [
    {
      name: "webmobai_launch_browser",
      description:
        "Launch an isolated browser in visible (headed) mode. Must be called before any other browser operation. Creates a fresh context with no cookies, cache, or user profiles. Supports Chromium, Firefox, and WebKit, and Playwright device presets (iPhone 13, Pixel 5, etc.) for mobile emulation including touch events and devicePixelRatio.",
      inputSchema: {
        type: "object" as const,
        properties: {
          browser: {
            type: "string",
            enum: ["chromium", "firefox", "webkit"],
            description: "Browser engine to launch (default: chromium)",
            default: "chromium",
          },
          device: {
            type: "string",
            description:
              "Optional Playwright device preset name (e.g., 'iPhone 13', 'Pixel 5', 'iPad Pro 11'). Overrides viewport/userAgent with the device's profile. See https://playwright.dev/docs/emulation#devices for the full list.",
          },
          headless: {
            type: "boolean",
            description: "Run in headless mode (default: false — visible browser window)",
            default: false,
          },
          viewport_width: {
            type: "number",
            description:
              "Viewport width in pixels (default: 1280). Ignored when `device` is set.",
            default: 1280,
          },
          viewport_height: {
            type: "number",
            description:
              "Viewport height in pixels (default: 720). Ignored when `device` is set.",
            default: 720,
          },
          record_video: {
            type: "boolean",
            description: "Record video of the session (default: true)",
            default: true,
          },
        },
      },
    },
    {
      name: "webmobai_navigate",
      description:
        "Navigate to a URL. Waits for the page to load (DOM content loaded + network idle). Returns the page title and final URL.",
      inputSchema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description: "The URL to navigate to",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "webmobai_click",
      description:
        "Click an element on the page using a CSS selector. Supports standard CSS selectors and Playwright-specific selectors like text=, role=, etc.",
      inputSchema: {
        type: "object" as const,
        properties: {
          selector: {
            type: "string",
            description:
              'CSS or Playwright selector (e.g., "button.submit", "text=Sign In", "[data-testid=login]")',
          },
        },
        required: ["selector"],
      },
    },
    {
      name: "webmobai_type",
      description:
        "Type text into an input field. Clears any existing value first.",
      inputSchema: {
        type: "object" as const,
        properties: {
          selector: {
            type: "string",
            description: "CSS selector of the input element",
          },
          text: {
            type: "string",
            description: "Text to type into the element",
          },
        },
        required: ["selector", "text"],
      },
    },
    {
      name: "webmobai_scroll",
      description: "Scroll the page up or down by a specified number of pixels.",
      inputSchema: {
        type: "object" as const,
        properties: {
          direction: {
            type: "string",
            enum: ["down", "up"],
            description: "Scroll direction (default: down)",
            default: "down",
          },
          amount: {
            type: "number",
            description: "Pixels to scroll (default: 500)",
            default: 500,
          },
        },
      },
    },
    {
      name: "webmobai_screenshot",
      description:
        "Take a screenshot of the current viewport. Returns the screenshot file path.",
      inputSchema: {
        type: "object" as const,
        properties: {
          full_page: {
            type: "boolean",
            description: "Capture the full scrollable page (default: false)",
            default: false,
          },
          description: {
            type: "string",
            description: "Description of what this screenshot captures",
          },
        },
      },
    },
    {
      name: "webmobai_set_viewport",
      description:
        "Change the browser viewport size. Useful for responsive testing.",
      inputSchema: {
        type: "object" as const,
        properties: {
          width: { type: "number", description: "Viewport width in pixels" },
          height: { type: "number", description: "Viewport height in pixels" },
        },
        required: ["width", "height"],
      },
    },
    {
      name: "webmobai_close_browser",
      description: "Close the browser and end the session. Saves any recorded video.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
  ];
}

export async function handleBrowserTool(
  name: string,
  args: Record<string, unknown>,
  browserManager: BrowserManager,
): Promise<{ content: { type: "text"; text: string }[] }> {
  try {
    switch (name) {
      case "webmobai_launch_browser": {
        if (browserManager.isLaunched) {
          return text("Browser is already running. Close it first to relaunch.");
        }
        const browserName =
          (args.browser as "chromium" | "firefox" | "webkit" | undefined) ??
          "chromium";
        const device = args.device as string | undefined;
        await browserManager.launch({
          headless: (args.headless as boolean) ?? false,
          viewport: {
            width: (args.viewport_width as number) ?? 1280,
            height: (args.viewport_height as number) ?? 720,
          },
          recordVideo: (args.record_video as boolean) ?? true,
          browser: browserName,
          device,
        });
        const desc = device
          ? `${browserName} emulating ${device}`
          : browserName;
        return text(
          `Browser launched successfully (${desc}).\n` +
            "A window is now open. You can interact with it using the other webmobai tools.\n" +
            "The browser has a clean profile — no cookies, cache, or extensions.",
        );
      }

      case "webmobai_navigate": {
        const url = args.url as string;
        const result = await browserManager.navigate(url);
        return text(
          `Navigated to: ${result.url}\nPage title: "${result.title}"\n\nPage loaded successfully.`,
        );
      }

      case "webmobai_click": {
        const selector = args.selector as string;
        await browserManager.click(selector);
        const newUrl = browserManager.page.url();
        const newTitle = await browserManager.page.title();
        return text(
          `Clicked element: ${selector}\nCurrent URL: ${newUrl}\nPage title: "${newTitle}"`,
        );
      }

      case "webmobai_type": {
        const selector = args.selector as string;
        const typedText = args.text as string;
        await browserManager.type(selector, typedText);
        return text(`Typed "${typedText}" into ${selector}`);
      }

      case "webmobai_scroll": {
        const direction = (args.direction as string) ?? "down";
        const amount = (args.amount as number) ?? 500;
        await browserManager.scroll(
          direction as "down" | "up",
          amount,
        );
        return text(`Scrolled ${direction} by ${amount}px`);
      }

      case "webmobai_screenshot": {
        const fullPage = (args.full_page as boolean) ?? false;
        const desc = (args.description as string) ?? undefined;
        const path = fullPage
          ? await browserManager.fullPageScreenshot(desc)
          : await browserManager.screenshot(desc);
        return text(`Screenshot saved: ${path}${desc ? `\nDescription: ${desc}` : ""}`);
      }

      case "webmobai_set_viewport": {
        const width = args.width as number;
        const height = args.height as number;
        await browserManager.setViewport(width, height);
        return text(`Viewport changed to ${width}x${height}`);
      }

      case "webmobai_close_browser": {
        const videoPath = await browserManager.getVideoPath();
        const tracePath = browserManager.traceFilePath;
        await browserManager.close();
        const lines = ["Browser closed."];
        if (videoPath) lines.push(`Recorded video saved: ${videoPath}`);
        lines.push(`Playwright trace: ${tracePath}`);
        lines.push(
          "Open the trace at https://trace.playwright.dev for time-travel debugging.",
        );
        return text(lines.join("\n"));
      }

      default:
        return text(`Unknown browser tool: ${name}`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Browser tool error (${name}): ${msg}`);
    return text(`Error executing ${name}: ${msg}`);
  }
}

function text(message: string) {
  return { content: [{ type: "text" as const, text: message }] };
}
