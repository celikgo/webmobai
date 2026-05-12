import type { BrowserManager } from "../playwright/browser-manager.js";

/**
 * When a tool fails, the calling agent (Claude) benefits from one
 * consolidated bundle of "what's the page actually doing right now":
 * latest URL, console errors, network errors, and a screenshot path it
 * can fetch. Returning a coherent bundle is the difference between
 * "selector not found" and "selector not found AND the page navigated to
 * /login because the session expired".
 *
 * Keep this string compact — it's appended to tool error responses.
 */
export async function buildFailureTriage(
  browserManager: BrowserManager,
  options: { includeScreenshot?: boolean } = {},
): Promise<string> {
  const lines: string[] = [];

  try {
    const page = browserManager.page;
    lines.push(`Current URL: ${page.url()}`);
    const title = await page.title().catch(() => "");
    if (title) lines.push(`Current title: "${title}"`);
    const vp = page.viewportSize();
    if (vp) lines.push(`Viewport: ${vp.width}x${vp.height}`);
  } catch {
    // Page may already be closed — skip.
  }

  // Last 5 console errors (errors only — warnings would be noise here).
  const consoleErrors = browserManager
    .getConsoleErrors()
    .filter((e) => e.type === "error")
    .slice(-5);
  if (consoleErrors.length > 0) {
    lines.push(`Recent console errors (${consoleErrors.length}):`);
    for (const e of consoleErrors) {
      lines.push(`  - ${e.message.slice(0, 200)}`);
    }
  }

  // Last 5 network errors (failed requests + 4xx/5xx responses).
  const networkErrors = browserManager.getNetworkErrors().slice(-5);
  if (networkErrors.length > 0) {
    lines.push(`Recent network errors (${networkErrors.length}):`);
    for (const e of networkErrors) {
      lines.push(`  - ${e.method} ${e.url} — ${e.failure}`);
    }
  }

  if (options.includeScreenshot !== false) {
    try {
      const path = await browserManager.screenshot("failure triage");
      lines.push(`Screenshot saved: ${path}`);
    } catch {
      // Screenshot failures are non-critical here.
    }
  }

  if (lines.length === 0) {
    return "(no triage context available)";
  }
  return ["", "--- Failure context ---", ...lines].join("\n");
}
