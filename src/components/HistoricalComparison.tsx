import { useEffect, useRef } from "react";
import { TrendingDown, TrendingUp, Minus, History } from "lucide-react";
import type { HistoricalComparison as Comparison } from "@/types";
import { toast } from "@/stores/useToastStore";

const severityStyles = {
  regression: "bg-destructive/20 text-destructive border-destructive/40",
  improvement: "bg-success/20 text-success border-success/40",
  noise: "bg-muted text-muted-foreground border-border",
} as const;

const severityIcon = {
  regression: <TrendingUp className="w-3 h-3" />,
  improvement: <TrendingDown className="w-3 h-3" />,
  noise: <Minus className="w-3 h-3" />,
} as const;

function formatNum(v: number | null): string {
  if (v == null) return "—";
  if (Math.abs(v) >= 100) return Math.round(v).toString();
  if (Math.abs(v) >= 1) return v.toFixed(1);
  return v.toFixed(3);
}

interface Props {
  comparison: Comparison;
}

/**
 * Renders the this-run-vs-historical-median table. Also fires a single toast
 * the first time it's mounted for a comparison that contains real regressions
 * (Sprint 17, task 17.3 — keeps the alert lightweight without pulling in the
 * Tauri notification plugin).
 */
export function HistoricalComparison({ comparison }: Props) {
  const regressions = comparison.findings.filter(
    (f) => f.severity === "regression",
  );

  // Toast once per mounted comparison key. The URL+baselineRuns combo changes
  // only when a new run finishes, so this avoids spamming on every re-render.
  const alertKey = `${comparison.url}::${comparison.baselineRuns}::${regressions.length}`;
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (regressions.length === 0) return;
    if (lastKey.current === alertKey) return;
    lastKey.current = alertKey;
    toast({
      title: `${regressions.length} regression${regressions.length === 1 ? "" : "s"} vs baseline`,
      description: regressions
        .slice(0, 2)
        .map((r) => r.message)
        .join("  •  "),
      variant: "destructive",
      duration: 8000,
    });
  }, [alertKey, regressions]);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <History className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm">vs historical baseline</h3>
        <span className="text-[11px] text-muted-foreground ml-auto">
          median of last {comparison.baselineRuns} run
          {comparison.baselineRuns === 1 ? "" : "s"}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="font-medium py-1">Metric</th>
              <th className="font-medium py-1 text-right">Current</th>
              <th className="font-medium py-1 text-right">Baseline</th>
              <th className="font-medium py-1 text-right">Δ</th>
              <th className="font-medium py-1 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {comparison.findings.map((f) => (
              <tr key={f.metric} className="border-t border-border/60">
                <td className="py-1 font-mono text-[11px]">{f.metric}</td>
                <td className="py-1 text-right tabular-nums">
                  {formatNum(f.current)}
                </td>
                <td className="py-1 text-right tabular-nums text-muted-foreground">
                  {formatNum(f.baseline)}
                </td>
                <td className="py-1 text-right tabular-nums">
                  {f.deltaPct == null
                    ? "—"
                    : `${f.deltaPct > 0 ? "+" : ""}${f.deltaPct.toFixed(1)}%`}
                </td>
                <td className="py-1 text-right">
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] ${severityStyles[f.severity]}`}
                  >
                    {severityIcon[f.severity]}
                    {f.severity}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
