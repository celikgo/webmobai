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

`lighthouse` (`^12.4.0`) and `chrome-launcher` (`^1.1.2`) are declared under **`optionalDependencies`** in `mcp-server/package.json`. They are **dynamically imported at first use**, not at server start — so a missing package produces no startup error and every other WebMobAI tool keeps working. You only find out when you call the audit.

Three distinct outcomes, and they read differently:

1. **Missing (or unloadable) dependency** — either package absent, or `lighthouse` resolving without a default export. The tool returns a normal text response, **not** an MCP error, beginning exactly:
   ```
   Lighthouse is not installed (or failed to load). Install with:
     npm install lighthouse chrome-launcher
   Then retry.
   ```
   followed by `Underlying error: <detail>` when there is one. Relay it verbatim.
2. **Installed but the run failed** (Chrome couldn't launch, the page never loaded, Lighthouse returned no result) — the response starts `Lighthouse audit failed: <message>`. That is *not* an install problem; don't send the user to npm for it.
3. **No URL and no launched browser** — `Provide a `url` argument, or launch a browser first so we can audit the current page.` Also not an install problem.

The install command runs from the `mcp-server/` directory:

```
npm install lighthouse chrome-launcher
```

Do not fake, estimate, or interpolate scores when the dependency is absent. "Roughly 70s" is worse than "not installed".

**Check it before you need it**: `webmobai-doctor` reports Lighthouse as its own optional check — `✓ Lighthouse (optional): installed — official scores available`, or a `!` warning carrying the same install command. It exits 0 either way, since Lighthouse is optional. If the user hits case 1 or 2 above and the install doesn't resolve it, hand off to `troubleshooting-webmobai-setup`.

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
Check which of the three outcomes above you got. If it's the install-instructions message, stop: report that Lighthouse isn't installed, give the `npm install lighthouse chrome-launcher` command, and do not proceed. If it's `Lighthouse audit failed:`, the dependency is fine — report the underlying message instead of prescribing an install.

### 3. Read the scores
The response is markdown headed `# Lighthouse — <fetchedUrl>` (the **final** URL after redirects, which may differ from what you passed — worth noting if it does), then `## Scores (0-100, higher is better)` and a `| Category | Score | Rating |` table:
- **90-100 → Good**, **50-89 → Needs Improvement**, **0-49 → Poor**.
- A category Lighthouse couldn't compute renders as `| Category | n/a | — |`. Report it as n/a; don't guess or omit the row.

### 4. Surface the lowest-scoring audits
A `## Lowest-scoring audits` section lists up to **8** individual audits, worst first, formatted `- [<score×100>] <Title> (\`<audit-id>\`)`. Only audits with a numeric score **below 1** appear — so a page scoring perfectly on everything Lighthouse graded shows **no such section at all**, which is a pass signal, not a truncated response. These are the concrete fix-list; relay them, they're the actionable part.

The response ends with the italic line `_(Lighthouse complements WebMobAI's per-axis tools; it does not replace them.)_` — you can drop that when summarizing.

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

````
# Lighthouse — https://example.com/

## Scores (0-100, higher is better)

| Category | Score | Rating |
|---|---|---|
| Performance | 74 | Needs Improvement |
| Accessibility | 92 | Good |
| Best Practices | 83 | Needs Improvement |
| SEO | 100 | Good |

## Lowest-scoring audits
- [0] Eliminate render-blocking resources (`render-blocking-resources`)
- [31] Properly size images (`uses-responsive-images`)
- [45] Serve images in next-gen formats (`uses-webp-images`)
- [60] Avoid enormous network payloads (`total-byte-weight`)

_(Lighthouse complements WebMobAI's per-axis tools; it does not replace them.)_
````

## Tips & Gotchas

- **Not a replacement for the raw-metrics skill.** Lighthouse's Performance score is a weighted composite, lab-throttled to a simulated mid-tier mobile — it will differ from `auditing-web-performance`'s live-session numbers. Say so if the user compares them; neither is "wrong".
- **No PWA score here.** Despite Lighthouse historically having a PWA category, this tool returns only Performance, Accessibility, Best Practices, and SEO. For PWA installability use `webmobai_pwa_audit`.
- **Scores fluctuate.** Lighthouse Performance varies run-to-run (network/CPU noise). For a stable trendline, run it a few times or lean on `auditing-web-performance`'s `run_perf_multi` aggregation for the raw side.
- **Lab, not field.** These are synthetic lab scores from one clean Chrome launch — not real-user (RUM) data.
- **No auth support, and no workaround.** Lighthouse loads the URL cold in its own chrome-launcher Chrome with no cookies from your Playwright session — `storage_state_path` has no effect on it. For gated pages the honest answer is "Lighthouse can't score this"; offer `auditing-web-performance` instead, which *can* run inside an authenticated session (see `testing-web-authenticated-sessions` for capturing one).
- **Setup problems belong elsewhere.** Repeated `Lighthouse audit failed:` responses, Chrome refusing to launch, or the install not sticking are environment issues — run `webmobai-doctor` and hand off to `troubleshooting-webmobai-setup` rather than retrying the audit.
- **URL beats session.** Passing an explicit `url` is the reliable path — the current-page fallback only works when a browser is already launched and navigated.

## Example Invocations

User: *"What's the Lighthouse score for https://example.com?"*
→ Call `webmobai_lighthouse_audit` with that URL, relay the four-category table plus the lowest audits. No browser launch, no report.

User: *"Give me the official 0-100 scores for our landing page, and flag anything Poor."*
→ Run the audit, then call out every category rated Poor (0-49) and the worst individual audits driving it down.

User: *"Run Lighthouse — oh, and it says it's not installed?"*
→ Relay the install-instructions message verbatim: `npm install lighthouse chrome-launcher` in `mcp-server/`, then retry. Mention `webmobai-doctor` confirms the fix took. Don't estimate scores.

User: *"Lighthouse keeps saying 'audit failed' even though I installed it."*
→ That's outcome 2, not a missing dependency — relay the underlying message, don't re-prescribe npm. Run `webmobai-doctor` to confirm the dependency resolves, then hand off to `troubleshooting-webmobai-setup` for the Chrome-launch side.

User: *"Is our LCP actually fast, in milliseconds?"*
→ Wrong skill — that's raw Web Vitals. Hand off to `auditing-web-performance`; Lighthouse only gives the composite 0-100 Performance score, not millisecond LCP.
