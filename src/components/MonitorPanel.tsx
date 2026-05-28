import { useMemo, useState } from "react";
import { RefreshCw, Monitor as MonitorIcon, Activity } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useMonitorHistory, type RunHistoryEntry } from "@/hooks/useMonitorHistory";
import { formatTimestamp, formatDuration } from "@/lib/utils";

const SERIES: {
  key: keyof RunHistoryEntry["metrics"];
  label: string;
  unit: string;
  color: string;
}[] = [
  { key: "lcp", label: "LCP", unit: "ms", color: "var(--primary)" },
  { key: "fcp", label: "FCP", unit: "ms", color: "#60a5fa" },
  { key: "cls", label: "CLS", unit: "", color: "#fb923c" },
  { key: "ttfb", label: "TTFB", unit: "ms", color: "#a78bfa" },
];

interface SparklineProps {
  values: (number | null)[];
  label: string;
  unit: string;
  color: string;
  format?: (n: number) => string;
}

// Tiny inline-SVG sparkline. Renders min / current / max in a small chart with
// no axes, suitable for a 4-up grid of metric trends.
function Sparkline({
  values,
  label,
  unit,
  color,
  format = (n) => `${Math.round(n)}${unit}`,
}: SparklineProps) {
  const valid = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v != null);
  const W = 240;
  const H = 56;
  const pad = 4;
  const empty = (
    <div className="h-full flex items-center justify-center text-[10px] text-muted-foreground">
      no data
    </div>
  );

  if (valid.length < 2) {
    return (
      <div className="rounded-md border border-border bg-card p-3 h-[100px] flex flex-col">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-xs font-semibold">{label}</span>
        </div>
        <div className="flex-1">{empty}</div>
      </div>
    );
  }

  const nums = valid.map((p) => p.v);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;
  const xStep = values.length > 1 ? (W - pad * 2) / (values.length - 1) : 0;
  const points = valid.map((p) => {
    const x = pad + p.i * xStep;
    const y = pad + (H - pad * 2) * (1 - (p.v - min) / range);
    return { x, y };
  });
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const last = nums[nums.length - 1]!;

  return (
    <div className="rounded-md border border-border bg-card p-3 h-[100px] flex flex-col">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-semibold">{label}</span>
        <span className="text-xs font-mono tabular-nums" style={{ color }}>
          {format(last)}
        </span>
      </div>
      <div className="flex-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
          <path d={path} fill="none" stroke={color} strokeWidth={1.5} />
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={1.6} fill={color} />
          ))}
        </svg>
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground tabular-nums">
        <span>min {format(min)}</span>
        <span>max {format(max)}</span>
      </div>
    </div>
  );
}

export function MonitorPanel() {
  const { entries, urls, loading, error, refresh } = useMonitorHistory();
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);

  // Default to the URL with the most recent run.
  const effectiveUrl = useMemo(() => {
    if (selectedUrl && urls.includes(selectedUrl)) return selectedUrl;
    if (entries.length === 0) return null;
    const lastByUrl = new Map<string, number>();
    for (const e of entries) {
      lastByUrl.set(e.url, Math.max(lastByUrl.get(e.url) ?? 0, e.timestamp));
    }
    return [...lastByUrl.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [entries, urls, selectedUrl]);

  const forUrl = useMemo(() => {
    if (!effectiveUrl) return [];
    return entries
      .filter((e) => e.url === effectiveUrl)
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [entries, effectiveUrl]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Loading history…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-destructive text-sm">
        Failed to read history: {error}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        <div className="text-center">
          <MonitorIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No monitored runs yet</p>
          <p className="text-xs mt-1">
            Run a test or start <code>webmobai-monitor</code> to populate
            history.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card/40">
        <Activity className="w-4 h-4 text-primary" />
        <span className="text-xs font-semibold">Trend</span>
        <select
          value={effectiveUrl ?? ""}
          onChange={(e) => setSelectedUrl(e.target.value)}
          className="text-xs bg-transparent border border-input rounded-md px-2 py-1 max-w-[60%] truncate"
        >
          {urls.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <span className="text-[10px] text-muted-foreground ml-2 tabular-nums">
          {forUrl.length} run{forUrl.length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={refresh}
          title="Reload history.json"
          className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border border-border text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Sparkline grid */}
          <div className="grid grid-cols-2 gap-3">
            {SERIES.map((s) => (
              <Sparkline
                key={s.key}
                label={s.label}
                unit={s.unit}
                color={s.color}
                values={forUrl.map((e) => e.metrics[s.key])}
                format={
                  s.key === "cls"
                    ? (n) => n.toFixed(3)
                    : (n) => `${Math.round(n)}${s.unit}`
                }
              />
            ))}
            <Sparkline
              label="Console errors"
              unit=""
              color="#f87171"
              values={forUrl.map((e) => e.consoleErrorCount)}
              format={(n) => Math.round(n).toString()}
            />
            <Sparkline
              label="A11y issues"
              unit=""
              color="#facc15"
              values={forUrl.map((e) => e.accessibilityIssueCount)}
              format={(n) => Math.round(n).toString()}
            />
          </div>

          {/* Run table */}
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-3 py-2">When</th>
                  <th className="text-right font-medium px-3 py-2">LCP</th>
                  <th className="text-right font-medium px-3 py-2">FCP</th>
                  <th className="text-right font-medium px-3 py-2">CLS</th>
                  <th className="text-right font-medium px-3 py-2">Errors</th>
                  <th className="text-right font-medium px-3 py-2">Pass</th>
                  <th className="text-right font-medium px-3 py-2">Took</th>
                </tr>
              </thead>
              <tbody>
                {[...forUrl].reverse().slice(0, 30).map((e) => {
                  const passRate =
                    e.summary.totalTests > 0
                      ? Math.round(
                          (e.summary.passed / e.summary.totalTests) * 100,
                        )
                      : 0;
                  return (
                    <tr key={e.id} className="border-t border-border/60">
                      <td className="px-3 py-1.5">
                        <div>{new Date(e.timestamp).toLocaleDateString()}</div>
                        <div className="text-[10px] text-muted-foreground tabular-nums">
                          {formatTimestamp(e.timestamp)}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {e.metrics.lcp != null ? Math.round(e.metrics.lcp) + "ms" : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {e.metrics.fcp != null ? Math.round(e.metrics.fcp) + "ms" : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {e.metrics.cls != null ? e.metrics.cls.toFixed(3) : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {e.consoleErrorCount}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        <Badge
                          variant={
                            passRate >= 80
                              ? "success"
                              : passRate >= 50
                                ? "warning"
                                : "destructive"
                          }
                          className="text-[10px] px-1 py-0"
                        >
                          {passRate}%
                        </Badge>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                        {formatDuration(e.durationMs)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
