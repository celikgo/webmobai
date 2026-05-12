import type { BrowserManager } from "../playwright/browser-manager.js";
import { logger } from "../utils/logger.js";

/**
 * Progressive Web App audits: manifest validation, service-worker presence,
 * and optional offline fallback test. The offline test flips the context
 * offline, reloads, and reports whether the page still rendered usefully —
 * the substrate of "installable, cached-shell-first" PWA behavior.
 */

interface Finding {
  rule: string;
  severity: "high" | "medium" | "low" | "info";
  description: string;
  details?: string;
}

const REQUIRED_MANIFEST_FIELDS = [
  "name",
  "short_name",
  "start_url",
  "display",
  "icons",
];

const VALID_DISPLAY_VALUES = ["fullscreen", "standalone", "minimal-ui", "browser"];

export function getPwaToolDefinitions() {
  return [
    {
      name: "webmobai_pwa_audit",
      description:
        "Audit Progressive Web App basics on the currently-loaded page: presence and validity of the web app manifest (name, short_name, start_url, display, icons), service worker registration, and optionally an offline-fallback test (flips offline, reloads, checks the page still renders something).",
      inputSchema: {
        type: "object" as const,
        properties: {
          test_offline: {
            type: "boolean",
            description:
              "Also flip the context offline and reload to check the page degrades to a cached shell or offline-page (default false, since this mutates page state).",
            default: false,
          },
        },
      },
    },
  ];
}

export async function handlePwaTool(
  name: string,
  args: Record<string, unknown>,
  browserManager: BrowserManager,
): Promise<{ content: { type: "text"; text: string }[] }> {
  try {
    switch (name) {
      case "webmobai_pwa_audit": {
        const testOffline = (args.test_offline as boolean) ?? false;
        const findings: Finding[] = [];

        const page = browserManager.page;
        const pageUrl = page.url();

        // 1. Manifest link presence.
        const manifestUrl = await page
          .evaluate(() => {
            const link = document.querySelector<HTMLLinkElement>(
              'link[rel="manifest"]',
            );
            return link?.href ?? null;
          })
          .catch(() => null);

        if (!manifestUrl) {
          findings.push({
            rule: "manifest-link-missing",
            severity: "high",
            description: "No <link rel=manifest> in the document head.",
          });
        } else {
          // 2. Manifest fetch + parse + required fields.
          findings.push(...(await auditManifest(browserManager, manifestUrl)));
        }

        // 3. Service worker registration.
        findings.push(...(await auditServiceWorker(browserManager)));

        // 4. HTTPS prereq — PWAs require HTTPS (or localhost) for the SW to
        //    even register. file:// pages can't be PWAs.
        if (!pageUrl.startsWith("https://") && !pageUrl.startsWith("http://localhost")) {
          findings.push({
            rule: "pwa-not-https",
            severity: "medium",
            description:
              "Page isn't HTTPS (or localhost). Service workers won't register, so this can't be a PWA.",
          });
        }

        // 5. Optional offline-fallback test.
        if (testOffline) {
          findings.push(...(await auditOfflineFallback(browserManager)));
        }

        return text(formatFindings(findings, pageUrl));
      }
      default:
        return text(`Unknown PWA tool: ${name}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`PWA tool error (${name}): ${msg}`);
    return text(`Error executing ${name}: ${msg}`);
  }
}

async function auditManifest(
  browserManager: BrowserManager,
  manifestUrl: string,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const page = browserManager.page;
  try {
    // Fetch via the page's own fetch — this respects page.route() mocks
    // and uses the same network conditions as the page itself (cookies,
    // CSP, etc.). The APIRequestContext alternative bypasses all of
    // those, which is wrong for a manifest audit.
    const res = await page.evaluate(async (url) => {
      const r = await fetch(url);
      return { status: r.status, ok: r.ok, body: await r.text() };
    }, manifestUrl);
    if (!res.ok) {
      findings.push({
        rule: "manifest-fetch-failed",
        severity: "high",
        description: `Manifest URL returned HTTP ${res.status}.`,
        details: manifestUrl,
      });
      return findings;
    }
    const body = res.body;
    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(body);
    } catch (err) {
      findings.push({
        rule: "manifest-invalid-json",
        severity: "high",
        description: `Manifest is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      });
      return findings;
    }

    for (const field of REQUIRED_MANIFEST_FIELDS) {
      const v = manifest[field];
      if (v == null || v === "") {
        findings.push({
          rule: `manifest-missing-${field}`,
          severity: "medium",
          description: `Manifest missing required field "${field}".`,
        });
      }
    }

    if (typeof manifest.display === "string" && !VALID_DISPLAY_VALUES.includes(manifest.display)) {
      findings.push({
        rule: "manifest-invalid-display",
        severity: "low",
        description: `Manifest display="${manifest.display}" — expected one of ${VALID_DISPLAY_VALUES.join(", ")}.`,
      });
    }

    const icons = manifest.icons;
    if (Array.isArray(icons) && icons.length > 0) {
      // Require at least one 192x192+ icon (Chrome's installability bar).
      const sizes = icons
        .flatMap((i: Record<string, unknown>) =>
          typeof i.sizes === "string" ? i.sizes.split(/\s+/) : [],
        )
        .map((s) => {
          const m = s.match(/^(\d+)x(\d+)$/);
          return m ? Number(m[1]) : 0;
        });
      const maxIconSide = sizes.length > 0 ? Math.max(...sizes) : 0;
      if (maxIconSide < 192) {
        findings.push({
          rule: "manifest-icon-too-small",
          severity: "medium",
          description: `Largest icon is ${maxIconSide}x${maxIconSide}. Chrome requires at least one ≥192x192 icon for installability.`,
        });
      }
    }
  } catch (err) {
    findings.push({
      rule: "manifest-fetch-error",
      severity: "high",
      description: `Could not fetch manifest: ${err instanceof Error ? err.message : String(err)}`,
      details: manifestUrl,
    });
  }
  return findings;
}

async function auditServiceWorker(
  browserManager: BrowserManager,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const page = browserManager.page;
  const swInfo = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) {
      return { supported: false, registrations: [] as { scope: string; active: boolean }[] };
    }
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      return {
        supported: true,
        registrations: regs.map((r) => ({
          scope: r.scope,
          active: !!r.active,
        })),
      };
    } catch {
      return { supported: true, registrations: [] as { scope: string; active: boolean }[] };
    }
  });

  if (!swInfo.supported) {
    findings.push({
      rule: "sw-not-supported",
      severity: "info",
      description:
        "Browser doesn't expose ServiceWorker API (uncommon outside locked-down embedded contexts).",
    });
  } else if (swInfo.registrations.length === 0) {
    findings.push({
      rule: "sw-not-registered",
      severity: "medium",
      description: "No service worker is registered for this origin.",
    });
  } else {
    const inactive = swInfo.registrations.filter((r) => !r.active);
    if (inactive.length > 0) {
      findings.push({
        rule: "sw-registration-inactive",
        severity: "low",
        description: `${inactive.length} service worker registration(s) are inactive.`,
        details: inactive.map((r) => r.scope).join(", "),
      });
    }
  }
  return findings;
}

async function auditOfflineFallback(
  browserManager: BrowserManager,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const page = browserManager.page;
  const ctx = page.context();
  try {
    await ctx.setOffline(true);
    let renderedSomething = false;
    let errorOnReload: string | null = null;
    try {
      await page.reload({ timeout: 5000 });
      const bodyText = await page.evaluate(
        () => document.body.innerText.trim().length,
      );
      renderedSomething = bodyText > 0;
    } catch (err) {
      errorOnReload = err instanceof Error ? err.message : String(err);
    }
    if (!renderedSomething) {
      findings.push({
        rule: "offline-no-fallback",
        severity: "medium",
        description: errorOnReload
          ? `Offline reload failed and page didn't render usefully: ${errorOnReload}`
          : "Offline reload produced an empty page (no cached shell, no offline fallback).",
      });
    } else {
      findings.push({
        rule: "offline-renders",
        severity: "info",
        description: "Offline reload rendered cached content — good PWA behavior.",
      });
    }
  } finally {
    await ctx.setOffline(false);
  }
  return findings;
}

function formatFindings(findings: Finding[], pageUrl: string): string {
  if (findings.length === 0) {
    return `# PWA audit — ${pageUrl}\n\nAll PWA heuristics pass.`;
  }
  const groups: Record<Finding["severity"], Finding[]> = {
    high: [],
    medium: [],
    low: [],
    info: [],
  };
  for (const f of findings) groups[f.severity].push(f);

  let out = `# PWA audit — ${pageUrl}\n\n`;
  out += `Found ${findings.length} findings: `;
  out += `${groups.high.length} high, ${groups.medium.length} medium, ${groups.low.length} low, ${groups.info.length} info.\n`;
  for (const sev of ["high", "medium", "low", "info"] as const) {
    if (groups[sev].length === 0) continue;
    out += `\n## ${sev.charAt(0).toUpperCase()}${sev.slice(1)} (${groups[sev].length})\n`;
    for (const f of groups[sev]) {
      out += `\n- **${f.rule}** — ${f.description}\n`;
      if (f.details) out += `  ${f.details}\n`;
    }
  }
  return out;
}

function text(message: string) {
  return { content: [{ type: "text" as const, text: message }] };
}
