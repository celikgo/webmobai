import { FileText, CheckCircle, XCircle, AlertTriangle, BarChart3 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useSessionStore } from "@/stores/useSessionStore";
import { formatDuration } from "@/lib/utils";

export function TestReport() {
  const { report } = useSessionStore();

  if (!report) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        <div className="text-center">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No report generated yet</p>
          <p className="text-xs mt-1">Reports are generated after testing completes</p>
        </div>
      </div>
    );
  }

  const passRate =
    report.summary.totalTests > 0
      ? Math.round((report.summary.passed / report.summary.totalTests) * 100)
      : 0;

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-4">
        {/* Summary Card */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Test Summary
            </h3>
            <Badge variant={passRate >= 80 ? "success" : passRate >= 50 ? "warning" : "destructive"}>
              {passRate}% Pass Rate
            </Badge>
          </div>

          <Progress value={passRate} className="mb-3" />

          <div className="grid grid-cols-4 gap-3 text-center">
            <div className="rounded-md bg-muted p-2">
              <p className="text-lg font-bold">{report.summary.totalTests}</p>
              <p className="text-[10px] text-muted-foreground">Total</p>
            </div>
            <div className="rounded-md bg-success/10 p-2">
              <p className="text-lg font-bold text-success">{report.summary.passed}</p>
              <p className="text-[10px] text-muted-foreground">Passed</p>
            </div>
            <div className="rounded-md bg-destructive/10 p-2">
              <p className="text-lg font-bold text-destructive">{report.summary.failed}</p>
              <p className="text-[10px] text-muted-foreground">Failed</p>
            </div>
            <div className="rounded-md bg-warning/10 p-2">
              <p className="text-lg font-bold text-warning">{report.summary.warnings}</p>
              <p className="text-[10px] text-muted-foreground">Warnings</p>
            </div>
          </div>

          <div className="mt-3 text-xs text-muted-foreground">
            Duration: {formatDuration(report.completedAt - report.startedAt)} | Pages explored:{" "}
            {report.pagesExplored.length}
          </div>
        </div>

        {/* Test Results */}
        <div className="space-y-1">
          <h3 className="font-semibold text-sm px-1 mb-2">Test Results</h3>
          {report.results.map((result, i) => (
            <div
              key={i}
              className="flex items-start gap-2 px-3 py-2 rounded-md border border-border bg-card"
            >
              {result.status === "pass" ? (
                <CheckCircle className="w-4 h-4 text-success shrink-0 mt-0.5" />
              ) : result.status === "fail" ? (
                <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{result.title}</p>
                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                    {result.category}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {result.description}
                </p>
                {result.details && (
                  <p className="text-xs text-muted-foreground/80 mt-1 font-mono bg-muted rounded px-2 py-1">
                    {result.details}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}
