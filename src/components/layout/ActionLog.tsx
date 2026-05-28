import { useEffect, useMemo, useRef, useState } from "react";
import {
  Globe,
  MousePointer,
  Type,
  ArrowDown,
  Camera,
  Accessibility,
  Gauge,
  Eye,
  Smartphone,
  Search,
  FileText,
  AlertCircle,
  Info,
  CheckCircle,
  Loader,
  Clock,
  Copy,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useSessionStore } from "@/stores/useSessionStore";
import { toast } from "@/stores/useToastStore";
import { formatTimestamp, formatDuration, copyToClipboard } from "@/lib/utils";
import type { ActionType, ActionLogEntry } from "@/types";

const actionIcons: Record<ActionType, React.ReactNode> = {
  navigate: <Globe className="w-3.5 h-3.5" />,
  click: <MousePointer className="w-3.5 h-3.5" />,
  type: <Type className="w-3.5 h-3.5" />,
  scroll: <ArrowDown className="w-3.5 h-3.5" />,
  screenshot: <Camera className="w-3.5 h-3.5" />,
  accessibility: <Accessibility className="w-3.5 h-3.5" />,
  performance: <Gauge className="w-3.5 h-3.5" />,
  visual: <Eye className="w-3.5 h-3.5" />,
  responsive: <Smartphone className="w-3.5 h-3.5" />,
  explore: <Search className="w-3.5 h-3.5" />,
  report: <FileText className="w-3.5 h-3.5" />,
  error: <AlertCircle className="w-3.5 h-3.5" />,
  info: <Info className="w-3.5 h-3.5" />,
};

const statusIcons = {
  pending: <Clock className="w-3 h-3 text-muted-foreground" />,
  running: <Loader className="w-3 h-3 text-primary animate-spin" />,
  success: <CheckCircle className="w-3 h-3 text-success" />,
  error: <AlertCircle className="w-3 h-3 text-destructive" />,
};

type StatusFilter = "all" | "running" | "success" | "error";

const statusFilters: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "running", label: "Running" },
  { id: "success", label: "Success" },
  { id: "error", label: "Errors" },
];

export function ActionLog() {
  const { actions } = useSessionStore();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return actions.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (
        q &&
        !a.description.toLowerCase().includes(q) &&
        !(a.details ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [actions, statusFilter, query]);

  // Only auto-scroll while viewing the unfiltered, live log.
  const isLiveView = statusFilter === "all" && query.trim() === "";
  useEffect(() => {
    if (isLiveView) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [filtered.length, isLiveView]);

  const copyLog = async () => {
    const payload = filtered.map((a: ActionLogEntry) => ({
      timestamp: new Date(a.timestamp).toISOString(),
      type: a.type,
      status: a.status,
      description: a.description,
      details: a.details,
      duration: a.duration,
    }));
    const ok = await copyToClipboard(JSON.stringify(payload, null, 2));
    toast({
      title: ok ? `Copied ${payload.length} entries` : "Copy failed",
      description: ok ? "Action log copied as JSON" : undefined,
      variant: ok ? "success" : "destructive",
    });
  };

  if (actions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        <div className="text-center">
          <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No actions yet</p>
          <p className="text-xs mt-1">Enter a URL and click Test to begin</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Filter / export bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card/40">
        <div className="flex items-center gap-1">
          {statusFilters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`px-2 py-0.5 rounded-md text-xs border transition-colors cursor-pointer ${
                statusFilter === f.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-transparent text-muted-foreground hover:bg-accent"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter actions…"
            className="w-full h-7 pl-7 pr-2 rounded-md border border-input bg-transparent text-xs focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <button
          type="button"
          onClick={copyLog}
          title="Copy filtered log as JSON"
          className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border border-border text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
        >
          <Copy className="w-3 h-3" />
          Copy
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs">
          No actions match this filter
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-1">
            {filtered.map((action) => (
              <div
                key={action.id}
                className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-accent/50 transition-colors animate-slide-in text-sm"
              >
                {/* Status indicator */}
                <div className="mt-0.5 shrink-0">{statusIcons[action.status]}</div>

                {/* Action icon */}
                <div className="mt-0.5 shrink-0 text-muted-foreground">
                  {actionIcons[action.type]}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-foreground leading-snug">{action.description}</p>
                  {action.details && (
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                      {action.details}
                    </p>
                  )}
                </div>

                {/* Metadata */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {action.duration != null && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {formatDuration(action.duration)}
                    </Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {formatTimestamp(action.timestamp)}
                  </span>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
