import { useEffect, useRef } from "react";
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
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useSessionStore } from "@/stores/useSessionStore";
import { formatTimestamp, formatDuration } from "@/lib/utils";
import type { ActionType } from "@/types";

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

export function ActionLog() {
  const { actions } = useSessionStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [actions]);

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
    <ScrollArea className="flex-1">
      <div className="p-3 space-y-1">
        {actions.map((action) => (
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
  );
}
