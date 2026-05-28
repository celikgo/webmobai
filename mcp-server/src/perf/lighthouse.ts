/**
 * Optional Google Lighthouse integration (Sprint 16). Runs the upstream
 * Lighthouse engine against a URL and returns the four official category
 * scores (Performance, Accessibility, Best Practices, SEO) plus the lowest-
 * scoring audits so the caller knows what to fix.
 *
 * `lighthouse` and `chrome-launcher` are declared as **optionalDependencies**
 * in package.json. They are dynamically imported at first use — if either is
 * missing (e.g. `npm install --no-optional`), we throw a typed
 * `LighthouseUnavailableError` with install instructions instead of crashing.
 *
 * Lighthouse drives its own headless Chrome through chrome-launcher, so the
 * caller's BrowserManager session is untouched.
 */

import { logger } from "../utils/logger.js";

export class LighthouseUnavailableError extends Error {
  constructor(detail?: string) {
    super(
      `Lighthouse is not installed (or failed to load). Install with:\n  npm install lighthouse chrome-launcher\nThen retry. ` +
        (detail ? `Underlying error: ${detail}` : ""),
    );
    this.name = "LighthouseUnavailableError";
  }
}

export interface LighthouseAuditFinding {
  id: string;
  title: string;
  score: number;
}

export interface LighthouseResult {
  url: string;
  fetchedUrl: string;
  scores: {
    performance: number | null;
    accessibility: number | null;
    bestPractices: number | null;
    seo: number | null;
  };
  /** Lowest-scoring audits across categories, ranked worst first. */
  lowestAudits: LighthouseAuditFinding[];
}

interface LighthouseModule {
  default?: (url: string, options: Record<string, unknown>) => Promise<{
    lhr?: LighthouseReport;
  }>;
}
interface LighthouseReport {
  finalUrl?: string;
  requestedUrl?: string;
  categories?: Record<string, { score?: number | null }>;
  audits?: Record<string, { title?: string; score?: number | null }>;
}
interface ChromeInstance {
  port: number;
  kill: () => Promise<void>;
}
interface ChromeLauncherModule {
  launch: (opts: Record<string, unknown>) => Promise<ChromeInstance>;
}

async function loadModules(): Promise<{
  lighthouse: NonNullable<LighthouseModule["default"]>;
  chromeLauncher: ChromeLauncherModule;
}> {
  try {
    // `lighthouse` and `chrome-launcher` aren't statically known to TS — they
    // are optional. The dynamic import resolves at runtime; missing packages
    // throw and we surface a helpful message.
    // @ts-ignore optional dependency, resolved at runtime
    const lighthouseModule: LighthouseModule = await import("lighthouse");
    // @ts-ignore optional dependency, resolved at runtime
    const chromeLauncher: ChromeLauncherModule = await import("chrome-launcher");
    const lighthouseFn = lighthouseModule.default;
    if (!lighthouseFn) {
      throw new LighthouseUnavailableError("lighthouse module has no default export");
    }
    return { lighthouse: lighthouseFn, chromeLauncher };
  } catch (err) {
    if (err instanceof LighthouseUnavailableError) throw err;
    throw new LighthouseUnavailableError(
      err instanceof Error ? err.message : String(err),
    );
  }
}

export async function runLighthouse(url: string): Promise<LighthouseResult> {
  const { lighthouse, chromeLauncher } = await loadModules();
  const chrome = await chromeLauncher.launch({
    chromeFlags: ["--headless", "--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    logger.info(`Running Lighthouse on ${url} via chrome port ${chrome.port}`);
    const result = await lighthouse(url, {
      port: chrome.port,
      output: "json",
      logLevel: "error",
    });
    if (!result?.lhr) {
      throw new Error("Lighthouse returned no result");
    }
    const lhr = result.lhr;
    const lowestAudits: LighthouseAuditFinding[] = Object.entries(
      lhr.audits ?? {},
    )
      .filter(
        (entry): entry is [string, { title?: string; score: number }] => {
          const [, a] = entry;
          return (
            a != null && typeof a.score === "number" && a.score >= 0 && a.score < 1
          );
        },
      )
      .map(([id, a]) => ({
        id,
        title: a.title ?? id,
        score: a.score,
      }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 8);

    return {
      url,
      fetchedUrl: lhr.finalUrl ?? lhr.requestedUrl ?? url,
      scores: {
        performance: lhr.categories?.performance?.score ?? null,
        accessibility: lhr.categories?.accessibility?.score ?? null,
        bestPractices: lhr.categories?.["best-practices"]?.score ?? null,
        seo: lhr.categories?.seo?.score ?? null,
      },
      lowestAudits,
    };
  } finally {
    await chrome.kill().catch(() => {});
  }
}

/** Format a Lighthouse result as a human-readable markdown report. */
export function formatLighthouseMarkdown(result: LighthouseResult): string {
  const lines: string[] = [];
  lines.push(`# Lighthouse — ${result.fetchedUrl}`);
  lines.push("");
  lines.push("## Scores (0-100, higher is better)");
  lines.push("");
  lines.push("| Category | Score | Rating |");
  lines.push("|---|---|---|");
  lines.push(scoreRow("Performance", result.scores.performance));
  lines.push(scoreRow("Accessibility", result.scores.accessibility));
  lines.push(scoreRow("Best Practices", result.scores.bestPractices));
  lines.push(scoreRow("SEO", result.scores.seo));
  lines.push("");
  if (result.lowestAudits.length > 0) {
    lines.push("## Lowest-scoring audits");
    result.lowestAudits.forEach((a) => {
      lines.push(`- [${(a.score * 100).toFixed(0)}] ${a.title} (\`${a.id}\`)`);
    });
  }
  lines.push("");
  lines.push(
    "_(Lighthouse complements WebMobAI's per-axis tools; it does not replace them.)_",
  );
  return lines.join("\n");
}

function scoreRow(label: string, score: number | null): string {
  if (score == null) return `| ${label} | n/a | — |`;
  const pct = Math.round(score * 100);
  const rating = pct >= 90 ? "Good" : pct >= 50 ? "Needs Improvement" : "Poor";
  return `| ${label} | ${pct} | ${rating} |`;
}
