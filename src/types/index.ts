export type SessionStatus = "idle" | "starting" | "running" | "paused" | "completed" | "error";

export type ActionType =
  | "navigate"
  | "click"
  | "type"
  | "scroll"
  | "screenshot"
  | "accessibility"
  | "performance"
  | "visual"
  | "responsive"
  | "explore"
  | "report"
  | "error"
  | "info";

export interface ActionLogEntry {
  id: string;
  timestamp: number;
  type: ActionType;
  description: string;
  details?: string;
  screenshotUrl?: string;
  duration?: number;
  status: "pending" | "running" | "success" | "error";
}

export interface Screenshot {
  id: string;
  timestamp: number;
  url: string;
  path: string;
  description: string;
  viewport: { width: number; height: number };
}

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
  ttfb: number | null;
  domContentLoaded: number | null;
  loadComplete: number | null;
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

export interface TestReport {
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
  screenshots: Screenshot[];
  pagesExplored: string[];
}

export interface SessionConfig {
  url: string;
  viewport: { width: number; height: number };
  credentials?: { username: string; password: string };
  maxPages: number;
  enableVideo: boolean;
  enableA11y: boolean;
  enablePerformance: boolean;
  enableVisualRegression: boolean;
  responsiveBreakpoints: { name: string; width: number; height: number }[];
}

export interface McpServerStatus {
  running: boolean;
  port: number;
  pid: number | null;
}
