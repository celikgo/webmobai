---
name: auditing-web-lighthouse
description: Use when the user wants official Google Lighthouse 0-100 category scores (Performance, Accessibility, Best Practices, SEO) rather than WebMobAI's built-in raw metrics. Triggers on "lighthouse", "lighthouse score", "official score", "0-100", "web.dev score", "PageSpeed-style", "audit score out of 100", "score out of 100".
---

# Auditing a Web Page with Lighthouse

## Overview

This skill runs the **official Google Lighthouse** engine against a URL and surfaces the four canonical category scores on the familiar **0-100 scale**: Performance, Accessibility, Best Practices, and SEO — plus the lowest-scoring individual audits so the user knows what to fix first.

Reach for this skill when the user wants the *same number web.dev / PageSpeed Insights shows* — a headline score they can quote or track over time. It is **not** the same as `auditing-web-performance`, which reports WebMobAI's own raw Web Vitals (LCP, FCP, CLS, TTI, INP, TTFB) measured through the live Playwright session. Rough rule:

- **Want a 0-100 headline score / "the Lighthouse number"?** → this skill.
- **Want actual millisecond LCP/CLS/INP, throttled or multi-run, at specific viewports?** → `auditing-web-performance`.
- **Want a deep WCAG a11y breakdown or PWA installability?** → `auditing-web-accessibility` / `webmobai_pwa_audit`.

The two are complementary — Lighthouse gives the score, the raw-metrics skill gives the diagnosis. It's fine to run both.

## When to Use

Trigger keywords: lighthouse, lighthouse score, official score, out of 100, web.dev, PageSpeed-style, "what's our Lighthouse".

## Important: Lighthouse is an Optional Dependency

`lighthouse` and `chrome-launcher` ship as **optionalDependencies**. If they weren't installed (e.g. `npm install --no-optional`), `webmobai_lighthouse_audit` returns install instructions instead of scores — it does not crash. When you see that message, relay it to the user verbatim and tell them to run:

```
npm install lighthouse chrome-launcher
```

from the `mcp-server/` directory, then retry. Do not fake or estimate scores when the dependency is absent.

## Browser Lifecycle (exception to the usual rule)

Lighthouse spawns and drives its **own** headless Chrome via chrome-launcher, so it does **not** need `webmobai_launch_browser`. Two ways to run it:

- **URL provided** → call `webmobai_lighthouse_audit` with `url` directly. No browser launch needed. This is the simplest path.
- **"audit this page" with no URL** → the tool falls back to the current page URL, so a browser must already be launched. Otherwise it asks for a `url`.

Prefer passing an explicit `url`. Only launch/close a browser if you're already in a session for other reasons.

## Inputs You Need

1. **URL** (required unless a browser is already on the target page). The only argument the tool accepts.
2. Nothing else — Lighthouse configures its own Chrome flags, throttling, and form factor internally. There are no viewport/network options on this tool.

## Workflow

### 1. Run the audit
`webmobai_lighthouse_audit` with `url` set to the target. If no URL and you're mid-session, omit `url` to score the current page. This can take 10-40s — Lighthouse launches Chrome, loads the page, and runs every audit.

### 2. Handle the unavailable case
If the response is the install-instructions message (not a score table), stop: report that Lighthouse isn't installed, give the `npm install lighthouse chrome-launcher` command, and do not proceed.

### 3. Read the scores
The tool returns a markdown table of the four categories scored 0-100 with a rating each:
- **90-100 → Good**, **50-89 → Needs Improvement**, **0-49 → Poor**.
- A category may show `n/a` if Lighthouse couldn't compute it — report it as such, don't guess.

### 4. Surface the lowest-scoring audits
The response lists up to 8 worst individual audits (worst first), each with its own 0-100 and Lighthouse audit id. These are the concrete fix-list — relay them, they're the actionable part.

### 5. (Optional) Record results for a report
If this is part of a larger session that will produce a report, log each category with `webmobai_add_test_result` under the `Performance` category (or `Accessibility` for the a11y score), mapping Good→`pass`, Needs Improvement→`warning`, Poor→`fail`. Then `webmobai_generate_report`. For a one-off "what's our score" ask, skip the report and just relay the table.

### 6. Close (only if you launched)
If you launched a browser in step 1, call `webmobai_close_browser`. If you ran with an explicit URL and no session, there's nothing to close.

## Tools Used

- `mcp__webmobai__webmobai_lighthouse_audit` — the whole job; returns the 0-100 score table + lowest audits, or install instructions if the optional dep is missing.
- `mcp__webmobai__webmobai_add_test_result` *(optional, only when feeding a report)*
- `mcp__webmobai__webmobai_generate_report` *(optional, only when a report deliverable is wanted)*
- `mcp__webmobai__webmobai_launch_browser` / `mcp__webmobai__webmobai_close_browser` *(only if scoring "the current page" without a URL)*

## Output

A concrete relay of the tool's markdown, e.g.:

```
LIGHTHOUSE — https://example.com

| Category       | Score | Rating            |
|----------------|-------|-------------------|
| Performance    |  74   | Needs Improvement |
| Accessibility  |  92   | Good              |
| Best Practices |  83   | Needs Improvement |
| SEO            | 100   | Good              |

Lowest-scoring audits (worst first):
  - [0]  Eliminate render-blocking resources (render-blocking-resources)
  - [31] Properly size images (uses-responsive-images)
  - [45] Serve images in next-gen formats (uses-webp-images)
  - [60] Avoid enormous network payloads (total-byte-weight)
```

## Tips & Gotchas

- **Not a replacement for the raw-metrics skill.** Lighthouse's Performance score is a weighted composite, lab-throttled to a simulated mid-tier mobile — it will differ from `auditing-web-performance`'s live-session numbers. Say so if the user compares them; neither is "wrong".
- **No PWA score here.** Despite Lighthouse historically having a PWA category, this tool returns only Performance, Accessibility, Best Practices, and SEO. For PWA installability use `webmobai_pwa_audit`.
- **Scores fluctuate.** Lighthouse Performance varies run-to-run (network/CPU noise). For a stable trendline, run it a few times or lean on `auditing-web-performance`'s `run_perf_multi` aggregation for the raw side.
- **Lab, not field.** These are synthetic lab scores from one clean Chrome launch — not real-user (RUM) data.
- **No auth support.** Lighthouse loads the URL cold in its own Chrome with no cookies from your session, so it can't audit pages behind a login. For gated pages, note that limit and offer the raw-metrics skill (which uses the authenticated Playwright session) instead.
- **URL beats session.** Passing an explicit `url` is the reliable path — the current-page fallback only works when a browser is already launched and navigated.

## Example Invocations

User: *"What's the Lighthouse score for https://example.com?"*
→ Call `webmobai_lighthouse_audit` with that URL, relay the four-category table plus the lowest audits. No browser launch, no report.

User: *"Give me the official 0-100 scores for our landing page, and flag anything Poor."*
→ Run the audit, then call out every category rated Poor (0-49) and the worst individual audits driving it down.

User: *"Run Lighthouse — oh, and it says it's not installed?"*
→ Relay the install-instructions message verbatim: `npm install lighthouse chrome-launcher` in `mcp-server/`, then retry. Don't estimate scores.

User: *"Is our LCP actually fast, in milliseconds?"*
→ Wrong skill — that's raw Web Vitals. Hand off to `auditing-web-performance`; Lighthouse only gives the composite 0-100 Performance score, not millisecond LCP.
