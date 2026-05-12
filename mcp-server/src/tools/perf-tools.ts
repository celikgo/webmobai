import type { BrowserManager } from "../playwright/browser-manager.js";
import { PageAnalyzer } from "../playwright/page-analyzer.js";
import { logger } from "../utils/logger.js";

/**
 * Performance-control tools beyond what's in reporting-tools.ts. These let
 * the caller throttle the network/CPU before measuring (so Web Vitals
 * reflect a realistic mobile user, not a fiber connection) and run multi-
 * sample measurements where single-run variance would lie.
 */

export function getPerfToolDefinitions() {
  return [
    {
      name: "webmobai_set_network_throttle",
      description:
        "Apply Chrome DevTools-style network throttling to the page (Chromium only). Use before measurement to approximate mobile users. Pass null to reset.",
      inputSchema: {
        type: "object" as const,
        properties: {
          preset: {
            type: ["string", "null"],
            enum: ["slow-3g", "fast-3g", "slow-4g", "offline", null],
            description:
              "Network preset: slow-3g (500Kbps/2s), fast-3g (1.5Mbps/562ms), slow-4g (4Mbps/400ms), offline. null to clear.",
          },
        },
        required: ["preset"],
      },
    },
    {
      name: "webmobai_set_cpu_throttle",
      description:
        "Slow down JavaScript execution by a multiplier. 4 mirrors Lighthouse's mobile profile (1/4 CPU); 1 (or null) clears. Chromium only.",
      inputSchema: {
        type: "object" as const,
        properties: {
          slowdown: {
            type: ["number", "null"],
            description:
              "Slowdown multiplier (1 = no throttle, 4 = quarter speed). null to clear.",
          },
        },
        required: ["slowdown"],
      },
    },
    {
      name: "webmobai_run_perf_multi",
      description:
        "Run N performance measurements against a URL and aggregate. Web Vitals have ±15-20% single-run variance; median over multiple runs is what you actually want to track. Returns median + p95 + min + max per metric.",
      inputSchema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description: "URL to measure",
          },
          runs: {
            type: "number",
            description: "Number of runs (default 3, max 10)",
            default: 3,
          },
        },
        required: ["url"],
      },
    },
  ];
}

export async function handlePerfTool(
  name: string,
  args: Record<string, unknown>,
  browserManager: BrowserManager,
): Promise<{ content: { type: "text"; text: string }[] }> {
  try {
    switch (name) {
      case "webmobai_set_network_throttle": {
        const preset = args.preset as
          | "slow-3g"
          | "fast-3g"
          | "slow-4g"
          | "offline"
          | null;
        await browserManager.setNetworkThrottle(preset);
        return text(
          preset
            ? `Network throttled to "${preset}"`
            : "Network throttle cleared",
        );
      }

      case "webmobai_set_cpu_throttle": {
        const slowdown = args.slowdown as number | null;
        await browserManager.setCpuThrottle(slowdown);
        return text(
          slowdown && slowdown !== 1
            ? `CPU throttled ${slowdown}x slower`
            : "CPU throttle cleared",
        );
      }

      case "webmobai_run_perf_multi": {
        const url = args.url as string;
        const requested = (args.runs as number) ?? 3;
        const runs = Math.max(1, Math.min(10, requested));
        const samples: Record<string, number[]> = {
          lcp: [],
          fcp: [],
          cls: [],
          tti: [],
          inp: [],
          ttfb: [],
        };
        for (let i = 0; i < runs; i++) {
          await browserManager.navigate(url);
          const analyzer = new PageAnalyzer(browserManager.page, browserManager);
          const m = await analyzer.getPerformanceMetrics();
          if (m.lcp != null) samples.lcp!.push(m.lcp);
          if (m.fcp != null) samples.fcp!.push(m.fcp);
          if (m.cls != null) samples.cls!.push(m.cls);
          if (m.tti != null) samples.tti!.push(m.tti);
          if (m.inp != null) samples.inp!.push(m.inp);
          if (m.ttfb != null) samples.ttfb!.push(m.ttfb);
        }

        let out = `# Performance — ${runs} runs against ${url}\n\n`;
        out += `| Metric | Median | p95 | Min | Max | n |\n`;
        out += `|--------|--------|-----|-----|-----|---|\n`;
        for (const [metric, arr] of Object.entries(samples)) {
          if (arr.length === 0) {
            out += `| ${metric.toUpperCase()} | N/A | N/A | N/A | N/A | 0 |\n`;
            continue;
          }
          const stats = computeStats(arr);
          const fmt = metric === "cls" ? (n: number) => n.toFixed(3) : (n: number) => `${Math.round(n)}ms`;
          out += `| ${metric.toUpperCase()} | ${fmt(stats.median)} | ${fmt(stats.p95)} | ${fmt(stats.min)} | ${fmt(stats.max)} | ${arr.length} |\n`;
        }
        return text(out);
      }

      default:
        return text(`Unknown perf tool: ${name}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Perf tool error (${name}): ${msg}`);
    return text(`Error executing ${name}: ${msg}`);
  }
}

export function computeStats(values: number[]): {
  median: number;
  p95: number;
  min: number;
  max: number;
} {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return { median: 0, p95: 0, min: 0, max: 0 };
  const mid = Math.floor(n / 2);
  const median =
    n % 2 === 0
      ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
      : (sorted[mid] ?? 0);
  // Nearest-rank p95 (matches what Lighthouse and most CI dashboards use).
  const p95Index = Math.min(n - 1, Math.ceil(0.95 * n) - 1);
  const p95 = sorted[Math.max(0, p95Index)] ?? sorted[n - 1] ?? 0;
  return {
    median,
    p95,
    min: sorted[0] ?? 0,
    max: sorted[n - 1] ?? 0,
  };
}

function text(message: string) {
  return { content: [{ type: "text" as const, text: message }] };
}
