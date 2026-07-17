import { chromium, firefox, webkit, type BrowserType } from "playwright";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { logger } from "./logger.js";
import type { BrowserName } from "../playwright/browser-manager.js";

const execFileAsync = promisify(execFile);

const ENGINES: Record<BrowserName, BrowserType> = { chromium, firefox, webkit };

/**
 * Ensure the requested Playwright browser engine is installed, downloading it
 * on first use. A clean `npm install -g webmobai-mcp` ships no browsers, so
 * without this every entrypoint except `webmobai-test` crashed on first launch
 * with Playwright's "Executable doesn't exist" error. This is a no-op once the
 * engine is present, so it adds no cost after the one-time install.
 *
 * Called from BrowserManager.launch(), so it covers the MCP server and every
 * CLI (scenario, suite, codegen, monitor) through a single choke point.
 */
export async function ensureBrowserInstalled(
  engine: BrowserName = "chromium",
): Promise<void> {
  const type = ENGINES[engine];
  if (!type) return;

  let execPath = "";
  try {
    execPath = type.executablePath();
  } catch {
    execPath = "";
  }
  if (execPath && existsSync(execPath)) return;

  logger.info(
    `First run — downloading the ${engine} browser (one-time, ~1–3 min). Set it up ahead of time with: npx playwright install ${engine}`,
  );

  // Resolve Playwright's CLI through Node's module resolution rather than a
  // path relative to this file — the latter breaks in the bundled desktop
  // layout where the directory depth differs.
  let cliPath: string;
  try {
    cliPath = createRequire(import.meta.url).resolve("playwright/cli.js");
  } catch {
    throw new Error(
      `Cannot locate the Playwright CLI to install ${engine}. Install it manually with: npx playwright install ${engine}`,
    );
  }

  await execFileAsync(process.execPath, [cliPath, "install", engine], {
    timeout: 10 * 60 * 1000,
  });
  logger.info(`${engine} browser installed.`);
}
