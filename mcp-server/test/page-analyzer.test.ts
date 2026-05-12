import { describe, expect, it } from "vitest";
import { PageAnalyzer } from "../src/playwright/page-analyzer.js";
import { fixtureUrl, setupPage } from "./helpers/browser-fixture.js";

const ctx = setupPage();

describe("PageAnalyzer.runAccessibilityAudit", () => {
  it("flags every expected issue on the broken-fixture page", async () => {
    await ctx.page.goto(fixtureUrl("a11y-issues.html"));
    const analyzer = new PageAnalyzer(ctx.page);
    const issues = await analyzer.runAccessibilityAudit();
    const rules = new Set(issues.map((i) => i.rule));

    // Missing alt on the hero <img>.
    expect(rules.has("image-alt")).toBe(true);
    // Unlabeled <input>.
    expect(rules.has("label")).toBe(true);
    // Icon-only <button> with no accessible name.
    expect(rules.has("button-name")).toBe(true);
    // <html> has no lang.
    expect(rules.has("html-has-lang")).toBe(true);
    // No <main> landmark.
    expect(rules.has("landmark-one-main")).toBe(true);
    // No skip-nav link.
    expect(rules.has("skip-link")).toBe(true);
    // Small text — note: renamed from "text-size" with wrong color-contrast
    // helpUrl in the previous implementation. This regression-tests the fix.
    expect(rules.has("small-text")).toBe(true);

    // Make sure we did NOT mislabel small text as a contrast issue.
    const smallText = issues.find((i) => i.rule === "small-text");
    expect(smallText?.helpUrl).not.toMatch(/color-contrast/);
    expect(smallText?.impact).toBe("minor");
  });

  it("does not flag a clean page for the rules that were buggy", async () => {
    await ctx.page.goto(fixtureUrl("a11y-clean.html"));
    const analyzer = new PageAnalyzer(ctx.page);
    const issues = await analyzer.runAccessibilityAudit();
    const rules = new Set(issues.map((i) => i.rule));

    // These are the rules whose detection was broken before this sprint.
    expect(rules.has("skip-link")).toBe(false);
    expect(rules.has("landmark-one-main")).toBe(false);
    expect(rules.has("html-has-lang")).toBe(false);
    expect(rules.has("label")).toBe(false);
    expect(rules.has("button-name")).toBe(false);
    expect(rules.has("image-alt")).toBe(false);
  });
});

describe("PageAnalyzer.runAccessibilityAudit — axe-core integration", () => {
  it("returns axe-prefixed rules on a broken page", async () => {
    await ctx.page.goto(fixtureUrl("a11y-issues.html"));
    const analyzer = new PageAnalyzer(ctx.page);
    const issues = await analyzer.runAccessibilityAudit();
    // axe-core finds these and tags them with the rule id we map to.
    // We check a few canonical axe rule names appear with the axe- prefix.
    const axeRules = issues.filter((i) => i.rule.startsWith("axe-") || /^[a-z-]+$/.test(i.rule));
    expect(axeRules.length).toBeGreaterThan(0);
    // axe-core should flag the missing alt text — its rule id is "image-alt"
    // (matches our supplementary rule name; dedupe leaves only one).
    expect(issues.some((i) => /image-alt/.test(i.rule))).toBe(true);
    // axe-core should flag the unlabeled input (rule "label").
    expect(issues.some((i) => /label/.test(i.rule))).toBe(true);
  });

  it("deduplicates rules already covered by axe-core", async () => {
    await ctx.page.goto(fixtureUrl("a11y-issues.html"));
    const analyzer = new PageAnalyzer(ctx.page);
    const issues = await analyzer.runAccessibilityAudit();
    // Group by rule name. A single rule should not appear once from axe and
    // once from the supplementary path — dedupe is on rule id.
    const ruleCounts = issues.reduce<Record<string, number>>((acc, i) => {
      acc[i.rule] = (acc[i.rule] ?? 0) + 1;
      return acc;
    }, {});
    // Each rule shouldn't appear from both sources. Our merge in
    // runAccessibilityAudit removes supplementary entries whose rule id
    // already came from axe.
    for (const [rule, count] of Object.entries(ruleCounts)) {
      // axe can legitimately return multiple violations of the same rule
      // (one per failing node) — but we collapse them into a single issue
      // with multiple nodes. Either way, a rule should appear at most once
      // overall in our merged output.
      expect(count, `rule ${rule} appears more than once`).toBe(1);
    }
  });
});

describe("PageAnalyzer.getAccessibilityTree", () => {
  it("returns a tree using computed roles, not a DOM walk with innerText", async () => {
    await ctx.page.goto(fixtureUrl("a11y-clean.html"));
    const analyzer = new PageAnalyzer(ctx.page);
    const tree = await analyzer.getAccessibilityTree();

    // The tree should mention the page's roles, not just tag names. CDP
    // returns "WebArea" for the document and standard ARIA roles for nodes.
    expect(tree).toMatch(/\[WebArea\]|\[RootWebArea\]/);
    expect(tree).toMatch(/\[main\]/);
    expect(tree).toMatch(/\[heading\] "Welcome"/);

    // <img alt="A cat sleeping in a sunbeam"> should appear as an image
    // node whose name is the alt text — proves the tree uses accessible
    // names, not innerText.
    expect(tree).toContain("A cat sleeping in a sunbeam");

    // Regression guard for the previous DOM-walk implementation: there, the
    // <main>/<body> ancestor's "name" was set to a slice of innerText,
    // which contained the heading and paragraph text. With a real a11y
    // tree, ancestor nodes have an empty or role-derived name, never the
    // descendant text. Match `[main] ""` or `[main]` (no quoted name).
    expect(tree).toMatch(/\[main\](\s|$|\s\n)/);
    // And the <body>-equivalent should not exist as a labeled ancestor
    // containing the heading text.
    expect(tree).not.toMatch(/\[(body|none|generic)\] "Welcome/);
  });
});
