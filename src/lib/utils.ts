import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { convertFileSrc } from "@tauri-apps/api/core";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Convert a local filesystem path into a URL the Tauri webview can load via
// the asset:// protocol. In plain-browser dev (no Tauri runtime) the
// resulting asset:// URL won't resolve — the gallery only works inside the
// desktop app, which matches where screenshots are produced anyway.
export function toAssetUrl(path: string): string {
  if (!path) return path;
  // Already a URL — leave it alone.
  if (/^[a-z]+:\/\//i.test(path)) return path;
  if (typeof window === "undefined" || !("__TAURI__" in window)) return path;
  return convertFileSrc(path);
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

// Copy text to the clipboard. Returns true on success so callers can surface a
// toast. Falls back gracefully when the Clipboard API is unavailable.
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// Open a file path or URL in the OS default handler. Inside Tauri this uses the
// shell plugin (already permitted); in plain-browser dev it opens a new tab.
export async function openExternal(target: string): Promise<void> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-shell");
    // Local report/PDF/screenshot paths are absolute filesystem paths; wrap
    // them as file:// URLs so they pass the shell.open scope. URLs
    // (http/https/mailto/tel) already carry a scheme and pass through.
    const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(target);
    await open(hasScheme ? target : "file://" + target);
  } else if (typeof window !== "undefined") {
    window.open(target, "_blank", "noopener,noreferrer");
  }
}

// Reveal a file in Finder (macOS) using `open -R`, which highlights the file in
// its containing folder. Uses the scoped "open-reveal" shell command (see
// src-tauri/capabilities/default.json).
export async function revealInFinder(path: string): Promise<void> {
  if (!isTauri()) return;
  const { Command } = await import("@tauri-apps/plugin-shell");
  await Command.create("open-reveal", ["-R", path]).execute();
}
