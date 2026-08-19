#!/usr/bin/env node
/**
 * Verify that the numbers the documentation states about this repository are
 * the numbers the repository actually has.
 *
 * The README advertises "51 MCP tools", "7 binaries" and "214 tests". Numbers
 * like those are written once and then drift silently: nothing breaks when a
 * tool is added, so nothing tells you the README is now wrong. This script
 * recounts them from the tree and fails the build on any disagreement, which
 * turns a documentation claim into a tested one.
 *
 * Usage:
 *   node scripts/check-doc-claims.mjs [--vitest-json <path>]
 *
 * --vitest-json  Read the test total from an existing vitest JSON report
 *                instead of running the suite again. CI passes the report it
 *                already produced; without it this script runs vitest itself.
 * --eval-json    Read the selector-recovery rates from the eval's JSON report
 *                (mcp-server: `npm run eval:report`). The README and
 *                docs/DESIGNED_FOR_AGENTS.md both quote those percentages, so
 *                they are claims like any other. Omit it and the eval-derived
 *                claims are skipped with a warning rather than silently passing.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mcp = join(repoRoot, "mcp-server");

const args = process.argv.slice(2);
const vitestJsonIdx = args.indexOf("--vitest-json");
const vitestJsonPath = vitestJsonIdx !== -1 ? args[vitestJsonIdx + 1] : null;
const evalJsonIdx = args.indexOf("--eval-json");
const evalJsonPath = evalJsonIdx !== -1 ? args[evalJsonIdx + 1] : null;

/* ------------------------------------------------------------------ *
 * Count what is actually there.
 * ------------------------------------------------------------------ */

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/**
 * MCP tools are counted by their registered name literal, `name: "webmobai_*"`,
 * deduplicated — a tool declared in its schema and again in a switch arm is one
 * tool. This is the same expression the README's own claim was derived from.
 */
function countTools() {
  const names = new Set();
  for (const file of walk(join(mcp, "src")).filter((f) => f.endsWith(".ts"))) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/name:\s*"(webmobai_[a-z_]+)"/g)) names.add(m[1]);
  }
  return names.size;
}

const countToolFiles = () =>
  readdirSync(join(mcp, "src", "tools")).filter((f) => f.endsWith(".ts")).length;

const countBinaries = () =>
  Object.keys(JSON.parse(readFileSync(join(mcp, "package.json"), "utf8")).bin).length;

const countTestFiles = () =>
  walk(join(mcp, "test")).filter((f) => f.endsWith(".test.ts")).length;

const countSkills = () =>
  readdirSync(join(repoRoot, ".claude", "skills"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(repoRoot, ".claude", "skills", d.name, "SKILL.md")))
    .length;

function countTests() {
  let raw;
  if (vitestJsonPath) {
    if (!existsSync(vitestJsonPath)) {
      console.error(`✗ --vitest-json path does not exist: ${vitestJsonPath}`);
      process.exit(2);
    }
    raw = readFileSync(vitestJsonPath, "utf8");
  } else {
    console.log("  (running vitest to count tests — pass --vitest-json to reuse a report)");
    raw = execFileSync("npx", ["vitest", "run", "--reporter=json"], {
      cwd: mcp,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  }
  // The json reporter can emit progress noise before the JSON body; take from
  // the first brace so the parse does not depend on that staying clean.
  const body = raw.slice(raw.indexOf("{"));
  const report = JSON.parse(body);
  if (typeof report.numTotalTests !== "number") {
    console.error("✗ vitest JSON report has no numTotalTests");
    process.exit(2);
  }
  return report.numTotalTests;
}

/**
 * The selector-recovery rates quoted in the README and in
 * docs/DESIGNED_FOR_AGENTS.md. These come from the eval rather than from the
 * tree, but they are documentation claims in exactly the same sense: a number
 * printed in prose that nothing checks will drift.
 */
function evalNumbers() {
  if (!evalJsonPath) return null;
  if (!existsSync(evalJsonPath)) {
    console.error(`✗ --eval-json path does not exist: ${evalJsonPath}`);
    process.exit(2);
  }
  const r = JSON.parse(readFileSync(evalJsonPath, "utf8"));
  return {
    evalCases: r.results.length,
    evalRecovery: r.recoveryRate,
    evalTop3: r.top3Rate,
    evalRecovered: r.counts.recovered,
    evalRecoverCases: r.counts.recoverCases,
  };
}

const actual = {
  tools: countTools(),
  toolFiles: countToolFiles(),
  binaries: countBinaries(),
  tests: countTests(),
  testFiles: countTestFiles(),
  skills: countSkills(),
  ...(evalNumbers() ?? {}),
};

/* ------------------------------------------------------------------ *
 * Every place the docs state one of those numbers.
 *
 * Each entry is a regex with exactly one capture group holding the claimed
 * number, the key it must equal, and a human label. EVERY match of every
 * pattern is checked, not just the first — a number repeated in five places
 * has to be right in five places.
 * ------------------------------------------------------------------ */

const claims = [
  // ---- root README.md ----
  ["README.md", /Claude calls (\d+) tools/g, "tools", "intro: Claude calls N tools"],
  ["README.md", /all (\d+) tools, their parameters/g, "tools", "doc map: all N tools"],
  ["README.md", /\*\*(\d+) MCP tools\*\*/g, "tools", "headline: N MCP tools"],
  ["README.md", /across (\d+) tool files/g, "toolFiles", "headline: across N tool files"],
  ["README.md", /\*\*(\d+) binaries\*\*/g, "binaries", "headline: N binaries"],
  ["README.md", /\*\*(\d+) tests\*\* in (?:\d+) files/g, "tests", "headline: N tests"],
  ["README.md", /\*\*\d+ tests\*\* in (\d+) files/g, "testFiles", "headline: in N files"],
  ["README.md", /\*\*(\d+) Claude Code skills\*\*/g, "skills", "headline: N Claude Code skills"],
  ["README.md", /the (\d+) packaged testing workflows/g, "skills", "doc map: N packaged workflows"],
  ["README.md", /\*\*(\d+) Claude Code skills\*\* — packaged/g, "skills", "table: N Claude Code skills"],
  ["README.md", /\*\*(\d+) packaged testing workflows\*\*/g, "skills", "skills section: N workflows"],
  ["README.md", /which of the (\d+) MCP tools it drives/g, "tools", "skills section: of the N MCP tools"],
  ["README.md", /# (\d+) Claude Code skills \+ their shared README/g, "skills", "tree: N skills"],
  ["README.md", /(\d+) MCP tool files \(\d+ tools\)/g, "toolFiles", "tree: N tool files"],
  ["README.md", /\d+ MCP tool files \((\d+) tools\)/g, "tools", "tree: (N tools)"],
  ["README.md", /(\d+) tests across \d+ files/g, "tests", "tree: N tests"],
  ["README.md", /\d+ tests across (\d+) files/g, "testFiles", "tree: across N files"],

  // ---- eval-derived claims (only checked when --eval-json is given) ----
  ["README.md", /corpus of (\d+) real-world selector breakages/g, "evalCases", "intro: corpus of N breakages", true],
  ["README.md", /recovers \*\*([\d.]+)%\*\* of broken selectors/g, "evalRecovery", "intro: recovers N% first retry", true],
  ["README.md", /\(([\d.]+)% within the top three\)/g, "evalTop3", "intro: N% within top three", true],
  ["docs/DESIGNED_FOR_AGENTS.md", /\*\*Top-1 recovery: ([\d.]+)%\*\*/g, "evalRecovery", "eval table: top-1 recovery", true],
  ["docs/DESIGNED_FOR_AGENTS.md", /\*\*Top-3 recovery: ([\d.]+)%\*\*/g, "evalTop3", "eval table: top-3 recovery", true],
  ["docs/DESIGNED_FOR_AGENTS.md", /Top-1 recovery: [\d.]+%\*\* — (\d+)\//g, "evalRecovered", "eval table: N recovered", true],
  ["docs/DESIGNED_FOR_AGENTS.md", /Top-1 recovery: [\d.]+%\*\* — \d+\/(\d+)/g, "evalRecoverCases", "eval table: of N recover cases", true],
  ["docs/DESIGNED_FOR_AGENTS.md", /corpus of (\d+) real-world selector breakages/g, "evalCases", "doc: corpus of N breakages", true],

  // ---- mcp-server/README.md — this one is the npm package page ----
  ["mcp-server/README.md", /browser through (\d+) tools/g, "tools", "npm intro: through N tools"],
  ["mcp-server/README.md", /exposes all (\d+) tools/g, "tools", "npm bin table: all N tools"],
  ["mcp-server/README.md", /## Available tools \((\d+)\)/g, "tools", "npm heading: Available tools (N)"],
];

/* ------------------------------------------------------------------ *
 * Compare.
 * ------------------------------------------------------------------ */

console.log("Counted from the tree:");
for (const [k, v] of Object.entries(actual)) console.log(`  ${k.padEnd(10)} ${v}`);
console.log("");

const failures = [];
let checked = 0;
const seenPatterns = new Set();

let skippedEvalClaims = 0;
for (const [file, pattern, key, label, needsEval] of claims) {
  if (needsEval && !evalJsonPath) { skippedEvalClaims++; continue; }
  const path = join(repoRoot, file);
  if (!existsSync(path)) {
    failures.push(`${file}: file not found (a doc this script guards was moved or deleted)`);
    continue;
  }
  const text = readFileSync(path, "utf8");
  const matches = [...text.matchAll(pattern)];
  if (matches.length === 0) {
    // A claim that vanished is as much a drift signal as a wrong one: either
    // the docs were reworded (update this script) or the statement was lost.
    failures.push(
      `${file}: no longer states "${label}" — the wording changed, so this check is no longer guarding it. Update scripts/check-doc-claims.mjs.`,
    );
    continue;
  }
  seenPatterns.add(label);
  for (const m of matches) {
    checked++;
    const claimed = Number(m[1]);
    if (claimed !== actual[key]) {
      failures.push(
        `${file}: "${label}" claims ${claimed}, tree has ${actual[key]}  →  ${JSON.stringify(m[0])}`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} documentation claim(s) disagree with the tree:\n`);
  for (const f of failures) console.error(`  ${f}`);
  console.error(
    "\nFix the documentation to match the tree (or the tree to match the documentation).\n" +
      "Do not change this script to make the numbers agree unless the wording itself moved.",
  );
  process.exit(1);
}

console.log(`✓ ${checked} documentation claim(s) across ${new Set(claims.map((c) => c[0])).size} file(s) match the tree.`);
if (skippedEvalClaims > 0) {
  console.warn(
    `⚠ ${skippedEvalClaims} eval-derived claim(s) not checked — pass --eval-json <path> ` +
      `(produced by \`npm run eval:report\` in mcp-server) to verify the published recovery rates too.`,
  );
}
