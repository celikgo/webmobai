---
name: exploring-web-app
description: Use when the user wants to discover the surface area of an unfamiliar website — what pages exist, what features are on them, what's broken, what's worth testing next. Crawls internal links, summarizes each page, builds a site map. Triggers on "explore the site", "map the site", "discover pages", "what's on this site", "crawl", "find all pages", "site map", "discover the app", "audit unfamiliar site".
---

# Exploring a Web App

## Overview

This skill autonomously discovers the structure of a website — its pages, navigation, key interactive surfaces, and obvious problems — and produces a structured map plus an HTML report. It's a *reconnaissance* skill: the output feeds into more targeted skills (`testing-web-forms`, `auditing-web-accessibility`, etc.) once you know what's worth testing.

Use it as the first pass on an unfamiliar site, when the user inherited a codebase, or when scoping a larger QA engagement. Don't use it when the user already knows exactly what they want tested.

## When to Use

- "Explore https://example.com"
- "Map out the site"
- "What's on this site?"
- "Find all the pages"
- "Audit the surface area"
- "I'm new to this codebase — show me what the app does"

For specific testing of known pages, use `testing-web-app` (full audit), `running-web-smoke-test` (quick check), or the focused audit skills.

## Inputs You Need

1. **Starting URL** (required) — the entry point. Typically the homepage.
2. **Crawl depth** — default 2 (homepage + pages linked from homepage). Higher depths grow fast; ask before going beyond 3.
3. **Page cap** — default 15. Hard stop, ask before raising.
4. **Origin policy** — stay on the same origin (default) or follow specific subdomains. Never crawl external links.
5. **Auth** — if any portion of the site is gated, ask whether to log in and where to stop (e.g., explore public pages only, or crawl the dashboard authenticated). See "Behind a login?" below.
6. **Goal** — what should the map highlight? Common goals: "find pages with forms", "list pages with console errors", "rank pages by perf concern", "discover all admin pages". This shapes what you record per page.

### Behind a login?

Crawls hit auth walls harder than any other skill: a single 302 to `/login` turns dozens of distinct URLs into the same login page, and the map silently fills with duplicates. Detect it early — the post-redirect final URL is `/login` / `/signin` / carries `?next=`, or a password input shows up on pages that shouldn't have one.

Don't hand-drive a login mid-crawl. Launch with `storage_state_path: "auth.json"` so every page in the crawl is already authenticated (CLI: `--storage-state`), and capture that file once via `testing-web-authenticated-sessions`. Two crawl-specific consequences: dedupe on the **post-redirect** URL so a session expiring mid-crawl shows up as a run of identical `/login` records rather than real pages, and treat an authenticated crawl as *inside* the blast radius — see the destructive-URL rules below, which matter far more once you are logged in.

## Workflow

### 1. Launch
`webmobai_launch_browser`, `headless: false` (the user often wants to see what's being crawled), `record_video: false` (long crawls produce huge videos — usually not worth the disk).

### 2. Seed the queue
Maintain a simple in-memory queue:
- `to_visit`: list of URLs to crawl (start: `[start_url]`)
- `visited`: set of URLs already crawled (start: empty)
- `pages`: list of per-page records (start: empty)

### 3. Crawl loop
Until `to_visit` is empty or `len(visited) >= page_cap`:

1. Pop the next URL.
2. `webmobai_navigate` to it. If navigation fails, record the failure and move on.
3. Wait for the page to settle.
4. **Record the page**:
   - URL (final, post-redirect)
   - Page title
   - `webmobai_get_page_state` — DOM summary (headings, links, forms, buttons, images)
   - `webmobai_check_errors` — console errors, broken images
   - `webmobai_screenshot` with a description (`"Crawl page 3: /pricing"`)
   - Optional, if the user's goal warrants it: `webmobai_get_performance_metrics` or `webmobai_accessibility_audit` (these slow the crawl significantly — only do them if scoped)
5. **Extract internal links** with `webmobai_get_links`. Filter to same origin. Add un-visited ones to `to_visit`, respecting depth.
6. **Tag features**: from the page state, tag the page with what's on it:
   - `has_form` (any `<form>` or input)
   - `has_login` (password input or "sign in" text)
   - `has_video` (`<video>` element)
   - `has_iframe` (third-party embeds)
   - `has_modal` (text suggests modals or known modal containers)
   - `has_errors` (broken images or console errors detected)
7. Mark URL as visited, push the page record.

### 4. Site map synthesis
After the crawl, structure your findings:

- **By depth**: depth 0 = homepage, depth 1 = direct links, etc.
- **By section**: group by URL path prefix (`/blog/*`, `/docs/*`, `/account/*`).
- **By feature**: list pages with forms, pages with videos, pages with errors.
- **By health**: green (no console errors, no broken images), yellow (warnings), red (errors).

### 5. Recommendations
Based on what you found, suggest next steps:
- Pages with forms → "Run `testing-web-forms` on /signup, /contact"
- Pages with errors → "Investigate /pricing — console error on load"
- Heavy pages → "Run `auditing-web-performance` on /product/* (LCP looks high)"
- Pages with complex interactive surfaces → "Run `auditing-web-accessibility` on /dashboard"
- Pages that turned out to be `auth-required` → "Capture a session once via `testing-web-authenticated-sessions`, then re-crawl with `storage_state_path`"
- A crawl worth repeating → "Turn the healthy paths into scenario JSON with `authoring-web-scenarios`, then wire them into a suite as a CI gate with `running-web-ci-suites`". A crawl is a one-off; a suite is what catches the regression next week.

### 6. Report
`webmobai_generate_report`. The report's `pagesExplored` list is built **only** from URLs recorded by `webmobai_add_test_result` — navigating to a page does not register it. So call `webmobai_add_test_result` once per crawled page (`category: "Navigation"`, `title: "Crawled /pricing"`, `status: "pass"` or `"fail"` based on errors), or the report will say zero pages were explored.

### 7. Close
`webmobai_close_browser`.

## Crawl Heuristics

- **Prioritize**: nav links over footer links, footer links over body links. Nav is usually the canonical app structure.
- **Deduplicate aggressively**: strip query params unless they change content (`?lang=fr` does, `?utm_*` doesn't). Hash fragments (`#section`) are almost always same-page anchors — skip.
- **Skip patterns**:
  - File downloads (`.pdf`, `.zip`, `.csv`, etc.) — the browser will trigger a download, not a navigation
  - `mailto:`, `tel:`, `javascript:` URLs
  - URLs containing `:id` placeholder values or test fixtures
- **Destructive URLs — hard skip list.** A crawler follows links; a link is all it takes to fire a side effect. Never navigate to these unless the user explicitly named them:
  - **Session-destroying**: `/logout`, `/sign-out`, `/signout`, `/session/destroy`, `/signin/destroy`. Following one ends the authenticated crawl and every subsequent page records as `/login`.
  - **State-destroying**: anything matching `delete`, `remove`, `destroy`, `revoke`, `cancel`, `deactivate`, `reset`, `purge`, `archive`, `unsubscribe`, `close-account`.
  - **Transactional**: `/checkout`, `/pay`, `/subscribe`, `/upgrade`, `/invite`, `/send`. GET on these is usually a form page, but not always.
  - **Admin one-click actions**: `?action=`, `?confirm=`, `?token=` query params on an otherwise ordinary path.

  This list is *load-bearing when authenticated* — logged out, `/delete-account` is a redirect to the login page; logged in, it can be a real deletion. When in doubt, record the URL in the map as `skipped (destructive)` and let the user decide. Never "test" a destructive path to see what it does.
- **Pagination**: if the site has `/blog/page/2`, `/page/3`, etc., crawl the first 2 paginated pages then stop — pagination usually reveals duplicate page types.
- **Infinite scroll**: don't try to exhaust infinite-scroll feeds. Crawl the initial state.
- **Same-page anchors**: links to `#foo` on the current URL are not new pages — skip.

## What to Capture per Page

Minimum record (always):

```
url:           https://example.com/pricing
title:         "Pricing — Example"
depth:         1
status:        ok | error | redirect | auth-required
console_errors: 0
broken_images:  0
headings:      ["Pricing", "Plans", "FAQ"]
links_out:     12 internal, 4 external
forms:         1 (contact form at bottom)
features:      [has_form, has_video]
screenshot:    /var/folders/…/webmobai-1747050000000-a1b2c3/screenshots/screenshot-3-1747050012345.png
```

Record whatever path `webmobai_screenshot` returned. Every artifact for a session lands under one `<os.tmpdir()>/webmobai-<ts>-<rand>/` directory — `screenshots/screenshot-<n>-<ts>.png` for viewport shots, `full-<n>-<ts>.png` for full-page.

Extended record (when the user's goal warrants):
- Performance metrics (LCP, FCP, CLS) — adds ~1-2s per page
- Accessibility issue count — adds ~1s per page
- First H1 and meta description (useful for content audits)

## Tools Used

- `mcp__webmobai__webmobai_launch_browser`
- `mcp__webmobai__webmobai_navigate`
- `mcp__webmobai__webmobai_get_page_state`
- `mcp__webmobai__webmobai_get_links`
- `mcp__webmobai__webmobai_check_errors`
- `mcp__webmobai__webmobai_screenshot`
- `mcp__webmobai__webmobai_add_test_result`
- `mcp__webmobai__webmobai_generate_report`
- `mcp__webmobai__webmobai_close_browser`

Optional:
- `mcp__webmobai__webmobai_accessibility_audit`
- `mcp__webmobai__webmobai_get_performance_metrics`
- `mcp__webmobai__webmobai_evaluate` (for custom extractions, e.g., meta tags)
- `mcp__webmobai__webmobai_wait_for` (when SPAs need extra settle time)

## Output

End-of-turn summary:

```
Crawl complete — https://example.com (12 pages, depth 2)
  Site map:
    /                     [homepage]
    ├── /pricing          [has_form]
    ├── /blog             → /blog/post-1, /blog/post-2
    ├── /docs             → /docs/getting-started, /docs/api
    ├── /signup           [has_form, has_login]
    ├── /login            [has_form, has_login]
    └── /contact          [has_form]
  Health:
    9 green, 2 yellow, 1 red
    /pricing — console error on load: "TypeError in pricing-widget.js:12"
    /blog — broken image: /static/blog-hero.png
  Recommended next steps:
    1. `testing-web-forms` on /signup and /contact
    2. Investigate /pricing console error (likely the widget)
    3. `auditing-web-performance` on /docs/* — they look JS-heavy
    4. `authoring-web-scenarios` → `running-web-ci-suites` to lock the healthy paths into a CI gate
  Report: /var/folders/…/webmobai-1747050000000-a1b2c3/report-1747050099000.html
```

## Tips & Gotchas

- **Crawls scale badly**. 15 pages at 5s each is ~80s. Adding a11y + perf per page bumps that to ~2-3min. Tell the user the time estimate before starting larger crawls.
- **Same-page SPA routes**: many SPAs change the URL via History API without a full navigation. `webmobai_navigate` handles these correctly, but `webmobai_get_links` may return only the currently-rendered links. For very dynamic sites, you may miss routes that only appear after interaction.
- **Login walls**: if you hit a 401/302 to login, mark the page as `auth-required` and skip — don't try to log in mid-crawl unless the user authorized it. The durable fix is to relaunch the whole crawl with `storage_state_path` (`testing-web-authenticated-sessions`), not to log in halfway through: a crawl that changes auth state partway produces a map where half the records are unreachable to the other half.
- **A session expiring mid-crawl looks like a broken site.** Every remaining page starts recording as the same `/login` title with zero errors. If the health view suddenly goes uniform, check the final URLs before writing up "the app is fine".
- **Rate limiting / WAFs**: if the site rate-limits or you start getting 429s, slow down (don't add explicit sleeps; the network-idle wait usually paces you, but consider lowering the page cap).
- **Robots.txt etc.**: the tool does not respect `robots.txt`. The user is responsible for ensuring they have authorization to crawl. Surface this if crawling a non-owned site.
- **Visited set**: deduplicate on the *post-redirect* final URL, not the requested URL. Otherwise `/a → /b` and `/b` get treated as two pages.
- **Don't follow logout or destructive links**. See the hard skip list under Crawl Heuristics. Logging yourself out mid-crawl silently invalidates every page after it; a `?action=delete` link does something you can't undo. This is the single highest-consequence rule in this skill once the crawl is authenticated.
- **Trailing slashes & case**: `/about` and `/about/` and `/About` are often the same page. Normalize when deduplicating.

## Example Invocations

User: *"Explore https://example.com — I just inherited this site."*
→ Default crawl: depth 2, 15-page cap. Produce a structured map and recommend follow-up skills.

User: *"Map out the docs at https://docs.example.com — find every page with a code example."*
→ Crawl with a tagged extraction: at each page, run `webmobai_evaluate` to count `<pre><code>` blocks. Report pages with examples and their counts.

User: *"Crawl my staging site and tell me which pages are broken."*
→ Standard crawl, but emphasize the "health" view: red pages get the headline.

User: *"Find all the pages with forms behind the login."*
→ Ask whether a saved session already exists. If not, capture one via `testing-web-authenticated-sessions`, then launch with `storage_state_path` and crawl from the post-login landing page with the destructive skip list armed. Tag pages with `has_form`. Report the tagged list.
