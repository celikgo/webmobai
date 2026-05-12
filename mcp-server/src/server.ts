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
import { logger } from "./utils/logger.js";

export function createMcpServer(): { server: Server; browserManager: BrowserManager } {
  const browserManager = new BrowserManager();

  const server = new Server(
    {
      name: "webmobai",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );

  // Register tool listing
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [
      ...getBrowserToolDefinitions(),
      ...getTestingToolDefinitions(),
      ...getAccessibilityToolDefinitions(),
      ...getReportingToolDefinitions(),
      ...getAssertionToolDefinitions(),
      ...getRouteToolDefinitions(),
      ...getHistoryToolDefinitions(),
      ...getScenarioToolDefinitions(),
      ...getVisualToolDefinitions(),
      ...getPerfToolDefinitions(),
      ...getSecurityToolDefinitions(),
      ...getSeoToolDefinitions(),
      ...getPwaToolDefinitions(),
    ];
    return { tools };
  });

  // Route tool calls to the right handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    logger.info(`Tool call: ${name}`, args);

    const browserTools = getBrowserToolDefinitions().map((t) => t.name);
    const testingTools = getTestingToolDefinitions().map((t) => t.name);
    const a11yTools = getAccessibilityToolDefinitions().map((t) => t.name);
    const reportingTools = getReportingToolDefinitions().map((t) => t.name);
    const assertionTools = getAssertionToolDefinitions().map((t) => t.name);
    const routeTools = getRouteToolDefinitions().map((t) => t.name);
    const historyTools = getHistoryToolDefinitions().map((t) => t.name);
    const scenarioTools = getScenarioToolDefinitions().map((t) => t.name);
    const visualTools = getVisualToolDefinitions().map((t) => t.name);
    const perfTools = getPerfToolDefinitions().map((t) => t.name);
    const securityTools = getSecurityToolDefinitions().map((t) => t.name);
    const seoTools = getSeoToolDefinitions().map((t) => t.name);
    const pwaTools = getPwaToolDefinitions().map((t) => t.name);

    // History tools don't need a launched browser — they read from
    // ~/.webmobai/history.json — so route them first, ahead of all the
    // "browser must be launched" guards.
    if (historyTools.includes(name)) {
      return handleHistoryTool(name, args as Record<string, unknown>);
    }

    if (browserTools.includes(name)) {
      return handleBrowserTool(name, args as Record<string, unknown>, browserManager);
    }

    if (testingTools.includes(name)) {
      if (!browserManager.isLaunched) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Browser is not launched. Call webmobai_launch_browser first.",
            },
          ],
        };
      }
      return handleTestingTool(name, args as Record<string, unknown>, browserManager);
    }

    if (a11yTools.includes(name)) {
      if (!browserManager.isLaunched) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Browser is not launched. Call webmobai_launch_browser first.",
            },
          ],
        };
      }
      return handleAccessibilityTool(name, args as Record<string, unknown>, browserManager);
    }

    if (reportingTools.includes(name)) {
      if (!browserManager.isLaunched) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Browser is not launched. Call webmobai_launch_browser first.",
            },
          ],
        };
      }
      return handleReportingTool(name, args as Record<string, unknown>, browserManager);
    }

    if (assertionTools.includes(name)) {
      if (!browserManager.isLaunched) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Browser is not launched. Call webmobai_launch_browser first.",
            },
          ],
        };
      }
      return handleAssertionTool(name, args as Record<string, unknown>, browserManager);
    }

    if (routeTools.includes(name)) {
      if (!browserManager.isLaunched) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Browser is not launched. Call webmobai_launch_browser first.",
            },
          ],
        };
      }
      return handleRouteTool(name, args as Record<string, unknown>, browserManager);
    }

    if (scenarioTools.includes(name)) {
      if (!browserManager.isLaunched) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Browser is not launched. Call webmobai_launch_browser first.",
            },
          ],
        };
      }
      return handleScenarioTool(name, args as Record<string, unknown>, browserManager);
    }

    if (visualTools.includes(name)) {
      if (!browserManager.isLaunched) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Browser is not launched. Call webmobai_launch_browser first.",
            },
          ],
        };
      }
      return handleVisualTool(name, args as Record<string, unknown>, browserManager);
    }

    if (perfTools.includes(name)) {
      if (!browserManager.isLaunched) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Browser is not launched. Call webmobai_launch_browser first.",
            },
          ],
        };
      }
      return handlePerfTool(name, args as Record<string, unknown>, browserManager);
    }

    if (securityTools.includes(name)) {
      if (!browserManager.isLaunched) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Browser is not launched. Call webmobai_launch_browser first.",
            },
          ],
        };
      }
      return handleSecurityTool(name, args as Record<string, unknown>, browserManager);
    }

    if (seoTools.includes(name)) {
      if (!browserManager.isLaunched) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Browser is not launched. Call webmobai_launch_browser first.",
            },
          ],
        };
      }
      return handleSeoTool(name, args as Record<string, unknown>, browserManager);
    }

    if (pwaTools.includes(name)) {
      if (!browserManager.isLaunched) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Browser is not launched. Call webmobai_launch_browser first.",
            },
          ],
        };
      }
      return handlePwaTool(name, args as Record<string, unknown>, browserManager);
    }

    return {
      content: [
        { type: "text" as const, text: `Unknown tool: ${name}` },
      ],
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
`;
