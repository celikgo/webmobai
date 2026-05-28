#!/usr/bin/env node

/**
 * `webmobai-monitor` — Sprint 17.
 *
 * Runs the autonomous auto-test on a URL repeatedly, on a fixed interval,
 * appending each run to `~/.webmobai/history.json` and (optionally) POSTing a
 * regression bundle to an alert webhook when this run is worse than the
 * historical median.
 *
 * Implementation note: rather than refactor auto-test.ts (which is structured
 * as a one-shot script with `process.exit` calls), we spawn it as a child
 * process per run. Output is forwarded through to the parent so users can
 * tail it the same way they'd tail any one-off run.
 *
 * Usage:
 *   webmobai-monitor <url> [config-json] [flags]
 *
 * Flags:
 *   --interval=<duration>     "30s", "5m", "1h" (default: 5m)
 *   --once                    Run a single iteration and exit (smoke test)
 *   --alert-webhook=<url>     POST regression bundle as JSON when detected
 *   --config=<json>           SessionConfig JSON (alternative to positional)
 */

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readRunHistory,
  detectRegressions,
  type RunHistoryEntry,
  type RegressionFinding,
} from "./utils/run-history.js";

export interface MonitorOptions {
  url: string;
  configJson: string;
  intervalMs: number;
  once: boolean;
  webhook?: string;
}

/**
 * Parse a human duration like "30s", "5m", "1h" into milliseconds.
 * Exported for unit tests.
 */
export function parseInterval(s: string): number {
  const m = s.match(/^\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h)\s*$/i);
  if (!m) {
    throw new Error(
      `Bad interval "${s}". Use a number followed by ms/s/m/h (e.g. "30s", "5m", "1h").`,
    );
  }
  const n = Number(m[1]);
  const unit = m[2]!.toLowerCase();
  const mult =
    unit === "ms" ? 1 : unit === "s" ? 1000 : unit === "m" ? 60_000 : 3_600_000;
  return n * mult;
}

/** Parse CLI args. Exported for tests. */
export function parseArgs(argv: string[]): MonitorOptions {
  let url: string | undefined;
  let configJson = "{}";
  let intervalMs = 5 * 60_000;
  let once = false;
  let webhook: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--once") {
      once = true;
    } else if (a === "--interval" || a === "--every") {
      intervalMs = parseInterval(argv[++i] ?? "");
    } else if (a.startsWith("--interval=")) {
      intervalMs = parseInterval(a.slice("--interval=".length));
    } else if (a === "--alert-webhook") {
      webhook = argv[++i];
    } else if (a.startsWith("--alert-webhook=")) {
      webhook = a.slice("--alert-webhook=".length);
    } else if (a === "--config") {
      configJson = argv[++i] ?? "{}";
    } else if (a.startsWith("--config=")) {
      configJson = a.slice("--config=".length);
    } else if (a.startsWith("--")) {
      throw new Error(`Unknown flag: ${a}`);
    } else if (!url) {
      url = a;
    } else {
      // Second positional = config JSON (matches webmobai-test convention).
      configJson = a;
    }
  }
  if (!url) {
    throw new Error(
      "Usage: webmobai-monitor <url> [config-json] [--interval=5m] [--once] [--alert-webhook=<url>]",
    );
  }
  return { url, configJson, intervalMs, once, webhook };
}

async function runOnce(autoTestPath: string, url: string, config: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [autoTestPath, url, config], {
      stdio: "inherit",
    });
    child.on("exit", (code) => resolve(code ?? 0));
  });
}

async function postWebhook(
  webhook: string,
  body: Record<string, unknown>,
): Promise<void> {
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`[monitor] webhook returned ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.error(
      `[monitor] webhook POST failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function checkAndAlert(url: string, webhook: string | undefined): Promise<void> {
  const history = await readRunHistory();
  const forUrl: RunHistoryEntry[] = history.filter((h) => h.url === url);
  const latest = forUrl[forUrl.length - 1];
  if (!latest) return;
  const comparison = detectRegressions(latest, history);
  const regressions: RegressionFinding[] = comparison.findings.filter(
    (f) => f.severity === "regression",
  );
  if (regressions.length === 0) {
    console.log(
      `[monitor] no regressions vs baseline of ${comparison.baselineRuns} runs`,
    );
    return;
  }
  console.log(
    `[monitor] ${regressions.length} regression(s) detected vs baseline of ${comparison.baselineRuns} runs:`,
  );
  for (const r of regressions) {
    console.log(`  - ${r.message}`);
  }
  if (webhook) {
    await postWebhook(webhook, {
      url,
      latestRunId: latest.id,
      timestamp: latest.timestamp,
      baselineRuns: comparison.baselineRuns,
      regressions,
    });
  }
}

async function sleepInTicks(ms: number, isStopping: () => boolean): Promise<void> {
  // Wake every 250ms so Ctrl-C between iterations stops promptly.
  const end = Date.now() + ms;
  while (Date.now() < end && !isStopping()) {
    await new Promise((r) => setTimeout(r, Math.min(250, end - Date.now())));
  }
}

/** Main loop. Exported (and parameterized) so a test can drive it without spawning. */
export async function runMonitorLoop(
  opts: MonitorOptions,
  hooks: {
    runOnce: () => Promise<number>;
    afterRun?: () => Promise<void>;
    isStopping: () => boolean;
  },
): Promise<void> {
  console.log(
    `[monitor] watching ${opts.url} every ${(opts.intervalMs / 1000).toFixed(0)}s${opts.webhook ? ` (alerts → ${opts.webhook})` : ""}`,
  );
  while (!hooks.isStopping()) {
    console.log(`[monitor] run start ${new Date().toISOString()}`);
    const code = await hooks.runOnce();
    console.log(`[monitor] run complete (exit=${code})`);
    if (hooks.afterRun) await hooks.afterRun();
    if (opts.once || hooks.isStopping()) break;
    console.log(`[monitor] next run in ${(opts.intervalMs / 1000).toFixed(0)}s`);
    await sleepInTicks(opts.intervalMs, hooks.isStopping);
  }
  console.log("[monitor] stopped");
}

// Skip main when imported (e.g. by tests).
const isDirectInvocation =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("monitor-cli.js");

if (isDirectInvocation) {
  let stopping = false;
  process.on("SIGINT", () => {
    stopping = true;
    console.log("[monitor] received SIGINT — finishing current run then exiting");
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });

  let opts: MonitorOptions;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const autoTestPath = resolve(here, "auto-test.js");

  runMonitorLoop(opts, {
    runOnce: () => runOnce(autoTestPath, opts.url, opts.configJson),
    afterRun: () => checkAndAlert(opts.url, opts.webhook),
    isStopping: () => stopping,
  })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(
        `[monitor] fatal: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    });
}
