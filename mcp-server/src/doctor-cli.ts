#!/usr/bin/env node

/**
 * webmobai-doctor — preflight environment check.
 *
 *   webmobai-doctor [--storage-state <auth.json>]
 *
 * Verifies the machine can actually run WebMobAI before a user hits a cryptic
 * failure mid-run: Node version, Playwright browsers installed (with the exact
 * install command when they aren't), the optional Lighthouse dependency, the
 * AI API key, and — if given — that a storageState auth file exists and hasn't
 * expired. Exit 0 when nothing is broken, 1 when a hard requirement is missing.
 */

import { chromium, firefox, webkit, type BrowserType } from "playwright";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

type Status = "ok" | "warn" | "error";
interface Check {
  name: string;
  status: Status;
  detail: string;
}

const ICON: Record<Status, string> = { ok: "✓", warn: "!", error: "✗" };

function checkNode(): Check {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (major >= 18) {
    return { name: "Node.js", status: "ok", detail: `v${process.versions.node} (>= 18 required)` };
  }
  return {
    name: "Node.js",
    status: "error",
    detail: `v${process.versions.node} is too old — WebMobAI requires Node 18+. Install a newer Node.`,
  };
}

function checkBrowser(label: string, type: BrowserType, required: boolean): Check {
  let installed = false;
  try {
    installed = existsSync(type.executablePath());
  } catch {
    installed = false;
  }
  if (installed) return { name: `Browser: ${label}`, status: "ok", detail: "installed" };
  return {
    name: `Browser: ${label}`,
    status: required ? "error" : "warn",
    detail:
      `not installed — run: npx playwright install ${label}` +
      (required ? "  (required: chromium is the default engine)" : "  (optional engine)"),
  };
}

function checkLighthouse(): Check {
  try {
    const require = createRequire(import.meta.url);
    require.resolve("lighthouse");
    return { name: "Lighthouse (optional)", status: "ok", detail: "installed — official scores available" };
  } catch {
    return {
      name: "Lighthouse (optional)",
      status: "warn",
      detail: "not installed — webmobai_lighthouse_audit is unavailable. Add it with: npm install lighthouse chrome-launcher",
    };
  }
}

function checkApiKey(): Check {
  const key = process.env.WEBMOBAI_ANTHROPIC_API_KEY?.trim();
  if (key) {
    return { name: "AI features (optional)", status: "ok", detail: "WEBMOBAI_ANTHROPIC_API_KEY is set" };
  }
  return {
    name: "AI features (optional)",
    status: "warn",
    detail: "WEBMOBAI_ANTHROPIC_API_KEY not set — visual-diff narration, audit summaries, and NL→scenario are disabled",
  };
}

function checkStorageState(path: string): Check {
  const abs = resolve(path);
  const name = "Auth storageState";
  if (!existsSync(abs)) {
    return { name, status: "error", detail: `file not found: ${abs} — create it by logging in and saving the session` };
  }
  let parsed: { cookies?: { expires?: number }[] };
  try {
    parsed = JSON.parse(readFileSync(abs, "utf-8"));
  } catch {
    return { name, status: "error", detail: `${abs} is not valid storageState JSON` };
  }
  const cookies = parsed.cookies ?? [];
  const nowSec = Date.now() / 1000;
  // -1 (or absent) means a session cookie with no fixed expiry.
  const expiring = cookies.filter((c) => typeof c.expires === "number" && c.expires > 0);
  if (expiring.length > 0 && expiring.every((c) => (c.expires as number) < nowSec)) {
    return { name, status: "warn", detail: `every dated cookie in ${path} has expired — the session is likely stale; re-save it` };
  }
  return { name, status: "ok", detail: `${cookies.length} cookie(s) loaded from ${path}` };
}

function main(): void {
  const argv = process.argv.slice(2);
  let storageState: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--storage-state") storageState = argv[++i];
    else if (argv[i] === "-h" || argv[i] === "--help") {
      console.log("Usage: webmobai-doctor [--storage-state <auth.json>]");
      process.exit(0);
    }
  }

  const checks: Check[] = [
    checkNode(),
    checkBrowser("chromium", chromium, true),
    checkBrowser("firefox", firefox, false),
    checkBrowser("webkit", webkit, false),
    checkLighthouse(),
    checkApiKey(),
  ];
  if (storageState) checks.push(checkStorageState(storageState));

  console.log("WebMobAI environment check\n");
  for (const c of checks) {
    console.log(`  ${ICON[c.status]} ${c.name}: ${c.detail}`);
  }

  const errors = checks.filter((c) => c.status === "error").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  console.log("");
  if (errors > 0) {
    console.log(`${errors} problem(s) must be fixed before WebMobAI will run. ${warns} warning(s).`);
    process.exit(1);
  }
  console.log(`All required checks passed${warns > 0 ? `, ${warns} optional warning(s)` : ""}. You're ready.`);
  process.exit(0);
}

main();
