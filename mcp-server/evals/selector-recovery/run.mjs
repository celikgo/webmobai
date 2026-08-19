/**
 * Selector-recovery eval.
 *
 * Measures the claim DESIGNED_FOR_AGENTS.md makes: when a selector stops
 * matching, does the triage WebMobAI hands back actually let a caller recover
 * without a human?
 *
 * Method, per case:
 *   1. Load v1 and snapshot the element the selector matched -- this is what
 *      the tool records on every successful click/type in normal operation.
 *   2. Load v2, in which the selector no longer finds the intended element.
 *   3. Ask for ranked candidate replacements from that snapshot.
 *   4. Resolve the top-ranked suggestion with Playwright.
 *
 * A case counts as recovered only when the top suggestion resolves to
 * **exactly one** element and that element is the intended target. Uniqueness
 * is part of the bar: a selector matching two elements is a Playwright strict
 * mode violation, so "the right one was among several" is not a recovery an
 * agent could act on.
 *
 * `abstain` cases invert the test. The element is genuinely gone, and the
 * correct behaviour is to offer nothing -- an agent told "no similar elements
 * found" stops and reports, whereas a confident wrong suggestion makes it
 * click something arbitrary. Offering nothing when there is nothing is a pass.
 *
 * Imports from dist/ rather than src/: the eval must measure the code that
 * ships, and the scoring function is serialized into the page by
 * `page.evaluate`, which is sensitive to how it was compiled.
 *
 * Usage:
 *   node evals/selector-recovery/run.mjs [--json <path>] [--markdown <path>]
 *                                        [--min-rate <0-100>]
 */

import { chromium } from "playwright";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CORPUS } from "./corpus.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const distModule = resolve(here, "..", "..", "dist", "playwright", "element-snapshot.js");
if (!existsSync(distModule)) {
  console.error(`✗ ${distModule} not found — run \`npm run build\` in mcp-server first.`);
  process.exit(2);
}
const { snapshotElement, findSimilarElements } = await import(distModule);

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const jsonOut = opt("--json");
const mdOut = opt("--markdown");
// A regression gate, not the target: set below the measured rate so ordinary
// noise does not fail the build, but a real degradation of the ranking does.
const minRate = Number(opt("--min-rate") ?? "80");

const workdir = mkdtempSync(join(tmpdir(), "webmobai-eval-"));
const writePage = (name, html) => {
  const p = join(workdir, name);
  writeFileSync(p, html, "utf8");
  return "file://" + p;
};

/** Does `selector` resolve, on this page, to exactly the marked target? */
async function resolvesToTarget(page, selector) {
  try {
    const loc = page.locator(selector);
    const count = await loc.count();
    if (count === 0) return { ok: false, why: "matches 0 elements" };
    if (count > 1) return { ok: false, why: `matches ${count} elements — not actionable (strict mode violation)` };
    const marked = await loc.first().getAttribute("data-eval-target");
    return marked === "1"
      ? { ok: true, why: "resolved uniquely to the intended element" }
      : { ok: false, why: "resolved uniquely, but to the wrong element" };
  } catch (e) {
    return { ok: false, why: `unusable selector: ${String(e.message).split("\n")[0]}` };
  }
}

async function runCase(browser, c) {
  const page = await browser.newPage();
  const base = {
    id: c.id, mutation: c.mutation, selector: c.selector, expect: c.expect,
    topSuggestion: null, topScore: null, candidateCount: 0, targetRankedWithinTop3: false,
  };
  try {
    await page.goto(writePage(`${c.id}-v1.html`, c.v1));
    const prior = await snapshotElement(page, c.selector);
    if (!prior) return { ...base, pass: false, detail: "SETUP ERROR: selector did not match in v1" };

    await page.goto(writePage(`${c.id}-v2.html`, c.v2));

    // Confirm the premise: the mutation must really have broken the selector.
    // "Broken" means it no longer reaches the intended element — it may still
    // match something (the wrong thing), which is the nastier failure mode.
    if (c.expect === "recover") {
      const premise = await resolvesToTarget(page, c.selector);
      if (premise.ok) {
        return { ...base, pass: false, detail: "SETUP ERROR: the original selector still resolves to the target in v2 — this case tests nothing" };
      }
    }

    const candidates = await findSimilarElements(page, prior, 5);

    if (c.expect === "abstain") {
      const pass = candidates.length === 0;
      return {
        ...base, pass,
        detail: pass
          ? "correctly offered no replacement — the agent is told to stop"
          : `offered ${candidates.length} replacement(s) for an element that is gone`,
        topSuggestion: candidates[0]?.suggestedSelector ?? null,
        topScore: candidates[0]?.score ?? null,
        candidateCount: candidates.length,
      };
    }

    if (candidates.length === 0) {
      return { ...base, pass: false, detail: "no candidates offered — the agent has nothing to retry with" };
    }

    const top = candidates[0];
    const verdict = await resolvesToTarget(page, top.suggestedSelector);

    // Secondary metric: the caller receives a ranked list of up to five, so
    // whether the right answer is near the top is worth knowing separately.
    let withinTop3 = false;
    for (const cand of candidates.slice(0, 3)) {
      if ((await resolvesToTarget(page, cand.suggestedSelector)).ok) { withinTop3 = true; break; }
    }

    return {
      ...base, pass: verdict.ok, detail: verdict.why,
      topSuggestion: top.suggestedSelector, topScore: top.score,
      candidateCount: candidates.length, targetRankedWithinTop3: withinTop3,
    };
  } catch (e) {
    return { ...base, pass: false, detail: `ERROR: ${String(e.message).split("\n")[0]}` };
  } finally {
    await page.close();
  }
}

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const c of CORPUS) results.push(await runCase(browser, c));
} finally {
  await browser.close();
  rmSync(workdir, { recursive: true, force: true });
}

const recoverCases = results.filter((r) => r.expect === "recover");
const abstainCases = results.filter((r) => r.expect === "abstain");
const recovered = recoverCases.filter((r) => r.pass).length;
const abstained = abstainCases.filter((r) => r.pass).length;
const top3 = recoverCases.filter((r) => r.targetRankedWithinTop3).length;

const pct = (n, d) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);
const recoveryRate = pct(recovered, recoverCases.length);
const top3Rate = pct(top3, recoverCases.length);
const abstainRate = pct(abstained, abstainCases.length);
const overall = pct(recovered + abstained, results.length);

const md = [
  "| Case | What changed | Original selector | Expected | Result | Top-ranked suggestion |",
  "| ---- | ------------ | ----------------- | -------- | ------ | --------------------- |",
  ...results.map(
    (r) =>
      `| \`${r.id}\` | ${r.mutation} | \`${r.selector}\` | ${r.expect} | ${r.pass ? "pass" : "FAIL"} | ${
        r.topSuggestion ? `\`${String(r.topSuggestion).replace(/\|/g, "\\|")}\`` : "_(none offered)_"
      } |`,
  ),
  "",
  `- **Top-1 recovery: ${recoveryRate}%** — ${recovered}/${recoverCases.length} broken selectors where the highest-ranked suggestion resolved uniquely to the intended element.`,
  `- **Top-3 recovery: ${top3Rate}%** — ${top3}/${recoverCases.length} where a correct replacement appeared in the first three.`,
  `- **Correct abstention: ${abstainRate}%** — ${abstained}/${abstainCases.length} where the element was genuinely gone and nothing was offered.`,
  `- **Overall: ${overall}%** — ${recovered + abstained}/${results.length}.`,
].join("\n");

console.log("\nSelector-recovery eval\n");
console.log(md);

const failures = results.filter((r) => !r.pass);
if (failures.length) {
  console.log("\nFailures:");
  for (const r of failures) console.log(`  - ${r.id}: ${r.detail}`);
}

if (jsonOut) {
  mkdirSync(dirname(resolve(jsonOut)), { recursive: true });
  writeFileSync(jsonOut, JSON.stringify({ recoveryRate, top3Rate, abstainRate, overall, counts: { recovered, recoverCases: recoverCases.length, abstained, abstainCases: abstainCases.length }, results }, null, 2));
  console.log(`\nJSON written to ${jsonOut}`);
}
if (mdOut) {
  mkdirSync(dirname(resolve(mdOut)), { recursive: true });
  writeFileSync(mdOut, md + "\n");
  console.log(`Markdown table written to ${mdOut}`);
}

if (overall < minRate) {
  console.error(`\n✗ overall ${overall}% is below the --min-rate floor of ${minRate}%`);
  process.exit(1);
}
console.log(`\n✓ overall ${overall}% meets the ${minRate}% floor`);
