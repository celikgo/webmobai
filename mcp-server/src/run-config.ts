/**
 * Run-time configuration for the auto-test runner. Separated from
 * auto-test.ts so callers (tests, the MCP server, other tools) can import
 * the parser without triggering the CLI's top-level arg validation.
 */

export interface RunConfig {
  viewport: { width: number; height: number };
  credentials?: { username: string; password: string };
  maxPages: number;
  enableVideo: boolean;
  enableA11y: boolean;
  enablePerformance: boolean;
  enableVisualRegression: boolean;
  responsiveBreakpoints: { name: string; width: number; height: number }[];
}

export const DEFAULT_RUN_CONFIG: RunConfig = {
  viewport: { width: 1280, height: 720 },
  maxPages: 5,
  enableVideo: true,
  enableA11y: true,
  enablePerformance: true,
  enableVisualRegression: false,
  responsiveBreakpoints: [
    { name: "Mobile", width: 375, height: 812 },
    { name: "Tablet", width: 768, height: 1024 },
    { name: "Desktop", width: 1280, height: 720 },
  ],
};

/**
 * Parse a JSON config string passed by the Tauri-side caller. Unknown fields
 * are preserved (in case the desktop app is newer than the runner), unset
 * fields fall back to defaults, and malformed input warns to stderr rather
 * than crashing.
 */
export function parseRunConfig(raw: string | undefined): RunConfig {
  if (!raw) return DEFAULT_RUN_CONFIG;
  try {
    const parsed = JSON.parse(raw) as Partial<RunConfig>;
    return { ...DEFAULT_RUN_CONFIG, ...parsed };
  } catch (err) {
    console.error(
      `Could not parse config JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
    return DEFAULT_RUN_CONFIG;
  }
}
