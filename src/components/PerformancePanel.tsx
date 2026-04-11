import { Gauge, Clock, LayoutDashboard, Move } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useSessionStore } from "@/stores/useSessionStore";
import { formatDuration } from "@/lib/utils";

function metricRating(
  name: string,
  value: number | null,
): "good" | "needs-improvement" | "poor" {
  if (value == null) return "needs-improvement";
  const thresholds: Record<string, [number, number]> = {
    lcp: [2500, 4000],
    fcp: [1800, 3000],
    cls: [0.1, 0.25],
    tti: [3800, 7300],
    ttfb: [800, 1800],
  };
  const t = thresholds[name];
  if (!t) return "needs-improvement";
  if (value <= t[0]) return "good";
  if (value <= t[1]) return "needs-improvement";
  return "poor";
}

const ratingColors = {
  good: "text-success",
  "needs-improvement": "text-warning",
  poor: "text-destructive",
};

const ratingBadges = {
  good: "success" as const,
  "needs-improvement": "warning" as const,
  poor: "destructive" as const,
};

interface MetricCardProps {
  label: string;
  shortLabel: string;
  value: number | null;
  unit: string;
  icon: React.ReactNode;
}

function MetricCard({ label, shortLabel, value, unit, icon }: MetricCardProps) {
  const rating = metricRating(shortLabel.toLowerCase(), value);
  const displayValue =
    value == null
      ? "N/A"
      : unit === "ms"
        ? formatDuration(value)
        : value.toFixed(3);

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          <span className="text-xs font-medium">{shortLabel}</span>
        </div>
        {value != null && (
          <Badge variant={ratingBadges[rating]} className="text-[10px] px-1.5 py-0">
            {rating === "good" ? "Good" : rating === "needs-improvement" ? "Improve" : "Poor"}
          </Badge>
        )}
      </div>
      <p className={`text-xl font-bold ${value != null ? ratingColors[rating] : "text-muted-foreground"}`}>
        {displayValue}
      </p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

export function PerformancePanel() {
  const { report } = useSessionStore();
  const metrics = report?.performanceMetrics;

  if (!metrics) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        <div className="text-center">
          <Gauge className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No performance data</p>
          <p className="text-xs mt-1">Run a test to collect Web Vitals</p>
        </div>
      </div>
    );
  }

  // Rough performance score
  const scores = [
    metricRating("lcp", metrics.lcp),
    metricRating("fcp", metrics.fcp),
    metricRating("cls", metrics.cls),
    metricRating("tti", metrics.tti),
    metricRating("ttfb", metrics.ttfb),
  ];
  const scoreNum =
    scores.reduce(
      (acc, s) => acc + (s === "good" ? 100 : s === "needs-improvement" ? 50 : 0),
      0,
    ) / scores.length;

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-4">
        {/* Score overview */}
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <p className="text-3xl font-bold">{Math.round(scoreNum)}</p>
          <Progress value={scoreNum} className="mt-2 mb-1" />
          <p className="text-xs text-muted-foreground">Performance Score</p>
        </div>

        {/* Core Web Vitals */}
        <div>
          <h3 className="text-sm font-semibold mb-2">Core Web Vitals</h3>
          <div className="grid grid-cols-2 gap-2">
            <MetricCard
              label="Largest Contentful Paint"
              shortLabel="LCP"
              value={metrics.lcp}
              unit="ms"
              icon={<LayoutDashboard className="w-3.5 h-3.5" />}
            />
            <MetricCard
              label="First Contentful Paint"
              shortLabel="FCP"
              value={metrics.fcp}
              unit="ms"
              icon={<Clock className="w-3.5 h-3.5" />}
            />
            <MetricCard
              label="Cumulative Layout Shift"
              shortLabel="CLS"
              value={metrics.cls}
              unit=""
              icon={<Move className="w-3.5 h-3.5" />}
            />
            <MetricCard
              label="Time to Interactive"
              shortLabel="TTI"
              value={metrics.tti}
              unit="ms"
              icon={<Gauge className="w-3.5 h-3.5" />}
            />
          </div>
        </div>

        {/* Additional timing */}
        <div>
          <h3 className="text-sm font-semibold mb-2">Additional Timing</h3>
          <div className="grid grid-cols-2 gap-2">
            <MetricCard
              label="Time to First Byte"
              shortLabel="TTFB"
              value={metrics.ttfb}
              unit="ms"
              icon={<Clock className="w-3.5 h-3.5" />}
            />
            <MetricCard
              label="DOM Content Loaded"
              shortLabel="DCL"
              value={metrics.domContentLoaded}
              unit="ms"
              icon={<LayoutDashboard className="w-3.5 h-3.5" />}
            />
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
