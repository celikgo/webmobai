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
