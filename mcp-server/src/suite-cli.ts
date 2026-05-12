#!/usr/bin/env node

/**
 * webmobai-suite — run a collection of scenarios in parallel.
 *
 * Usage:
 *   webmobai-suite path/to/suite.json [options]
 *
 * Options:
 *   --workers N           Concurrent scenarios (default 4, max recommended ~8)
 *   --shard k/n           Run shard k of n (CI machines split the load)
 *   --tag T               Include only scenarios with this tag (repeatable, OR)
 *   --exclude-tag T       Exclude scenarios with this tag (repeatable)
 *   --reporter R          html | junit | both | none (default both)
 *   --out DIR             Where to write aggregate reports (default cwd)
 *
 * Exit code is 0 on full pass, 1 on any failed scenario, 2 on usage error.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { cpus } from "node:os";
import { loadSuite } from "./suite/loader.js";
import { applyShard, filterByTags, parseShard } from "./suite/filter.js";
import { runSuite } from "./suite/runner.js";
import { generateHtmlReport } from "./utils/report-generator.js";
import { generateJunitReport } from "./utils/junit-generator.js";
import type { TestReportData, TestResult } from "./types.js";

interface ParsedArgs {
  suitePath: string;
  workers: number;
  shard?: { index: number; total: number };
  includeTags: string[];
  excludeTags: string[];
  reporter: "html" | "junit" | "both" | "none";
  outDir: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 0) {
    die(2, "Usage: webmobai-suite <suite.json> [--workers N] [--shard k/n] [--tag T] [--exclude-tag T] [--reporter R] [--out DIR]");
  }
  const args: ParsedArgs = {
    suitePath: "",
    workers: Math.min(4, Math.max(1, cpus().length)),
    includeTags: [],
    excludeTags: [],
    reporter: "both",
    outDir: process.cwd(),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => {
      const v = argv[++i];
      if (v == null) die(2, `Missing value for ${a}`);
      return v!;
    };
    switch (a) {
      case "--workers":
        args.workers = Number.parseInt(next(), 10);
        if (!Number.isFinite(args.workers) || args.workers < 1) {
          die(2, `--workers must be a positive integer`);
        }
        break;
      case "--shard":
        args.shard = parseShard(next());
        break;
      case "--tag":
        args.includeTags.push(next());
        break;
      case "--exclude-tag":
        args.excludeTags.push(next());
        break;
      case "--reporter": {
        const v = next();
        if (!["html", "junit", "both", "none"].includes(v)) {
          die(2, `--reporter must be one of html|junit|both|none`);
        }
        args.reporter = v as ParsedArgs["reporter"];
        break;
      }
      case "--out":
        args.outDir = resolve(next());
        break;
      case "-h":
      case "--help":
        die(0, helpText());
      default:
        if (a.startsWith("--")) die(2, `Unknown option: ${a}`);
        if (args.suitePath) die(2, `Unexpected positional arg: ${a}`);
        args.suitePath = a;
    }
  }
  if (!args.suitePath) die(2, "Missing suite path");
  return args;
}

function helpText(): string {
  return [
    "webmobai-suite — run a collection of scenarios in parallel",
    "",
    "Usage: webmobai-suite <suite.json> [options]",
    "",
    "Options:",
    "  --workers N         concurrent scenarios (default min(4, cpus))",
    "  --shard k/n         run shard k of n (k is 1-based)",
    "  --tag T             include only scenarios with this tag (repeatable)",
    "  --exclude-tag T     exclude scenarios with this tag (repeatable)",
    "  --reporter R        html | junit | both | none (default both)",
    "  --out DIR           output directory for aggregate reports",
    "",
    "Exit codes: 0 = all pass, 1 = at least one scenario failed, 2 = usage error",
  ].join("\n");
}

function die(code: number, message: string): never {
  if (code === 0) console.log(message);
  else console.error(message);
  process.exit(code);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { suite, runnables: allRunnables } = await loadSuite(args.suitePath);
  console.log(`Loaded suite "${suite.name}" (${allRunnables.length} scenarios)`);

  let runnables = filterByTags(allRunnables, {
    includeTags: args.includeTags,
    excludeTags: args.excludeTags,
  });
  if (args.includeTags.length || args.excludeTags.length) {
    console.log(
      `After tag filter: ${runnables.length} scenarios (include=[${args.includeTags.join(",")}] exclude=[${args.excludeTags.join(",")}])`,
    );
  }
  if (args.shard) {
    runnables = applyShard(runnables, args.shard);
    console.log(
      `Shard ${args.shard.index}/${args.shard.total}: ${runnables.length} scenarios on this machine`,
    );
  }
  if (runnables.length === 0) {
    console.log("No scenarios to run.");
    process.exit(0);
  }

  console.log(`Running ${runnables.length} scenarios with ${args.workers} workers...\n`);

  const result = await runSuite(runnables, {
    workers: args.workers,
    onProgress: (e) => {
      if (e.type === "scenario-complete") {
        const icon = e.status === "pass" ? "✓" : "✗";
        console.log(`  ${icon} ${e.name}`);
      }
    },
  });

  // Aggregate into a TestReportData so we get the same HTML/JUnit
  // artifact shape as the standalone runners. Each scenario step becomes a
  // TestResult; the suite is one TestReportData per run.
  const testResults: TestResult[] = result.scenarios.flatMap((s) =>
    s.result.results.map((step) => ({
      url: s.result.url,
      title: `${s.name} — ${step.message.split("\n")[0]}`,
      status:
        step.status === "pass" ? "pass" : step.status === "fail" ? "fail" : "warning",
      category: s.tags[0] ?? "Scenario",
      description: `${step.step.type} (${step.durationMs}ms)`,
      details: step.status === "fail" ? step.message : undefined,
    })),
  );

  const reportData: TestReportData = {
    id: `suite-${Date.now()}`,
    url: result.scenarios[0]?.result.url ?? "suite",
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    summary: {
      totalTests: result.summary.totalSteps,
      passed: result.summary.passedSteps,
      failed: result.summary.failedSteps,
      warnings: result.summary.skippedSteps,
    },
    results: testResults,
    accessibilityIssues: [],
    performanceMetrics: {
      lcp: null,
      fcp: null,
      cls: null,
      tti: null,
      ttfb: null,
      domContentLoaded: null,
      loadComplete: null,
    },
    consoleErrors: [],
    screenshots: [],
    pagesExplored: result.scenarios.map((s) => s.result.url),
  };

  await mkdir(args.outDir, { recursive: true });
  if (args.reporter === "html" || args.reporter === "both") {
    const path = await generateHtmlReport(reportData, args.outDir);
    console.log(`\nHTML report: ${path}`);
  }
  if (args.reporter === "junit" || args.reporter === "both") {
    const path = await generateJunitReport(reportData, args.outDir);
    console.log(`JUnit XML:   ${path}`);
  }

  // Also write a per-suite JSON for downstream tooling.
  const jsonPath = resolve(args.outDir, `suite-${Date.now()}.json`);
  await writeFile(jsonPath, JSON.stringify(result, null, 2), "utf-8");
  console.log(`Raw JSON:    ${jsonPath}`);

  console.log(
    `\nSuite complete: ${result.summary.passedScenarios}/${result.summary.totalScenarios} scenarios passed; ${result.summary.passedSteps}/${result.summary.totalSteps} steps passed`,
  );
  process.exit(result.summary.failedScenarios > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Suite CLI fatal error:", err);
  process.exit(1);
});
