#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.js";
import { logger } from "./utils/logger.js";

async function main() {
  logger.info("Starting WebMobAI MCP Server v1.2.0");

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
