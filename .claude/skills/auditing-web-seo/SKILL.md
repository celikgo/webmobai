---
name: auditing-web-seo
description: Use when the user wants an SEO + content audit of a page — title/meta description, Open Graph, canonical, headings, viewport, structured data — plus a same-origin broken-link check. Triggers on "SEO audit", "meta tags", "Open Graph", "canonical", "broken links", "check links", "missing alt text", "heading structure", "is my SEO ok", "content audit".
---

# Auditing Web SEO & Content

## Overview

This skill runs two read-only, observation-based checks on a loaded page:

1. **`webmobai_seo_audit`** — on-page SEO/content hygiene: `<title>` and meta-description length, Open Graph / Twitter card meta, `<link rel=canonical>`, `<h1>` count, viewport meta, JSON-LD structured-data validity, and `/robots.txt` + `/sitemap.xml` presence.
2. **`webmobai_check_broken_links`** — HEAD-tests the page's internal links and reports any 4xx/5xx.

It reports findings grouped by severity (high / medium / low / info). It is a **hygiene check, not a ranking prediction** — it can't tell you where you'll rank, only whether the machine-readable SEO signals are present and well-formed.

**Alt-text note:** `seo_audit` does **not** inspect image `alt` attributes despite that being a common SEO ask. Missing alt text is caught by `auditing-web-accessibility` (it's primarily an a11y concern) — hand off there if that's the focus.

## When to Use

Trigger keywords: SEO audit, meta tags, Open Graph, canonical, broken links, check links, heading structure, content audit, "is my SEO ok".

Use `auditing-web-accessibility` instead for deep alt-text / ARIA / contrast work. Use `testing-web-app` if the user wants SEO folded into a full multi-check report.

## Inputs You Need

1. **URL** (required). The specific page to audit — SEO signals are per-page, so audit the page that matters (a landing page, a product page), not just the homepage.
2. **Check robots/sitemap?** (optional). Defaults on. Turn off (`check_robots_and_sitemap: false`) if the origin is a fixture or you want zero extra network requests.
3. **Broken-link cap** (optional). Defaults 50, max 100.
4. **Login required?** If the target page is gated, ask for credentials — never invent them.

## Workflow

### 1. Launch
`webmobai_launch_browser` with `headless: false` (let the user watch), `record_video: false` (an audit doesn't need replay evidence).

### 2. Navigate
`webmobai_navigate` to the URL. Confirm you landed on the real page (not a redirect to login / an error page) — SEO findings on the wrong page are worthless.

### 3. SEO audit
`webmobai_seo_audit`. Optionally pass `check_robots_and_sitemap: false`. It returns findings grouped high / medium / low / info. Interpret roughly:
- **high** — missing `<title>` (fix now).
- **medium** — missing meta description, missing `<h1>`, missing viewport meta, invalid JSON-LD.
- **low** — title/description length out of the 30–60 / 70–160 char ranges, missing canonical, multiple `<h1>`, missing robots/sitemap.
- **info** — missing og:title, og:image, twitter:card (social-preview polish).

### 4. Broken-link check
`webmobai_check_broken_links` with `max_links` (default 50). **Same-origin only** — it collects `<a href>` links that share the page's origin, dedupes, caps at the limit, and HEAD-tests each. External links are intentionally not followed. Report the checked/total ratio and any status ≥ 400 (or `0` = request error/timeout).

### 5. Record results (optional, if building a report)
For each meaningful group, `webmobai_add_test_result` under category **`Content`**:
- `pass` — signal present and well-formed.
- `warning` — low/info findings (length out of range, missing OG, missing canonical).
- `fail` — missing title, missing description, missing h1, invalid JSON-LD, or any broken internal link.

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
    - og-image-missing — Social previews won't show a thumbnail.

BROKEN LINKS — checked 34/41 same-origin links
  - 404 https://example.com/pricing/enterprise
  - 500 https://example.com/api/status (Internal Server Error)
```

## Tips & Gotchas

- **Same-origin, capped.** The link check only tests links to the page's own origin and stops at `max_links` (default 50, hard max 100). It will **not** crawl the whole site or check outbound links. For multi-page coverage, run `exploring-web-app` first, then this skill per interesting page.
- **HEAD requests.** Broken-link checks use HEAD with a 5s timeout. A few servers reject HEAD (405) or are slow — a `0`/timeout result may be a server quirk, not a dead link. Spot-check before alarming the user.
- **No alt-text here.** `seo_audit` skips image alt attributes by design — route alt-text and heading-order-for-screen-readers questions to `auditing-web-accessibility`.
- **Per-page, not per-site.** Every metric (title, canonical, h1) is for the currently loaded page. Audit the page the user actually cares about.
- **file:// fixtures.** robots/sitemap fetch and the link check are skipped for non-http(s) URLs — you'll see a "skipped" note, not a failure.
- **info ≠ broken.** Missing OG/Twitter tags are polish, not errors. Don't inflate them into failures.

## Example Invocations

User: *"Run an SEO audit on https://example.com/blog/launch."*
→ Launch, navigate, `seo_audit`, `check_broken_links`, report grouped findings. No HTML report unless asked.

User: *"Are there any broken links on my docs homepage? https://docs.foo.com"*
→ Focus on `check_broken_links` (still run `seo_audit` for context). Note it's same-origin and capped at 50 unless they raise `max_links`.

User: *"Check my Open Graph and meta tags for https://shop.bar.com."*
→ `seo_audit` is the star; call out the OG/Twitter/canonical/description findings specifically.

User: *"Is my SEO ok, and do I have missing alt text?"*
→ Run this skill for the SEO/content signals, then hand off to `auditing-web-accessibility` for the alt-text check — say explicitly that `seo_audit` doesn't cover alt attributes.
