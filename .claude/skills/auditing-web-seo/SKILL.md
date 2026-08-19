---
name: auditing-web-seo
description: Use when the user wants an SEO + content audit of a page — title/meta description, Open Graph, canonical, headings, viewport, structured data — plus a same-origin broken-link check. Triggers on "SEO audit", "meta tags", "Open Graph", "canonical", "broken links", "check links", "missing alt text", "heading structure", "is my SEO ok", "content audit".
---

# Auditing Web SEO & Content

## Overview

This skill runs two read-only, observation-based checks on a loaded page:

1. **`webmobai_seo_audit`** — on-page SEO/content hygiene: `<title>` and meta-description length, Open Graph / Twitter card meta, `<link rel=canonical>`, `<h1>` count, viewport meta, JSON-LD structured-data validity, and `/robots.txt` + `/sitemap.xml` presence.
2. **`webmobai_check_broken_links`** — HEAD-tests the page's same-origin links and reports any status ≥ 400 (plus `0` for requests that threw).

It reports findings grouped by severity (high / medium / low / info). It is a **hygiene check, not a ranking prediction** — it can't tell you where you'll rank, only whether the machine-readable SEO signals are present and well-formed.

**Alt-text note:** `seo_audit` does **not** inspect image `alt` attributes despite that being a common SEO ask. Missing alt text is caught by `auditing-web-accessibility` (it's primarily an a11y concern) — hand off there if that's the focus.

## When to Use

Trigger keywords: SEO audit, meta tags, Open Graph, canonical, broken links, check links, heading structure, content audit, "is my SEO ok".

Use `auditing-web-accessibility` instead for deep alt-text / ARIA / contrast work. Use `testing-web-app` if the user wants SEO folded into a full multi-check report.

## Inputs You Need

1. **URL** (required). The specific page to audit — SEO signals are per-page, so audit the page that matters (a landing page, a product page), not just the homepage.
2. **Check robots/sitemap?** (optional). Defaults on. Turn off (`check_robots_and_sitemap: false`) if the origin is a fixture or you want zero extra network requests.
3. **Broken-link cap** (optional). `max_links` defaults 50, clamped to 1–100.
4. **Login required?** Rare for SEO — indexable pages are public by definition — but real for a staging origin behind basic auth or an app shell you want link-checked. Capture the session once and replay it rather than driving the login each run: see `testing-web-authenticated-sessions` (`webmobai_save_storage_state`, then `storage_state_path` on `webmobai_launch_browser`). Never invent credentials. If the page you audit is only reachable while logged in, say plainly that Googlebot cannot see it either.

## Workflow

### 1. Launch
`webmobai_launch_browser` with `headless: false` (let the user watch), `record_video: false` (an audit doesn't need replay evidence).

### 2. Navigate
`webmobai_navigate` to the URL. Confirm you landed on the real page (not a redirect to login / an error page) — SEO findings on the wrong page are worthless.

### 3. SEO audit
`webmobai_seo_audit`. Optionally pass `check_robots_and_sitemap: false`. Output is headed `# SEO audit — <url>` with `Found N findings: N high, N medium, N low, N info.` and `## High / ## Medium / ## Low / ## Info` sections; a clean page returns `All heuristics pass.`

The complete rule set, with the severity the tool assigns — don't re-grade these:

| Severity | Rules |
|---|---|
| high | `title-missing` |
| medium | `meta-description-missing`, `h1-missing`, `viewport-meta-missing`, `json-ld-invalid` |
| low | `title-too-short` / `title-too-long` (outside 30–60 chars), `meta-description-short` / `meta-description-long` (outside 70–160), `canonical-missing`, `h1-multiple`, `json-ld-no-type`, `robots-missing`, `sitemap-missing` |
| info | `og-title-missing`, `og-image-missing`, `twitter-card-missing` |

`title-missing` is the only `high`, so a "no high findings" result is a low bar — read the medium bucket before calling the page healthy.

### 4. Broken-link check
`webmobai_check_broken_links` with `max_links` (default 50, clamped 1–100). It collects every `a[href]` resolving to an `http(s)` URL, keeps only those starting with the page's own origin, dedupes, caps at `max_links`, then HEAD-tests each with a 5 s timeout and `failOnStatusCode: false`. External links are intentionally not followed. Output is headed `# Broken-link check`; failures list status ≥ 400, or `0` when the request threw (timeout, DNS, connection reset).

Read the ratio carefully: the tool prints `Checked X/Y same-origin links` where **X** is deduped same-origin-after-cap and **Y** is *all* http(s) links on the page including external ones. So `34/41` does not mean 7 same-origin links were skipped — it usually means 7 of the links were external. Don't report it as coverage loss unless X hit the cap.

### 5. Record results (optional, if building a report)
For each meaningful group, `webmobai_add_test_result` under category **`Content`** (`category` is a free string — this is a convention, not an enum; `title`, `status`, `category`, and `description` are all required):
- `pass` — signal present and well-formed.
- `warning` — the `low` and `info` findings (length out of range, missing canonical, multiple h1, missing robots/sitemap, missing OG/Twitter).
- `fail` — the `high` and `medium` findings (`title-missing`, `meta-description-missing`, `h1-missing`, `viewport-meta-missing`, `json-ld-invalid`) and any broken internal link.

### 6. Report (optional)
If the user wants a deliverable, `webmobai_generate_report` with the audited URL as the primary URL. For a quick "is my SEO ok?" the grouped text summary is usually enough — skip the report.

### 7. Close
`webmobai_close_browser`.

## Tools Used

- `mcp__webmobai__webmobai_launch_browser`
- `mcp__webmobai__webmobai_navigate`
- `mcp__webmobai__webmobai_seo_audit`
- `mcp__webmobai__webmobai_check_broken_links`
- `mcp__webmobai__webmobai_add_test_result` *(optional, category `Content`)*
- `mcp__webmobai__webmobai_generate_report` *(optional)*
- `mcp__webmobai__webmobai_close_browser`

## Output

Grouped findings plus link results:

```
SEO AUDIT — https://example.com/pricing
  High (1):
    - title-missing — Page has no <title>.
  Medium (2):
    - meta-description-missing — No <meta name=description>.
    - h1-missing — No <h1> on the page.
  Low (2):
    - canonical-missing — No <link rel=canonical>.
    - title-too-short — Title is 18 chars (recommended 30-60).
  Info (1):
    - og-image-missing — No og:image — social link previews won't show a thumbnail.

BROKEN LINKS — checked 34/41 same-origin links (41 = all http(s) links; 34 same-origin after dedupe)
  - 404 https://example.com/pricing/enterprise (Not Found)
  - 500 https://example.com/api/status (Internal Server Error)
```

## Tips & Gotchas

- **Same-origin, capped.** The link check only tests links to the page's own origin and stops at `max_links` (default 50, clamped 1–100). It will **not** crawl the whole site or check outbound links. For multi-page coverage, run `exploring-web-app` first, then this skill per interesting page.
- **HEAD requests.** Broken-link checks use HEAD with a 5 s timeout and `failOnStatusCode: false`. A few servers reject HEAD outright (405) or are slow — a `405` or a `0`/timeout may be a server quirk, not a dead link. Spot-check before alarming the user.
- **No alt-text here.** `seo_audit` skips image alt attributes by design — route alt-text and heading-order-for-screen-readers questions to `auditing-web-accessibility`.
- **Only three social tags are graded.** The audit reads `og:title`, `og:description`, `og:image`, `og:url`, `og:type`, `twitter:card`, `twitter:title`, `twitter:description`, and `twitter:image`, but emits findings for exactly three of them — `og-title-missing`, `og-image-missing`, `twitter-card-missing`. A missing `og:description` or `og:url` produces **no finding at all**. Don't tell the user their OG tags are complete because the audit was quiet; check the page yourself if social previews are the point.
- **Per-page, not per-site.** Every metric (title, canonical, h1) is for the currently loaded page. Audit the page the user actually cares about.
- **Headings beyond `<h1>` are not checked.** The audit counts `<h1>` elements only. Heading *order* (an `<h3>` following an `<h1>`) is not evaluated anywhere in this tool — `auditing-web-accessibility` is the place for that.
- **robots/sitemap is a liveness check, not a content check.** It GETs `<origin>/robots.txt` and `<origin>/sitemap.xml` and flags a non-`ok()` response. It never parses either file, so a robots.txt that `Disallow: /`s the whole site reports as present and healthy. A sitemap index at a non-default path also reports `sitemap-missing`.
- **file:// fixtures.** `webmobai_check_broken_links` returns an explicit `Broken-link check skipped — page URL is not http(s).` The `seo_audit` robots/sitemap fetch, by contrast, is **silently** skipped on a non-http origin — no finding, no note. Don't read that silence as "robots.txt exists."
- **info ≠ broken.** Missing OG/Twitter tags are polish, not errors. Don't inflate them into failures.

## Example Invocations

User: *"Run an SEO audit on https://example.com/blog/launch."*
→ Launch, navigate, `seo_audit`, `check_broken_links`, report grouped findings. No HTML report unless asked.

User: *"Are there any broken links on my docs homepage? https://docs.example.com"*
→ Focus on `check_broken_links` (still run `seo_audit` for context). Note it's same-origin and capped at 50 unless they raise `max_links`.

User: *"Check my Open Graph and meta tags for https://shop.example.org."*
→ `seo_audit` is the star; call out the OG/Twitter/canonical/description findings specifically, and state that only `og:title`, `og:image`, and `twitter:card` produce findings — silence on `og:description` or `og:url` means "not checked," not "present."

User: *"Is my SEO ok, and do I have missing alt text?"*
→ Run this skill for the SEO/content signals, then hand off to `auditing-web-accessibility` for the alt-text check — say explicitly that `seo_audit` doesn't cover alt attributes.
