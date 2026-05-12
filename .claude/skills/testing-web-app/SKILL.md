---
name: testing-web-app
description: Use when the user wants a thorough, end-to-end QA pass on a website — exploration, accessibility, performance, responsive layout, error checking, and a final HTML report. This is the master skill that orchestrates the full WebMobAI test workflow. Triggers on "test this site", "full audit", "QA this app", "test the website", "comprehensive test", "audit my site", "run all checks", "complete web test".
---

# Testing a Web App End-to-End

## Overview

This skill drives a complete, autonomous QA pass on a target website using the WebMobAI MCP tools. It opens a clean Chromium browser, explores the site, runs accessibility and performance audits, tests responsive breakpoints, captures evidence (screenshots + video), and produces a self-contained HTML report.

Use it as the default whenever the user asks for "a full test" or "audit" of a web app without specifying a narrower scope. For focused passes, prefer the specialized skills:

- Quick verification → `running-web-smoke-test`
- Accessibility-only → `auditing-web-accessibility`
- Performance-only → `auditing-web-performance`
- Layout only → `testing-web-responsive`
- Form submission flows → `testing-web-forms`
- Visual diff vs baseline → `regression-web-visual`
- Crawl/discover surface → `exploring-web-app`

## When to Use

Invoke this skill when any of these are true:

- The user asks to "test" or "audit" a site without further scope.
- The user wants a deliverable HTML report.
- The user wants screenshots + a video + structured findings in one pass.
- The site is unfamiliar and a broad sweep is needed before targeted work.

Do **not** use this skill if the user only wants a single dimension (a11y, perf, responsive). The full pass takes longer and produces a larger artifact than necessary.

## Inputs You Need

Before starting, confirm or infer:

1. **Target URL** (required). If the user said "test my app" without a URL, ask.
2. **Auth** (optional). If the site needs login, ask for credentials or for a test account. Never assume.
3. **Scope** (optional). Default: up to 5 internal pages. Larger sites: confirm a cap before crawling.
4. **Breakpoints** (optional). Default: Mobile 375×812, Tablet 768×1024, Desktop 1280×720. Override if the user has design specs.
5. **Run mode**: headed (default — user can watch) or headless (faster, for CI-style runs).

## Workflow

Run these steps in order. Each step builds on the previous one. Do not skip the report step — the report is the deliverable.

### 1. Launch an isolated browser
Call `mcp__webmobai__webmobai_launch_browser` with `headless: false` so the user can watch, `record_video: true` so the session is preserved. Default viewport `1280×720` unless the user specified otherwise.

> **Why isolated**: each session uses a fresh Chromium profile (no cookies, cache, or extensions). Cross-session bleed would invalidate Web Vitals and skew accessibility findings tied to logged-in state.

### 2. Land the homepage
Call `webmobai_navigate` with the target URL. The tool waits for DOMContentLoaded + network idle. Confirm the final URL matches the request (catch silent redirects to an error page or login wall).

### 3. Baseline page state
Call `webmobai_get_page_state` to dump the DOM summary (headings, links, forms, buttons, images). This is your map of the page; you will use it to plan interactions.

### 4. Error sweep
Call `webmobai_check_errors` to surface broken images, console errors, and network failures on first load. Record any failures with `webmobai_add_test_result` (`status: "fail"`, `category: "Errors"`).

### 5. Accessibility audit
Call `webmobai_accessibility_audit`. Issues come back grouped by impact (critical / serious / moderate / minor). Add a test result per impact bucket (`status: "fail"` for critical/serious, `"warning"` for moderate/minor). For deep WCAG work, switch to `auditing-web-accessibility` instead — this skill captures the headline numbers only.

### 6. Performance metrics
Call `webmobai_get_performance_metrics`. You get LCP, FCP, CLS, TTI, TTFB plus rating bands (Good / Needs Improvement / Poor) per the Web Vitals thresholds:

| Metric | Good | Needs Improvement | Poor |
|--------|------|-------------------|------|
| LCP    | ≤2500ms | ≤4000ms | >4000ms |
| FCP    | ≤1800ms | ≤3000ms | >3000ms |
| CLS    | ≤0.10   | ≤0.25   | >0.25   |
| TTI    | ≤3800ms | ≤7300ms | >7300ms |
| TTFB   | ≤800ms  | ≤1800ms | >1800ms |

Record one test result per metric. Use `status: "warning"` for "Needs Improvement", `"fail"` for "Poor".

### 7. Responsive check
Call `webmobai_test_responsive` with the agreed breakpoints. The tool screenshots each viewport and flags horizontal overflow. Add a test result per breakpoint.

### 8. Crawl key internal pages
Use `webmobai_get_links` to list internal URLs. Pick up to 4 additional pages (prioritize: pricing, login/signup, contact, about, top-level product pages). For each:

1. `webmobai_navigate` → the page
2. `webmobai_check_errors`
3. `webmobai_screenshot` (with a `description` like "Pricing page — desktop")
4. Optional: `webmobai_accessibility_audit` if the page is structurally different from the homepage
5. `webmobai_add_test_result` with the page-level verdict

> **Stop crawling** when you hit the page cap, run out of useful internal links, or any page hard-fails to load (don't burn time on a broken section).

### 9. Generate the report
Call `webmobai_generate_report` with the original target URL. This produces an HTML file with all findings (test results, a11y issues, perf metrics, screenshots, console errors, pages explored). Surface the report path to the user.

### 10. Close cleanly
Call `webmobai_close_browser`. Surface the saved video path. Both report and video are the user-visible deliverables.

## Tools Used

Primary:
- `mcp__webmobai__webmobai_launch_browser`
- `mcp__webmobai__webmobai_navigate`
- `mcp__webmobai__webmobai_get_page_state`
- `mcp__webmobai__webmobai_check_errors`
- `mcp__webmobai__webmobai_accessibility_audit`
- `mcp__webmobai__webmobai_get_performance_metrics`
- `mcp__webmobai__webmobai_test_responsive`
- `mcp__webmobai__webmobai_get_links`
- `mcp__webmobai__webmobai_screenshot`
- `mcp__webmobai__webmobai_add_test_result`
- `mcp__webmobai__webmobai_generate_report`
- `mcp__webmobai__webmobai_close_browser`

Conditional (use when the site warrants):
- `webmobai_get_interactive_elements` — when the page state isn't enough to plan clicks
- `webmobai_click` / `webmobai_type` / `webmobai_press_key` — when a flow needs interaction
- `webmobai_wait_for` — after navigation that triggers SPA route changes
- `webmobai_evaluate` — for custom assertions (e.g., "are all CTAs above the fold?")
- `webmobai_get_console_errors` — when triaging a noisy console at session end

## Output

By the end of a run, the user should have:

1. An **HTML report** (`webmobai-report-*.html`) summarizing every test result, accessibility issue, performance metric, console error, and pages explored.
2. A **session video** (`.webm`) of the full headed run.
3. A directory of **screenshots** (homepage + each breakpoint + each crawled page).
4. A short **end-of-turn summary** from you: pass/fail counts, the report path, the top 3 issues worth fixing first.

## Reporting Conventions

When you call `webmobai_add_test_result`, follow these category names so the HTML report groups cleanly:

- `Navigation` — page loads, redirects, 404s
- `Errors` — broken images, console errors, network failures
- `Accessibility` — a11y findings (grouped per impact)
- `Performance` — one entry per Web Vital
- `Responsive` — one entry per breakpoint
- `Forms` — only if you exercised forms; otherwise omit
- `Content` — broken links, missing critical content (headings, footer, etc.)

Status meanings (already enforced by the tool's enum):
- `pass` — the check ran and the result is within spec
- `warning` — the result is suboptimal but not user-breaking (e.g., "Needs Improvement" perf, moderate a11y issue, horizontal overflow that doesn't hide content)
- `fail` — user-impacting (page errors, critical a11y, "Poor" perf, content not rendering)

## Tips & Gotchas

- **Don't skip the launch step**: testing/accessibility/reporting tools all error with "Browser is not launched" if you call them before `webmobai_launch_browser`.
- **Re-using sessions**: `webmobai_launch_browser` errors if a browser is already running. Close it first with `webmobai_close_browser` if you need to restart.
- **Network-idle sensitivity**: `webmobai_navigate` waits for network idle. SPAs with long-polling sockets can stall — fall back to `webmobai_wait_for` with a `selector` for a known-stable element if a navigate hangs.
- **Headed vs headless**: headed mode lets the user watch and is the default. Switch to `headless: true` only when the user is running an unattended/CI-style pass.
- **Auth walls**: if `webmobai_navigate` lands on a login page that you didn't expect, stop and surface this to the user before continuing — don't fabricate credentials.
- **Crawl politeness**: stay on the same origin. Don't follow external links during the crawl phase — `webmobai_get_links` already separates internal from external.
- **Report once**: each report is timestamped, but generating multiple reports per session clutters the output dir. Generate one final report unless the user explicitly wants intermediates.
- **Video is large**: warn the user if the session is long (>10 min) — the `.webm` can be hundreds of MB.

## Example Invocations

User: *"Test https://example.com and give me a full report."*
→ Run the full workflow, default scope (5 pages, default breakpoints), produce the HTML report, summarize the top issues.

User: *"Audit my landing page at https://launch.foo.com — I care most about mobile and a11y."*
→ Same workflow, but extend the breakpoint list to include extra small (iPhone SE 320×568) and tag a11y issues with extra detail in the per-issue test result. Consider also chaining into `auditing-web-accessibility` for a deeper second pass.

User: *"Run a full QA on https://shop.example.com headless, top 10 pages."*
→ Launch with `headless: true`, raise the crawl cap to 10, confirm with the user before exceeding it.
