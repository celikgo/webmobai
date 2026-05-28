import {
  Accessibility,
  AlertCircle,
  AlertTriangle,
  Info,
  ExternalLink,
  Copy,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useSessionStore } from "@/stores/useSessionStore";
import { toast } from "@/stores/useToastStore";
import { copyToClipboard, openExternal } from "@/lib/utils";

const impactColors = {
  critical: "destructive",
  serious: "destructive",
  moderate: "warning",
  minor: "secondary",
} as const;

const impactIcons = {
  critical: <AlertCircle className="w-4 h-4" />,
  serious: <AlertCircle className="w-4 h-4" />,
  moderate: <AlertTriangle className="w-4 h-4" />,
  minor: <Info className="w-4 h-4" />,
};

export function AccessibilityPanel() {
  const { report } = useSessionStore();
  const issues = report?.accessibilityIssues ?? [];

  if (issues.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        <div className="text-center">
          <Accessibility className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No accessibility data</p>
          <p className="text-xs mt-1">
            {report ? "No issues found — great!" : "Run a test to audit accessibility"}
          </p>
        </div>
      </div>
    );
  }

  const grouped = {
    critical: issues.filter((i) => i.impact === "critical"),
    serious: issues.filter((i) => i.impact === "serious"),
    moderate: issues.filter((i) => i.impact === "moderate"),
    minor: issues.filter((i) => i.impact === "minor"),
  };

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-4 gap-2">
          {(["critical", "serious", "moderate", "minor"] as const).map((level) => (
            <div
              key={level}
              className="rounded-md border border-border bg-card p-2 text-center"
            >
              <p className="text-lg font-bold">{grouped[level].length}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{level}</p>
            </div>
          ))}
        </div>

        {/* Issues list */}
        {(["critical", "serious", "moderate", "minor"] as const).map(
          (level) =>
            grouped[level].length > 0 && (
              <div key={level}>
                <h3 className="font-semibold text-sm capitalize mb-2 flex items-center gap-1.5">
                  {impactIcons[level]}
                  {level} ({grouped[level].length})
                </h3>
                <div className="space-y-1">
                  {grouped[level].map((issue) => (
                    <div
                      key={issue.id}
                      className="px-3 py-2 rounded-md border border-border bg-card"
                    >
                      <div className="flex items-start gap-2">
                        <Badge variant={impactColors[level]} className="text-[10px] shrink-0 mt-0.5">
                          {issue.rule}
                        </Badge>
                        <p className="text-sm flex-1">{issue.description}</p>
                        {issue.helpUrl && (
                          <button
                            type="button"
                            title="Learn more (WCAG reference)"
                            onClick={() => openExternal(issue.helpUrl)}
                            className="shrink-0 mt-0.5 inline-flex items-center gap-1 text-[11px] text-primary hover:underline cursor-pointer"
                          >
                            Learn more
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      {issue.nodes.length > 0 && (
                        <div className="mt-1.5 text-xs font-mono text-muted-foreground bg-muted rounded px-2 py-1 overflow-x-auto space-y-0.5">
                          {issue.nodes.slice(0, 3).map((node, i) => (
                            <div
                              key={i}
                              className="group/node flex items-center gap-1.5"
                            >
                              <span className="truncate flex-1">{node}</span>
                              <button
                                type="button"
                                title="Copy selector"
                                onClick={async () => {
                                  const ok = await copyToClipboard(node);
                                  toast({
                                    title: ok
                                      ? "Selector copied"
                                      : "Copy failed",
                                    variant: ok ? "success" : "destructive",
                                  });
                                }}
                                className="shrink-0 opacity-0 group-hover/node:opacity-100 transition-opacity text-muted-foreground hover:text-foreground cursor-pointer"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                          {issue.nodes.length > 3 && (
                            <div className="text-muted-foreground/60">
                              +{issue.nodes.length - 3} more
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ),
        )}
      </div>
    </ScrollArea>
  );
}
