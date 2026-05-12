import { logger } from "../utils/logger.js";
import {
  readRunHistory,
  detectRegressions,
  defaultHistoryPath,
  type RunHistoryEntry,
} from "../utils/run-history.js";

export function getHistoryToolDefinitions() {
  return [
    {
      name: "webmobai_get_run_history",
      description:
        "Return previous WebMobAI run summaries persisted to ~/.webmobai/history.json. Filter by URL to see only runs against the same target. Useful for trend analysis or surfacing recent regressions.",
      inputSchema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description:
              "If provided, only return runs against this URL. Otherwise return all runs.",
          },
          limit: {
            type: "number",
            description: "Maximum entries to return (default 20)",
            default: 20,
          },
        },
      },
    },
    {
      name: "webmobai_check_regressions",
      description:
        "Compare a current run's metrics against the median of recent runs for the same URL and flag deviations. Useful right after a test run to answer 'did this deploy regress LCP / introduce new console errors / etc.?'",
      inputSchema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description: "URL to evaluate regressions for",
          },
          baseline_runs: {
            type: "number",
            description: "How many prior runs form the baseline (default 5)",
            default: 5,
          },
          threshold_pct: {
            type: "number",
            description:
              "Per-metric deviation threshold in percent (default 10). Smaller = more sensitive but more false positives.",
            default: 10,
          },
        },
        required: ["url"],
      },
    },
  ];
}

export async function handleHistoryTool(
  name: string,
  args: Record<string, unknown>,
): Promise<{ content: { type: "text"; text: string }[] }> {
  try {
    switch (name) {
      case "webmobai_get_run_history": {
        const url = args.url as string | undefined;
        const limit = (args.limit as number) ?? 20;
        const all = await readRunHistory();
        const filtered = url ? all.filter((e) => e.url === url) : all;
        const recent = filtered.slice(-limit).reverse();

        if (recent.length === 0) {
          return text(
            `No history found${url ? ` for ${url}` : ""}. History is written to ${defaultHistoryPath()} after each completed run.`,
          );
        }
        let out = `# Run history (${recent.length} entries${url ? ` for ${url}` : ""})\n\n`;
        for (const e of recent) {
          out += `- ${new Date(e.timestamp).toISOString()} — ${e.url}\n`;
          out += `  LCP: ${fmtMetric(e.metrics.lcp, "ms")}, CLS: ${fmtMetric(e.metrics.cls)}, FCP: ${fmtMetric(e.metrics.fcp, "ms")}\n`;
          out += `  tests: ${e.summary.passed}/${e.summary.totalTests} pass; a11y issues: ${e.accessibilityIssueCount}; console errors: ${e.consoleErrorCount}\n`;
        }
        return text(out);
      }

      case "webmobai_check_regressions": {
        const url = args.url as string;
        const baselineRuns = (args.baseline_runs as number) ?? 5;
        const thresholdPct = (args.threshold_pct as number) ?? 10;
        const all = await readRunHistory();
        const forUrl = all.filter((e) => e.url === url);
        if (forUrl.length < 2) {
          return text(
            `Not enough history for ${url} (have ${forUrl.length}, need 2+).`,
          );
        }
        const latest = forUrl[forUrl.length - 1] as RunHistoryEntry;
        const report = detectRegressions(latest, all, {
          baselineRuns,
          thresholdPct,
        });
        const regressions = report.findings.filter((f) => f.severity === "regression");
        const improvements = report.findings.filter((f) => f.severity === "improvement");

        let out = `# Regression check for ${url}\n\n`;
        out += `Baseline: median of last ${report.baselineRuns} runs.\n\n`;
        if (regressions.length > 0) {
          out += `## Regressions (${regressions.length})\n`;
          for (const r of regressions) out += `- ${r.message}\n`;
        } else {
          out += `No regressions detected (threshold ±${thresholdPct}%).\n`;
        }
        if (improvements.length > 0) {
          out += `\n## Improvements (${improvements.length})\n`;
          for (const r of improvements) out += `- ${r.message}\n`;
        }
        return text(out);
      }

      default:
        return text(`Unknown history tool: ${name}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`History tool error (${name}): ${msg}`);
    return text(`Error executing ${name}: ${msg}`);
  }
}

function fmtMetric(value: number | null | undefined, unit = ""): string {
  if (value == null) return "N/A";
  if (unit === "ms") return `${Math.round(value)}ms`;
  return value.toFixed(3);
}

function text(message: string) {
  return { content: [{ type: "text" as const, text: message }] };
}
