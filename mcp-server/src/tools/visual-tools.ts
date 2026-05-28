import { join } from "node:path";
import type { BrowserManager } from "../playwright/browser-manager.js";
import { BaselineStore } from "../visual/baseline-store.js";
import { compareImages, withinTolerance } from "../visual/comparator.js";
import { logger } from "../utils/logger.js";

/**
 * Pixel-perfect visual regression via pixelmatch. First call against a name
 * captures the baseline; subsequent calls compare and report differences.
 *
 * Baselines live in `baseline_dir` (default <sessionDir>/visual-baselines).
 * In real projects you point this at a path checked into git so baselines
 * version alongside the code.
 *
 * On mismatch, an `.actual.png` (current screenshot) and `.diff.png`
 * (pixelmatch highlight overlay) are written next to the baseline so you
 * can see what changed.
 */

export function getVisualToolDefinitions() {
  return [
    {
      name: "webmobai_visual_snapshot",
      description:
        "Capture a screenshot and compare it pixel-by-pixel against a stored baseline. First call against a name saves the baseline; subsequent calls report diff stats. Mismatches write .actual and .diff PNGs alongside the baseline so users can see what changed. Tolerance: maxDiffPixels OR maxDiffPixelRatio (default 1%). Use `update_baseline: true` to overwrite an existing baseline (e.g., after an intentional UI change) — the previous baseline is archived to `<name>.v<unix-ms>.png` (Sprint 16). Requires a launched browser.",
      inputSchema: {
        type: "object" as const,
        properties: {
          name: {
            type: "string",
            description:
              "Unique snapshot name. Forward slashes nest into subdirectories ('checkout/cart-empty').",
          },
          baseline_dir: {
            type: "string",
            description:
              "Directory where baselines live (default <session>/visual-baselines). Use a repo-relative path so baselines version alongside the code.",
          },
          selector: {
            type: "string",
            description:
              "Optional selector — snapshot only the matching element instead of the viewport.",
          },
          full_page: {
            type: "boolean",
            description: "Capture the full scrollable page (default false)",
            default: false,
          },
          threshold: {
            type: "number",
            description:
              "Per-pixel color sensitivity, 0 (exact) to 1 (no sensitivity). Default 0.2 (matches Playwright).",
            default: 0.2,
          },
          max_diff_pixels: {
            type: "number",
            description:
              "Maximum allowed differing pixels (absolute). Optional — combined with max_diff_pixel_ratio.",
          },
          max_diff_pixel_ratio: {
            type: "number",
            description:
              "Maximum allowed diff ratio (0.0–1.0). Default 0.01 (1%).",
            default: 0.01,
          },
          update_baseline: {
            type: "boolean",
            description:
              "Force-overwrite the baseline with the current screenshot. Use after intentional UI changes. The prior baseline is archived to <name>.v<unix-ms>.png and can be listed/restored via the baseline-history tools.",
            default: false,
          },
        },
        required: ["name"],
      },
    },
    {
      name: "webmobai_visual_baseline_list_versions",
      description:
        "List archived versions of a visual baseline (Sprint 16). Each writeBaseline / update_baseline archives the previous PNG to <name>.v<unix-ms>.png; this tool surfaces them so you can roll back. No browser required.",
      inputSchema: {
        type: "object" as const,
        properties: {
          name: {
            type: "string",
            description:
              "Snapshot name passed to webmobai_visual_snapshot — same forward-slash nesting.",
          },
          baseline_dir: {
            type: "string",
            description:
              "Directory where baselines live. Must match what was used when the baseline was written.",
          },
        },
        required: ["name", "baseline_dir"],
      },
    },
    {
      name: "webmobai_visual_baseline_restore_version",
      description:
        "Promote an archived baseline version to be the current baseline (Sprint 16). The currently-active baseline is itself archived first, so the swap is reversible. No browser required.",
      inputSchema: {
        type: "object" as const,
        properties: {
          name: {
            type: "string",
            description: "Snapshot name (same as webmobai_visual_snapshot).",
          },
          baseline_dir: {
            type: "string",
            description: "Directory where baselines live.",
          },
          timestamp: {
            type: "number",
            description:
              "Unix-ms timestamp of the archived version to restore. Use webmobai_visual_baseline_list_versions to discover available timestamps.",
          },
        },
        required: ["name", "baseline_dir", "timestamp"],
      },
    },
  ];
}

export async function handleVisualTool(
  name: string,
  args: Record<string, unknown>,
  browserManager: BrowserManager,
): Promise<{ content: { type: "text"; text: string }[] }> {
  try {
    switch (name) {
      case "webmobai_visual_baseline_list_versions": {
        const snapshotName = args.name as string;
        const baselineDir = args.baseline_dir as string;
        if (!snapshotName || !baselineDir) {
          return text("`name` and `baseline_dir` are required.");
        }
        const store = new BaselineStore(baselineDir);
        const versions = await store.listVersions(snapshotName);
        if (versions.length === 0) {
          return text(
            `No archived versions for "${snapshotName}" in ${baselineDir}.\n(Versions appear after the first update_baseline / overwrite.)`,
          );
        }
        const lines: string[] = [];
        lines.push(
          `# Archived versions of "${snapshotName}" (${versions.length})`,
        );
        lines.push("");
        versions.forEach((v, i) => {
          lines.push(
            `${i + 1}. timestamp=${v.timestamp}  (${new Date(v.timestamp).toISOString()})\n   ${v.path}`,
          );
        });
        lines.push("");
        lines.push(
          "Restore one with webmobai_visual_baseline_restore_version (pass the timestamp).",
        );
        return text(lines.join("\n"));
      }

      case "webmobai_visual_baseline_restore_version": {
        const snapshotName = args.name as string;
        const baselineDir = args.baseline_dir as string;
        const timestamp = args.timestamp as number;
        if (!snapshotName || !baselineDir || !Number.isFinite(timestamp)) {
          return text(
            "`name`, `baseline_dir`, and a numeric `timestamp` are required.",
          );
        }
        const store = new BaselineStore(baselineDir);
        const restored = await store.restoreVersion(snapshotName, timestamp);
        return text(
          `Restored baseline "${snapshotName}" from version ${timestamp}.\n` +
            `Current baseline path: ${restored}\n` +
            `(The previously-current baseline was archived first; nothing is lost.)`,
        );
      }

      case "webmobai_visual_snapshot": {
        if (!browserManager.isLaunched) {
          return text(
            "Browser is not launched. Call webmobai_launch_browser first.",
          );
        }
        const snapshotName = args.name as string;
        const baselineDir =
          (args.baseline_dir as string | undefined) ??
          join(browserManager.sessionDir, "visual-baselines");
        const selector = args.selector as string | undefined;
        const fullPage = (args.full_page as boolean) ?? false;
        const threshold = (args.threshold as number) ?? 0.2;
        const maxDiffPixels = args.max_diff_pixels as number | undefined;
        const maxDiffPixelRatio =
          (args.max_diff_pixel_ratio as number) ?? 0.01;
        const updateBaseline = (args.update_baseline as boolean) ?? false;

        const store = new BaselineStore(baselineDir);
        const png = await captureScreenshot(browserManager, { selector, fullPage });

        // First run (or forced update): save as baseline.
        if (!store.hasBaseline(snapshotName) || updateBaseline) {
          const baselinePath = await store.writeBaseline(snapshotName, png);
          const action = updateBaseline ? "updated" : "created";
          return text(
            `Visual baseline ${action}: ${baselinePath}\n` +
              `Future runs of "${snapshotName}" will be compared against this image.`,
          );
        }

        // Comparison run.
        const baselinePng = await store.readBaseline(snapshotName);
        const stats = compareImages(png, baselinePng, { threshold });
        const passed = withinTolerance(stats, {
          maxDiffPixels,
          maxDiffPixelRatio,
        });

        if (passed) {
          return text(
            `PASS — "${snapshotName}" matched baseline (${stats.diffPixels}/${stats.totalPixels} pixels differ, ${(stats.diffRatio * 100).toFixed(3)}%)`,
          );
        }

        // Failure: persist actual + diff so users can inspect.
        const actualPath = await store.writeActual(snapshotName, png);
        const diffPath = await store.writeDiff(snapshotName, stats.diffImage);

        const lines: string[] = [];
        if (!stats.sizeMatched) {
          lines.push(
            `FAIL — "${snapshotName}" dimension mismatch: actual is ${stats.width}x${stats.height}, baseline differs.`,
          );
        } else {
          lines.push(
            `FAIL — "${snapshotName}" exceeds tolerance: ${stats.diffPixels} pixels differ (${(stats.diffRatio * 100).toFixed(3)}%).`,
          );
          if (maxDiffPixels != null) {
            lines.push(`  maxDiffPixels: ${maxDiffPixels}`);
          }
          lines.push(`  maxDiffPixelRatio: ${maxDiffPixelRatio}`);
        }
        lines.push("");
        lines.push(`Actual screenshot: ${actualPath}`);
        lines.push(`Diff image:        ${diffPath}`);
        lines.push(`Baseline:          ${store.pathFor(snapshotName)}`);
        lines.push("");
        lines.push(
          "If this change is intentional, re-run with update_baseline: true to overwrite the baseline.",
        );

        return text(lines.join("\n"));
      }
      default:
        return text(`Unknown visual tool: ${name}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Visual tool error (${name}): ${msg}`);
    return text(`Error executing ${name}: ${msg}`);
  }
}

async function captureScreenshot(
  browserManager: BrowserManager,
  options: { selector?: string; fullPage?: boolean },
): Promise<Buffer> {
  const page = browserManager.page;
  if (options.selector) {
    const handle = await page.$(options.selector);
    if (!handle) {
      throw new Error(`Element not found for visual snapshot: ${options.selector}`);
    }
    return await handle.screenshot();
  }
  return await page.screenshot({ fullPage: options.fullPage ?? false });
}

function text(message: string) {
  return { content: [{ type: "text" as const, text: message }] };
}
