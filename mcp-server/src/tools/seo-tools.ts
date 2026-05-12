import type { BrowserManager } from "../playwright/browser-manager.js";
import { logger } from "../utils/logger.js";

/**
 * SEO + content audits. All observation-based: inspect the document's
 * head, open-graph / twitter meta, JSON-LD structured data, and the
 * presence/shape of /robots.txt + /sitemap.xml. The broken-link crawler
 * uses HEAD requests against same-origin URLs only (no following links to
 * arbitrary external sites).
 */

const TITLE_MIN = 30;
const TITLE_MAX = 60;
const DESC_MIN = 70;
const DESC_MAX = 160;
const MAX_LINKS_TO_CHECK = 50;

interface Finding {
  rule: string;
  severity: "high" | "medium" | "low" | "info";
  description: string;
  details?: string;
}

export function getSeoToolDefinitions() {
  return [
    {
      name: "webmobai_seo_audit",
      description:
        "SEO audit on the currently-loaded page: title and meta-description length within best-practice ranges, presence of OpenGraph / Twitter meta tags, canonical link, structured-data (JSON-LD) parse check, /robots.txt and /sitemap.xml presence. Read-only.",
      inputSchema: {
        type: "object" as const,
        properties: {
          check_robots_and_sitemap: {
            type: "boolean",
            description:
              "Fetch /robots.txt and /sitemap.xml from the page origin (default true). Set false if you don't want network requests.",
            default: true,
          },
        },
      },
    },
    {
      name: "webmobai_check_broken_links",
      description:
        "HEAD-test internal links from the current page and report 4xx/5xx responses. Same-origin only; capped at 50 links to keep runs bounded. Useful for catching internal 404s after a deploy.",
      inputSchema: {
        type: "object" as const,
        properties: {
          max_links: {
            type: "number",
            description: "Maximum links to check (default 50, max 100)",
            default: 50,
          },
        },
      },
    },
  ];
}

export async function handleSeoTool(
  name: string,
  args: Record<string, unknown>,
  browserManager: BrowserManager,
): Promise<{ content: { type: "text"; text: string }[] }> {
  try {
    switch (name) {
      case "webmobai_seo_audit": {
        const checkRobots = (args.check_robots_and_sitemap as boolean) ?? true;
        const findings = await runSeoAudit(browserManager, { checkRobots });
        return text(formatFindings(findings, browserManager.page.url()));
      }
      case "webmobai_check_broken_links": {
        const max = Math.min(100, Math.max(1, (args.max_links as number) ?? MAX_LINKS_TO_CHECK));
        return text(await runBrokenLinkCheck(browserManager, max));
      }
      default:
        return text(`Unknown SEO tool: ${name}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`SEO tool error (${name}): ${msg}`);
    return text(`Error executing ${name}: ${msg}`);
  }
}

async function runSeoAudit(
  browserManager: BrowserManager,
  options: { checkRobots: boolean },
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const page = browserManager.page;
  const pageInfo = await page.evaluate(() => {
    function metaContent(selector: string): string | null {
      const el = document.querySelector<HTMLMetaElement>(selector);
      return el?.content ?? null;
    }
    return {
      title: document.title.trim(),
      description: metaContent('meta[name="description" i]'),
      canonical:
        document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? null,
      og: {
        title: metaContent('meta[property="og:title" i]'),
        description: metaContent('meta[property="og:description" i]'),
        image: metaContent('meta[property="og:image" i]'),
        url: metaContent('meta[property="og:url" i]'),
        type: metaContent('meta[property="og:type" i]'),
      },
      twitter: {
        card: metaContent('meta[name="twitter:card" i]'),
        title: metaContent('meta[name="twitter:title" i]'),
        description: metaContent('meta[name="twitter:description" i]'),
        image: metaContent('meta[name="twitter:image" i]'),
      },
      jsonLdBlocks: Array.from(
        document.querySelectorAll<HTMLScriptElement>(
          'script[type="application/ld+json"]',
        ),
      ).map((s) => s.textContent ?? ""),
      h1Count: document.querySelectorAll("h1").length,
      viewportMeta:
        document.querySelector<HTMLMetaElement>('meta[name="viewport" i]')?.content ?? null,
    };
  });

  // Title.
  if (!pageInfo.title) {
    findings.push({
      rule: "title-missing",
      severity: "high",
      description: "Page has no <title>.",
    });
  } else if (pageInfo.title.length < TITLE_MIN) {
    findings.push({
      rule: "title-too-short",
      severity: "low",
      description: `Title is ${pageInfo.title.length} chars (recommended ${TITLE_MIN}-${TITLE_MAX}).`,
      details: pageInfo.title,
    });
  } else if (pageInfo.title.length > TITLE_MAX) {
    findings.push({
      rule: "title-too-long",
      severity: "low",
      description: `Title is ${pageInfo.title.length} chars (recommended ${TITLE_MIN}-${TITLE_MAX}). Likely truncated in SERPs.`,
      details: pageInfo.title,
    });
  }

  // Meta description.
  if (!pageInfo.description) {
    findings.push({
      rule: "meta-description-missing",
      severity: "medium",
      description: "No <meta name=description>.",
    });
  } else if (pageInfo.description.length < DESC_MIN) {
    findings.push({
      rule: "meta-description-short",
      severity: "low",
      description: `Meta description is ${pageInfo.description.length} chars (recommended ${DESC_MIN}-${DESC_MAX}).`,
    });
  } else if (pageInfo.description.length > DESC_MAX) {
    findings.push({
      rule: "meta-description-long",
      severity: "low",
      description: `Meta description is ${pageInfo.description.length} chars (likely truncated in SERPs).`,
    });
  }

  // Canonical.
  if (!pageInfo.canonical) {
    findings.push({
      rule: "canonical-missing",
      severity: "low",
      description: "No <link rel=canonical>. Search engines may treat URL variants as separate pages.",
    });
  }

  // OG / Twitter — info-level when missing; they're SEO polish not breakage.
  if (!pageInfo.og.title) {
    findings.push({
      rule: "og-title-missing",
      severity: "info",
      description: "No og:title — social link previews fall back to <title>.",
    });
  }
  if (!pageInfo.og.image) {
    findings.push({
      rule: "og-image-missing",
      severity: "info",
      description: "No og:image — social link previews won't show a thumbnail.",
    });
  }
  if (!pageInfo.twitter.card) {
    findings.push({
      rule: "twitter-card-missing",
      severity: "info",
      description: "No twitter:card meta — Twitter previews use OG fallback.",
    });
  }

  // H1.
  if (pageInfo.h1Count === 0) {
    findings.push({
      rule: "h1-missing",
      severity: "medium",
      description: "No <h1> on the page — both an SEO and an accessibility issue.",
    });
  } else if (pageInfo.h1Count > 1) {
    findings.push({
      rule: "h1-multiple",
      severity: "low",
      description: `${pageInfo.h1Count} <h1> elements — HTML5 permits this but most SEO tools recommend exactly one per page.`,
    });
  }

  // Viewport meta — affects mobile usability ranking.
  if (!pageInfo.viewportMeta) {
    findings.push({
      rule: "viewport-meta-missing",
      severity: "medium",
      description:
        "No <meta name=viewport>. Mobile browsers fall back to a 980px legacy viewport.",
    });
  }

  // JSON-LD parse check.
  for (let i = 0; i < pageInfo.jsonLdBlocks.length; i++) {
    const raw = pageInfo.jsonLdBlocks[i]!;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !("@type" in parsed) && !Array.isArray(parsed)) {
        findings.push({
          rule: "json-ld-no-type",
          severity: "low",
          description: `JSON-LD block ${i + 1} has no @type — search engines won't categorize it.`,
        });
      }
    } catch {
      findings.push({
        rule: "json-ld-invalid",
        severity: "medium",
        description: `JSON-LD block ${i + 1} is not valid JSON.`,
        details: raw.slice(0, 120),
      });
    }
  }

  // robots.txt + sitemap.xml — only fetch if the page is an http(s) URL
  // (file:// fixtures don't have these and we don't want noise).
  if (options.checkRobots) {
    try {
      const origin = new URL(page.url()).origin;
      if (origin.startsWith("http")) {
        const robots = await page.context().request.fetch(`${origin}/robots.txt`).catch(() => null);
        if (!robots || !robots.ok()) {
          findings.push({
            rule: "robots-missing",
            severity: "low",
            description: `/robots.txt not present at ${origin}.`,
          });
        }
        const sitemap = await page
          .context()
          .request.fetch(`${origin}/sitemap.xml`)
          .catch(() => null);
        if (!sitemap || !sitemap.ok()) {
          findings.push({
            rule: "sitemap-missing",
            severity: "low",
            description: `/sitemap.xml not present at ${origin}.`,
          });
        }
      }
    } catch {
      // Origin-derivation failure (e.g. file://) → silently skip.
    }
  }

  return findings;
}

async function runBrokenLinkCheck(
  browserManager: BrowserManager,
  maxLinks: number,
): Promise<string> {
  const page = browserManager.page;
  const origin = (() => {
    try {
      return new URL(page.url()).origin;
    } catch {
      return null;
    }
  })();
  if (!origin || !origin.startsWith("http")) {
    return "Broken-link check skipped — page URL is not http(s).";
  }

  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
      .map((a) => a.href)
      .filter((h) => h.startsWith("http"));
  });
  const sameOrigin = Array.from(new Set(links.filter((l) => l.startsWith(origin)))).slice(
    0,
    maxLinks,
  );

  const broken: { url: string; status: number; reason: string }[] = [];
  for (const url of sameOrigin) {
    try {
      const r = await page.context().request.fetch(url, {
        method: "HEAD",
        timeout: 5000,
        failOnStatusCode: false,
      });
      if (r.status() >= 400) {
        broken.push({ url, status: r.status(), reason: r.statusText() });
      }
    } catch (err) {
      broken.push({
        url,
        status: 0,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  let out = `# Broken-link check\n\nChecked ${sameOrigin.length}/${links.length} same-origin links from ${page.url()}.\n`;
  if (broken.length === 0) {
    out += "\nAll links return 2xx/3xx.\n";
  } else {
    out += `\n## Failures (${broken.length})\n`;
    for (const b of broken) {
      out += `- ${b.status || "—"} ${b.url} ${b.reason ? `(${b.reason})` : ""}\n`;
    }
  }
  return out;
}

function formatFindings(findings: Finding[], pageUrl: string): string {
  if (findings.length === 0) {
    return `# SEO audit — ${pageUrl}\n\nAll heuristics pass.`;
  }
  const groups: Record<Finding["severity"], Finding[]> = {
    high: [],
    medium: [],
    low: [],
    info: [],
  };
  for (const f of findings) groups[f.severity].push(f);

  let out = `# SEO audit — ${pageUrl}\n\n`;
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
