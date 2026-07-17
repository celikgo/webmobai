import { useCallback, useEffect, useState } from "react";
import { isTauri } from "@/lib/utils";

// Mirrors mcp-server/src/utils/run-history.ts:RunHistoryEntry. Kept inline so
// the frontend doesn't import from mcp-server.
export interface RunHistoryEntry {
  id: string;
  url: string;
  timestamp: number;
  durationMs: number;
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    warnings: number;
  };
  metrics: {
    lcp: number | null;
    fcp: number | null;
    cls: number | null;
    tti: number | null;
    ttfb: number | null;
  };
  accessibilityIssueCount: number;
  consoleErrorCount: number;
  networkErrorCount: number;
  browser?: string;
  device?: string;
}

interface State {
  entries: RunHistoryEntry[];
  urls: string[];
  loading: boolean;
  error: string | null;
}

/**
 * Reads `~/.webmobai/history.json` via the Tauri shell plugin (`cat`), parses
 * it, and exposes the entries grouped by URL. No new Tauri permission is
 * needed — `shell:allow-execute` was already granted in Sprint 14.
 *
 * In a non-Tauri (browser dev) environment the hook returns an empty state
 * without erroring — the data only exists on the user's local machine.
 */
export function useMonitorHistory() {
  const [state, setState] = useState<State>({
    entries: [],
    urls: [],
    loading: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    if (!isTauri()) {
      setState({ entries: [], urls: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { homeDir } = await import("@tauri-apps/api/path");
      const { Command } = await import("@tauri-apps/plugin-shell");
      const home = await homeDir();
      const historyPath = `${home.replace(/\/+$/, "")}/.webmobai/history.json`;
      const result = await Command.create("cat-history", [historyPath]).execute();
      if (result.code !== 0) {
        // Most likely the file doesn't exist yet — no runs have been recorded.
        setState({ entries: [], urls: [], loading: false, error: null });
        return;
      }
      const parsed = JSON.parse(result.stdout) as unknown;
      const entries = Array.isArray(parsed)
        ? (parsed as RunHistoryEntry[])
        : [];
      const urls = Array.from(new Set(entries.map((e) => e.url))).sort();
      setState({ entries, urls, loading: false, error: null });
    } catch (err) {
      setState({
        entries: [],
        urls: [],
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}
