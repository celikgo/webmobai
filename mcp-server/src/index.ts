#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.js";
import { logger } from "./utils/logger.js";

/**
 * Read the version from package.json rather than hardcoding it. The literal
 * that used to live here said 1.2.0 while the package said 1.4.0 — a version
 * string maintained by hand is a version string that goes stale.
 */
function version(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // dist/index.js → package.json is one level up.
    const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}

function helpText(): string {
  return [
    "webmobai-mcp — Model Context Protocol server for WebMobAI",
    "",
    "Speaks MCP over stdio. It is started by an MCP client (Claude Desktop,",
    "Claude Code), not usually by hand: with no arguments it connects the",
    "stdio transport and waits for a client on stdin.",
    "",
    "Usage: webmobai-mcp [--help] [--version]",
    "",
    "Options:",
    "  -h, --help        show this help and exit",
    "  -V, --version     print the version and exit",
    "",
    "Configure it in Claude Desktop (claude_desktop_config.json):",
    '  { "mcpServers": { "webmobai": { "command": "npx", "args": ["-y", "webmobai-mcp"] } } }',
    "",
    "Environment:",
    "  WEBMOBAI_ANTHROPIC_API_KEY   optional — enables the AI tools (audit",
    "                               summaries, visual-diff narration, NL → scenario)",
    "",
    "The other binaries in this package are run directly:",
    "  webmobai-doctor      preflight environment check — run this first",
    "  webmobai-test        one-shot full audit of a URL",
    "  webmobai-scenario    run a scripted scenario",
    "  webmobai-suite       run a suite of scenarios in parallel",
    "  webmobai-codegen     record a flow interactively",
    "  webmobai-monitor     recurring runs with regression alerts",
    "",
    "Docs: https://github.com/celikgo/webmobai",
  ].join("\n");
}

async function main() {
  const argv = process.argv.slice(2);

  // Handle these before touching the transport: a client never passes them,
  // and a human who types --help must not get a server that silently blocks
  // on stdin waiting for a protocol handshake that will never come.
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(helpText());
    process.exit(0);
  }
  if (argv.includes("-V") || argv.includes("--version")) {
    console.log(version());
    process.exit(0);
  }

  logger.info(`Starting WebMobAI MCP Server v${version()}`);

  const { server } = createMcpServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
  logger.info("WebMobAI MCP Server running on stdio transport");

  // Handle shutdown gracefully
  process.on("SIGINT", async () => {
    logger.info("Received SIGINT, shutting down...");
    await server.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    logger.info("Received SIGTERM, shutting down...");
    await server.close();
    process.exit(0);
  });
}

main().catch((error) => {
  logger.error("Fatal error:", error);
  process.exit(1);
});
