/**
 * Roll a session's accumulated findings (accessibility, performance, console,
 * tests) into a short executive summary with prioritized suggested fixes.
 *
 * The summarizer is intentionally fed structured numbers and short snippets —
 * not raw JSON dumps — so token cost stays predictable and the model focuses
 * on prioritization rather than parsing.
 */

import { complete } from "./client.js";
import type {
  AccessibilityIssue,
  ConsoleError,
  PerformanceMetrics,
  TestResult,
} from "../types.js";

const SUMMARIZER_SYSTEM = `You are a senior QA lead writing an executive summary for a web audit.

You will receive structured findings (accessibility issues, Web Vitals,
console errors, test results). Produce a concise markdown summary with this
exact structure:

## Headline
One or two sentences describing overall health, plain language, no hedging.

## Top fixes
A bulleted list of at most 5 highest-impact items, each formatted as:
- **Title** — one-line rationale. *Action:* concrete next step.
Order by impact, not by category.

## What's working
Up to 3 short bullets calling out genuine positives. Skip the section if
nothing qualifies.

Hard rules:
  - Under 350 words total.
  - No filler ("we should consider", "it may be advisable").
  - Be specific: name the rule id, the metric, or the failing test.
  - If a category had zero findings, do not invent one.`;

export interface AuditFindings {
  url: string;
  a11y: AccessibilityIssue[];
  perf: PerformanceMetrics;
  consoleErrors: ConsoleError[];
  testResults: TestResult[];
  /** Optional pre-formatted markdown for security / SEO if available. */
  securityNotes?: string;
  seoNotes?: string;
}

export async function summarizeAudit(findings: AuditFindings): Promise<string> {
  const a11yCounts = {
    critical: findings.a11y.filter((i) => i.impact === "critical").length,
    serious: findings.a11y.filter((i) => i.impact === "serious").length,
    moderate: findings.a11y.filter((i) => i.impact === "moderate").length,
    minor: findings.a11y.filter((i) => i.impact === "minor").length,
  };
  const errorCount = findings.consoleErrors.filter(
    (e) => e.type === "error",
  ).length;
  const warningCount = findings.consoleErrors.filter(
    (e) => e.type === "warning",
  ).length;
  const failures = findings.testResults.filter((r) => r.status === "fail");
  const warnings = findings.testResults.filter((r) => r.status === "warning");

  const lines: string[] = [];
  lines.push(`URL: ${findings.url}`);
  lines.push("");

  lines.push("### Accessibility (axe-core)");
  lines.push(`Total: ${findings.a11y.length}`);
  lines.push(
    `By impact — critical: ${a11yCounts.critical}, serious: ${a11yCounts.serious}, moderate: ${a11yCounts.moderate}, minor: ${a11yCounts.minor}`,
  );
  if (findings.a11y.length > 0) {
    lines.push("Top findings:");
    findings.a11y.slice(0, 8).forEach((i) => {
      lines.push(`- [${i.impact}] ${i.rule}: ${i.description}`);
    });
  }
  lines.push("");

  lines.push("### Performance (Web Vitals)");
  lines.push(
    `LCP=${fmt(findings.perf.lcp, "ms")}, FCP=${fmt(findings.perf.fcp, "ms")}, CLS=${fmtN(findings.perf.cls, 3)}, TTI=${fmt(findings.perf.tti, "ms")}, INP=${fmt(findings.perf.inp, "ms")}, TTFB=${fmt(findings.perf.ttfb, "ms")}`,
  );
  lines.push("");

  lines.push("### Console");
  lines.push(`errors=${errorCount}, warnings=${warningCount}`);
  if (errorCount > 0) {
    findings.consoleErrors
      .filter((e) => e.type === "error")
      .slice(0, 5)
      .forEach((e) => lines.push(`- ${e.message}`));
  }
  lines.push("");

  lines.push("### Test results");
  lines.push(
    `total=${findings.testResults.length}, failed=${failures.length}, warnings=${warnings.length}`,
  );
  if (failures.length > 0) {
    lines.push("Failures:");
    failures.slice(0, 5).forEach((r) => {
      lines.push(`- [${r.category}] ${r.title}: ${r.description}`);
    });
  }
  lines.push("");

  if (findings.securityNotes) {
    lines.push("### Security");
    lines.push(findings.securityNotes.trim());
    lines.push("");
  }
  if (findings.seoNotes) {
    lines.push("### SEO");
    lines.push(findings.seoNotes.trim());
    lines.push("");
  }

  const { text } = await complete({
    system: SUMMARIZER_SYSTEM,
    userContent: lines.join("\n"),
    maxTokens: 1500,
  });
  return text.trim();
}

function fmt(v: number | null | undefined, unit: string): string {
  return v == null ? "n/a" : `${Math.round(v)}${unit}`;
}
function fmtN(v: number | null | undefined, digits: number): string {
  return v == null ? "n/a" : v.toFixed(digits);
}
