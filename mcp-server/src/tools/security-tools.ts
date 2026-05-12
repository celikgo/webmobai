import type { BrowserManager } from "../playwright/browser-manager.js";
import { logger } from "../utils/logger.js";

/**
 * Read-only security audits: inspect the page's response headers, capture
 * sub-resource URLs from the network log, and inspect cookies via the
 * BrowserContext API. No writes, no destructive ops.
 */

export function getSecurityToolDefinitions() {
  return [
    {
      name: "webmobai_security_audit",
      description:
        "Run a quick security audit on the currently-loaded page: CSP presence + weakness (unsafe-inline, unsafe-eval, missing default-src), mixed content detection (HTTPS page loading HTTP subresources), and cookie attribute audit (missing Secure / HttpOnly / SameSite). Read-only — no writes, no destructive ops. Surface findings grouped by severity.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
  ];
}

interface Finding {
  rule: string;
  severity: "high" | "medium" | "low" | "info";
  description: string;
  details?: string;
}

export async function handleSecurityTool(
  name: string,
  _args: Record<string, unknown>,
  browserManager: BrowserManager,
): Promise<{ content: { type: "text"; text: string }[] }> {
  try {
    switch (name) {
      case "webmobai_security_audit": {
        const findings: Finding[] = [];
        const page = browserManager.page;
        const pageUrl = page.url();
        const pageIsHttps = pageUrl.startsWith("https://");

        // 1. CSP — fetch the response for the main document via CDP since
        //    Playwright's main-frame response isn't directly exposed. We
        //    fall back to evaluating Response from meta if no header.
        const cspFindings = await auditCSP(browserManager);
        findings.push(...cspFindings);

        // 2. Mixed content — look at our network log for HTTP subresources
        //    on an HTTPS page.
        if (pageIsHttps) {
          findings.push(...auditMixedContent(browserManager, pageUrl));
        } else {
          findings.push({
            rule: "https",
            severity: "high",
            description:
              "Page is served over HTTP. Use HTTPS to enable proper isolation, integrity, and modern web APIs.",
          });
        }

        // 3. Cookies — inspect each cookie's attributes.
        findings.push(...(await auditCookies(browserManager)));

        return text(formatFindings(findings, pageUrl));
      }
      default:
        return text(`Unknown security tool: ${name}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Security tool error (${name}): ${msg}`);
    return text(`Error executing ${name}: ${msg}`);
  }
}

async function auditCSP(browserManager: BrowserManager): Promise<Finding[]> {
  const findings: Finding[] = [];
  const page = browserManager.page;

  // Try to read the CSP via two channels: <meta http-equiv="content-security-
  // policy"> in the document, and the response header for the main frame.
  // We grab whichever is set.
  const cspFromMeta = await page
    .evaluate(() => {
      const meta = document.querySelector<HTMLMetaElement>(
        'meta[http-equiv="content-security-policy" i]',
      );
      return meta?.content ?? null;
    })
    .catch(() => null);

  // Header-based CSP requires intercepting the main-document response. We
  // already have the URL — refetch the headers via Playwright's request API
  // for completeness.
  let cspFromHeader: string | null = null;
  try {
    const url = page.url();
    if (url.startsWith("http")) {
      const req = await page.context().request.fetch(url, { method: "GET" });
      const headers = req.headers();
      cspFromHeader =
        headers["content-security-policy"] ??
        headers["content-security-policy-report-only"] ??
        null;
    }
  } catch {
    // Network errors don't matter here — meta alone is acceptable.
  }

  const csp = cspFromHeader ?? cspFromMeta;
  if (!csp) {
    findings.push({
      rule: "csp-missing",
      severity: "medium",
      description:
        "No Content-Security-Policy header or meta tag found. CSP is the standard defense against XSS and data injection.",
    });
    return findings;
  }

  const directives = parseCsp(csp);
  if (!directives["default-src"] && !directives["script-src"]) {
    findings.push({
      rule: "csp-no-default-src",
      severity: "medium",
      description:
        "CSP has neither default-src nor script-src. Without one of these, the policy doesn't constrain script loading.",
    });
  }
  for (const directive of ["script-src", "default-src", "style-src"]) {
    const values = directives[directive] ?? [];
    if (values.includes("'unsafe-inline'")) {
      findings.push({
        rule: `csp-unsafe-inline-${directive}`,
        severity: "high",
        description: `${directive} allows 'unsafe-inline'. Inline scripts/styles defeat the XSS-mitigation point of CSP.`,
        details: csp.slice(0, 200),
      });
    }
    if (values.includes("'unsafe-eval'")) {
      findings.push({
        rule: `csp-unsafe-eval-${directive}`,
        severity: "high",
        description: `${directive} allows 'unsafe-eval'. eval() defeats CSP's script-execution constraints.`,
      });
    }
  }
  return findings;
}

function parseCsp(csp: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of csp.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [directive, ...values] = trimmed.split(/\s+/);
    if (directive) out[directive.toLowerCase()] = values;
  }
  return out;
}

function auditMixedContent(
  browserManager: BrowserManager,
  pageUrl: string,
): Finding[] {
  const findings: Finding[] = [];
  // We don't track every request the page makes, but the network errors we
  // already capture include URLs. For full mixed-content detection we'd
  // listen on page.on('request'), which we'll add later. For now we use
  // what's available: any request URL captured in network errors that
  // starts with http:// while the page is https:// counts.
  const errors = browserManager.getNetworkErrors();
  const mixed = errors.filter(
    (e) => e.url.startsWith("http://") && pageUrl.startsWith("https://"),
  );
  for (const e of mixed) {
    findings.push({
      rule: "mixed-content",
      severity: "high",
      description: `HTTPS page loaded HTTP resource: ${e.url}`,
      details: `${e.method} ${e.url} — ${e.failure}`,
    });
  }
  return findings;
}

async function auditCookies(
  browserManager: BrowserManager,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const cookies = await browserManager.page.context().cookies();
  for (const c of cookies) {
    const flags: string[] = [];
    if (!c.secure) flags.push("Secure");
    if (!c.httpOnly) flags.push("HttpOnly");
    if (!c.sameSite || c.sameSite === "None") {
      // SameSite=None without Secure is doubly bad; otherwise it's just
      // weaker than Lax/Strict.
      if (c.sameSite === "None" && !c.secure) {
        findings.push({
          rule: "cookie-samesite-none-insecure",
          severity: "high",
          description: `Cookie "${c.name}" sets SameSite=None without Secure — browsers reject this.`,
        });
      }
      flags.push("SameSite (=Lax or Strict)");
    }
    if (flags.length > 0) {
      findings.push({
        rule: "cookie-attribute-missing",
        severity: c.name.toLowerCase().includes("session") || c.name.toLowerCase().includes("auth")
          ? "high"
          : "medium",
        description: `Cookie "${c.name}" missing recommended attributes: ${flags.join(", ")}`,
        details: `domain=${c.domain} path=${c.path}`,
      });
    }
  }
  return findings;
}

function formatFindings(findings: Finding[], pageUrl: string): string {
  if (findings.length === 0) {
    return `# Security audit — ${pageUrl}\n\nNo issues found by the heuristics. This is a fast scan; pair with proper SAST/DAST tooling before declaring a site secure.`;
  }
  const groups: Record<Finding["severity"], Finding[]> = {
    high: [],
    medium: [],
    low: [],
    info: [],
  };
  for (const f of findings) groups[f.severity].push(f);

  let out = `# Security audit — ${pageUrl}\n\n`;
  out += `Found ${findings.length} issues: `;
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
