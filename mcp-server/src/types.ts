export interface AccessibilityIssue {
  id: string;
  impact: "critical" | "serious" | "moderate" | "minor";
  description: string;
  helpUrl: string;
  nodes: string[];
  rule: string;
}

export interface PerformanceMetrics {
  lcp: number | null;
  fcp: number | null;
  cls: number | null;
  tti: number | null;
  inp: number | null;
  ttfb: number | null;
  domContentLoaded: number | null;
  loadComplete: number | null;
  /**
   * Largest Contentful Paint element fingerprint (when available). Helps a
   * caller answer "what's the biggest thing on the page above the fold?"
   * without re-running an LCP observer themselves.
   */
  lcpElement?: {
    tagName: string;
    id?: string;
    classList?: string;
    src?: string;
    text?: string;
    size?: number;
  } | null;
  /**
   * Cumulative Layout Shift frozen 3s after the load event (Sprint 16). The
   * running `cls` field keeps accumulating across the full session and
   * inflates well past what a user's initial-load experience saw;
   * `clsAtLoad` is the more faithful "did the page jump while loading?"
   * number. Null until the load event has fired plus 3s.
   */
  clsAtLoad?: number | null;
  /**
   * Strict TTI (Sprint 16). Only present when `getPerformanceMetrics` was
   * called with `{ strictTti: true }`. Computed as the start of the first
   * 5-second long-task quiet window after FCP, per Lighthouse's definition
   * (within the limits of what we can observe from inside the page).
   */
  ttiStrict?: number | null;
}

export interface ConsoleError {
  type: "error" | "warning" | "log";
  message: string;
  url: string;
  timestamp: number;
}

export interface TestResult {
  url: string;
  title: string;
  status: "pass" | "fail" | "warning";
  category: string;
  description: string;
  details?: string;
  screenshotId?: string;
}

export interface TestReportData {
  id: string;
  url: string;
  startedAt: number;
  completedAt: number;
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    warnings: number;
  };
  results: TestResult[];
  accessibilityIssues: AccessibilityIssue[];
  performanceMetrics: PerformanceMetrics;
  consoleErrors: ConsoleError[];
  screenshots: string[];
  pagesExplored: string[];
  /**
   * Optional Claude-generated executive summary (Sprint 15). Present only when
   * the auto-test runner had WEBMOBAI_ANTHROPIC_API_KEY set. Markdown.
   */
  aiSummary?: string;
  /** Absolute path to the generated HTML report file (Sprint 16). */
  reportPath?: string;
  /** Absolute path to the generated PDF report file (Sprint 16). */
  pdfPath?: string;
  /**
   * Sprint 17: comparison of this run's metrics + counts to the median of
   * the previous N runs of the same URL. Present whenever the run history
   * holds 2+ prior runs for this URL.
   */
  historicalComparison?: HistoricalComparison;
}

export interface HistoricalComparisonFinding {
  metric: string;
  current: number | null;
  baseline: number | null;
  deltaPct: number | null;
  severity: "regression" | "improvement" | "noise";
  message: string;
}

export interface HistoricalComparison {
  url: string;
  baselineRuns: number;
  findings: HistoricalComparisonFinding[];
}

export interface BrowserState {
  url: string;
  title: string;
  viewport: { width: number; height: number };
  readyState: string;
  consoleErrors: ConsoleError[];
}

export interface WsMessage {
  type: "action" | "action_update" | "screenshot" | "report" | "status";
  data: Record<string, unknown>;
}
