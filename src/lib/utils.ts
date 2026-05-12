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
