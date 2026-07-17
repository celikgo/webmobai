import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { BrowserManager } from "./playwright/browser-manager.js";
import {
  getBrowserToolDefinitions,
  handleBrowserTool,
} from "./tools/browser-tools.js";
import {
  getTestingToolDefinitions,
  handleTestingTool,
} from "./tools/testing-tools.js";
import {
  getAccessibilityToolDefinitions,
  handleAccessibilityTool,
} from "./tools/accessibility-tools.js";
import {
  getReportingToolDefinitions,
  handleReportingTool,
} from "./tools/reporting-tools.js";
import {
  getAssertionToolDefinitions,
  handleAssertionTool,
} from "./tools/assertion-tools.js";
import {
  getRouteToolDefinitions,
  handleRouteTool,
  resetRoutes,
} from "./tools/route-tools.js";
import {
  getHistoryToolDefinitions,
  handleHistoryTool,
} from "./tools/history-tools.js";
import {
  getScenarioToolDefinitions,
  handleScenarioTool,
} from "./tools/scenario-tools.js";
import {
  getVisualToolDefinitions,
  handleVisualTool,
} from "./tools/visual-tools.js";
import {
  getPerfToolDefinitions,
  handlePerfTool,
} from "./tools/perf-tools.js";
import {
  getSecurityToolDefinitions,
  handleSecurityTool,
} from "./tools/security-tools.js";
import {
  getSeoToolDefinitions,
  handleSeoTool,
} from "./tools/seo-tools.js";
import {
  getPwaToolDefinitions,
  handlePwaTool,
} from "./tools/pwa-tools.js";
import {
  getDebugToolDefinitions,
  handleDebugTool,
} from "./tools/debug-tools.js";
import { getAiToolDefinitions, handleAiTool } from "./tools/ai-tools.js";
import {
  getLighthouseToolDefinitions,
  handleLighthouseTool,
} from "./tools/lighthouse-tools.js";
import { logger } from "./utils/logger.js";

type ToolResponse = { content: { type: "text"; text: string }[] };
type ToolDefinition = { name: string; description: string; inputSchema: object };

// One row per tool group. `handle` is normalized to (name, args, bm) — handlers
// that don't actually use the browser (history, AI) ignore the third arg.
// `requiresBrowser: true` means the dispatcher pre-checks `bm.isLaunched` and
// returns the standard "browser not launched" message without invoking the
// handler. The Sprint 15 refactor that replaced 11 copy-pasted guards with this
// table lives here.
interface ToolGroup {
  definitions: () => ToolDefinition[];
  handle: (
    name: string,
    args: Record<string, unknown>,
    bm: BrowserManager,
  ) => Promise<ToolResponse>;
  requiresBrowser: boolean;
}

const BROWSER_NOT_LAUNCHED: ToolResponse = {
  content: [
    {
      type: "text",
      text: "Browser is not launched. Call webmobai_launch_browser first.",
    },
  ],
};

export function createMcpServer(): { server: Server; browserManager: BrowserManager } {
  const browserManager = new BrowserManager();

  const groups: ToolGroup[] = [
    // History reads disk-backed run logs — no browser needed.
    {
      definitions: getHistoryToolDefinitions,
      handle: (name, args) => handleHistoryTool(name, args),
      requiresBrowser: false,
    },
    // Browser-control tools launch / close the browser — guard would be circular.
    {
      definitions: getBrowserToolDefinitions,
      handle: handleBrowserTool,
      requiresBrowser: false,
    },
    {
      definitions: getTestingToolDefinitions,
      handle: handleTestingTool,
      requiresBrowser: true,
    },
    {
      definitions: getAccessibilityToolDefinitions,
      handle: handleAccessibilityTool,
      requiresBrowser: true,
    },
    {
      definitions: getReportingToolDefinitions,
      handle: handleReportingTool,
      requiresBrowser: true,
    },
    {
      definitions: getAssertionToolDefinitions,
      handle: handleAssertionTool,
      requiresBrowser: true,
    },
    {
      definitions: getRouteToolDefinitions,
      handle: handleRouteTool,
      requiresBrowser: true,
    },
    {
      definitions: getScenarioToolDefinitions,
      handle: handleScenarioTool,
      requiresBrowser: true,
    },
    // Visual: webmobai_visual_snapshot needs a browser; the new (Sprint 16)
    // baseline-history tools read/write disk only. The group flag is false and
    // handleVisualTool guards the snapshot tool itself.
    {
      definitions: getVisualToolDefinitions,
      handle: handleVisualTool,
      requiresBrowser: false,
    },
    {
      definitions: getPerfToolDefinitions,
      handle: handlePerfTool,
      requiresBrowser: true,
    },
    {
      definitions: getSecurityToolDefinitions,
      handle: handleSecurityTool,
      requiresBrowser: true,
    },
    {
      definitions: getSeoToolDefinitions,
      handle: handleSeoTool,
      requiresBrowser: true,
    },
    {
      definitions: getPwaToolDefinitions,
      handle: handlePwaTool,
      requiresBrowser: true,
    },
    {
      definitions: getDebugToolDefinitions,
      handle: handleDebugTool,
      requiresBrowser: true,
    },
    // AI tools (Sprint 15). The group-level flag is false because one tool
    // (`webmobai_explain_visual_diff`) operates on file paths and doesn't need
    // a browser. The other two check `bm.isLaunched` internally.
    {
      definitions: getAiToolDefinitions,
      handle: handleAiTool,
      requiresBrowser: false,
    },
    // Lighthouse (Sprint 16) drives its own headless Chrome — never touches
    // the caller's BrowserManager.
    {
      definitions: getLighthouseToolDefinitions,
      handle: handleLighthouseTool,
      requiresBrowser: false,
    },
  ];

  const server = new Server(
    {
      name: "webmobai",
      version: "1.4.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );

  // Register tool listing — concatenate all group definitions.
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = groups.flatMap((g) => g.definitions());
    return { tools };
  });

  // Route tool calls to the right handler. Walk the group table once; the first
  // group containing the tool name wins. Pre-check `requiresBrowser` so we
  // don't enter handlers that would crash on a null page.
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    logger.info(`Tool call: ${name}`, args);

    for (const group of groups) {
      const names = group.definitions().map((t) => t.name);
      if (!names.includes(name)) continue;
      if (group.requiresBrowser && !browserManager.isLaunched) {
        return BROWSER_NOT_LAUNCHED;
      }
      const response = await group.handle(
        name,
        args as Record<string, unknown>,
        browserManager,
      );
      // Sprint 17 idle-close: any successful tool call resets the timer.
      browserManager.bumpIdleTimer();
      return response;
    }

    return {
      content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
    };
  });

  // Resources: expose session info
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: "webmobai://guide",
          name: "WebMobAI Testing Guide",
          description: "How to use WebMobAI for autonomous web testing",
          mimeType: "text/plain",
        },
      ],
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    if (request.params.uri === "webmobai://guide") {
      return {
        contents: [
          {
            uri: "webmobai://guide",
            mimeType: "text/plain",
            text: TESTING_GUIDE,
          },
        ],
      };
    }
    throw new Error(`Resource not found: ${request.params.uri}`);
  });

  // Handle server shutdown
  server.onclose = async () => {
    logger.info("MCP server shutting down...");
    resetRoutes();
    if (browserManager.isLaunched) {
      await browserManager.close();
    }
  };

  return { server, browserManager };
}

const TESTING_GUIDE = `# WebMobAI Autonomous Web Testing Guide

## Quick Start
1. Call webmobai_launch_browser to open a visible Chromium browser
2. Call webmobai_navigate with the URL to test
3. Use webmobai_get_page_state to understand the page
4. Explore and interact using click, type, scroll tools
5. Run webmobai_accessibility_audit for a11y testing
6. Use webmobai_get_performance_metrics for Web Vitals
7. Test responsive layouts with webmobai_test_responsive
8. Record test results with webmobai_add_test_result
9. Generate final report with webmobai_generate_report

## Testing Strategy
- Start with the homepage, understand the structure
- Navigate to key pages (about, contact, login, etc.)
- Test forms: fill, submit, check validation
- Check for console errors on every page
- Take screenshots of important states
- Test at mobile, tablet, and desktop breakpoints
- Look for broken images, missing links, 404 pages
- Check accessibility on every page

## Available Tool Categories
- **Browser Control**: launch, navigate, click, type, scroll, screenshot, viewport, close
- **Page Analysis**: get_page_state, get_interactive_elements, get_links, check_errors
- **Accessibility**: accessibility_audit, get_accessibility_tree
- **Performance**: get_performance_metrics
- **Reporting**: test_responsive, add_test_result, generate_report
- **Advanced**: evaluate (run JS), wait_for, hover, select_option, press_key, go_back
- **AI (opt-in via WEBMOBAI_ANTHROPIC_API_KEY)**: explain_visual_diff, summarize_audit, generate_scenario_from_prompt
`;
