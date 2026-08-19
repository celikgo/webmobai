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
- Pass/fail flow assertions → `verifying-web-flows`
- A broken/ambiguous selector → `debugging-web-selectors`
- Failure/offline/error-state behavior → `testing-web-error-states`
- Security hygiene (CSP/cookies/mixed content) → `auditing-web-security`
- SEO + broken links → `auditing-web-seo`
- PWA / installability → `auditing-web-pwa`
- Official Lighthouse 0-100 scores → `auditing-web-lighthouse`
- Author a reusable scenario from exploration → `authoring-web-scenarios`
- Track regressions over time → `monitoring-web-regressions`
- The site is behind a login → `testing-web-authenticated-sessions`
- Run the result as a CI gate → `running-web-ci-suites`

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
2. **Auth** (optional). If the site needs login, ask for credentials or for the path to an already-saved session file. Never assume. See "Behind a login?" below.
3. **Scope** (optional). Default: up to 5 internal pages. Larger sites: confirm a cap before crawling.
4. **Breakpoints** (optional). Default: Mobile 375×812, Tablet 768×1024, Desktop 1280×720. Override if the user has design specs.
5. **Run mode**: headed (default — user can watch) or headless (faster, for CI-style runs).

### Behind a login?

Detect it: `webmobai_navigate` lands on a different final URL than requested (`/login`, `/signin`, `?next=`), or `webmobai_get_page_state` shows a password input and little else.

Don't hand-drive the login every run. Capture the session once and replay it: log in headed, call `webmobai_save_storage_state` with a `path`, then relaunch with `storage_state_path` pointing at that file (CLI equivalent: `--storage-state`). Full procedure, MFA/SSO caveats, and expiry handling live in `testing-web-authenticated-sessions` — hand off there rather than improvising. The file holds session tokens; treat it as a credential.

## Workflow

Run these steps in order. Each step builds on the previous one. Do not skip the report step — the report is the deliverable.

### 1. Launch an isolated browser
Call `mcp__webmobai__webmobai_launch_browser` with `headless: false` so the user can watch, `record_video: true` so the session is preserved. Default viewport `1280×720` unless the user specified otherwise.

> **Why isolated**: each session uses a fresh Chromium profile (no cookies, cache, or extensions) — unless you pass `storage_state_path`, which seeds the context from a saved logged-in session. Cross-session bleed would invalidate Web Vitals and skew accessibility findings tied to logged-in state.

### 2. Land the homepage
Call `webmobai_navigate` with the target URL. The tool waits for DOMContentLoaded + network idle. Confirm the final URL matches the request (catch silent redirects to an error page or login wall).

### 3. Baseline page state
Call `webmobai_get_page_state` to dump the DOM summary (headings, links, forms, buttons, images). This is your map of the page; you will use it to plan interactions.

### 4. Error sweep
Call `webmobai_check_errors` to surface broken images, console errors, and network failures on first load. Record any failures with `webmobai_add_test_result` (`status: "fail"`, `category: "Errors"`).

### 5. Accessibility audit
Call `webmobai_accessibility_audit`. Issues come back grouped by impact (critical / serious / moderate / minor). Add a test result per impact bucket (`status: "fail"` for critical/serious, `"warning"` for moderate/minor). For deep WCAG work, switch to `auditing-web-accessibility` instead — this skill captures the headline numbers only.

### 6. Performance metrics
Call `webmobai_get_performance_metrics`. You get LCP, FCP, CLS (running), CLS at load, TTI, **INP**, TTFB, DOMContentLoaded and load. Six rows carry rating bands (Good / Needs Improvement / Poor) — LCP, FCP, **both** CLS rows, TTI and TTFB — against these thresholds:

| Metric | Good | Needs Improvement | Poor |
|--------|------|-------------------|------|
| LCP    | ≤2500ms | ≤4000ms | >4000ms |
| FCP    | ≤1800ms | ≤3000ms | >3000ms |
| CLS    | ≤0.10   | ≤0.25   | >0.25   |
| TTI    | ≤3800ms | ≤7300ms | >7300ms |
| TTFB   | ≤800ms  | ≤1800ms | >1800ms |

Record one test result per metric. Use `status: "warning"` for "Needs Improvement", `"fail"` for "Poor". Both CLS rows are rated against the CLS thresholds above. Only **INP**, DOM Content Loaded and Page Load Complete print `-` in the Rating column — read them, don't invent thresholds for them. Pass `strict_tti: true` only when the user wants Lighthouse's stricter TTI definition (adds a `ttiStrict` field, costs up to ~15s).

**Optional add-on — official scores.** If the user wants a 0-100 Lighthouse number rather than raw metrics, `webmobai_lighthouse_audit` returns the four official category scores. It spawns its own headless Chrome (so it does not reuse this session's cookies) and requires the optional `lighthouse` + `chrome-launcher` packages; without them it returns an install hint, not a crash. For anything beyond the headline scores, hand off to `auditing-web-lighthouse`.

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

### 9. (Optional) AI executive summary
If `WEBMOBAI_ANTHROPIC_API_KEY` is set, call `webmobai_summarize_audit` (browser must still be open). It rolls up every `add_test_result` recorded this session plus console errors plus a **fresh** a11y audit and perf snapshot, and returns a prioritized markdown summary — top fixes first, plus what's working. Call it *before* `webmobai_close_browser`, and paste the summary into your end-of-turn response.

With no key set, the tool returns `"AI features are disabled. Set WEBMOBAI_ANTHROPIC_API_KEY (and optionally WEBMOBAI_AI_MODEL) to enable."` — a normal response, not an error. Skip the step and say so rather than retrying.

> **Honest limitation**: over MCP the summary comes back as tool text; it is *not* written into the HTML report. The report's embedded "Executive summary" section is populated only when the run goes through the `webmobai-test` CLI, which calls the same summarizer internally.

### 10. Generate the report
Call `webmobai_generate_report` with the original target URL. It re-runs a fresh a11y audit + perf snapshot at call time and writes `report-<ts>.html` plus `junit-<ts>.xml` (pass `junit: false` to skip the XML) into the browser's session directory — not the cwd. The response also prints the Playwright `trace.zip` path. Surface the report path to the user.

### 11. Close cleanly
Call `webmobai_close_browser`. It prints the recorded video path (when `record_video` was on) and the `trace.zip` path — the trace opens at https://trace.playwright.dev for time-travel debugging. Report, video and trace are the user-visible deliverables.

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
- `webmobai_summarize_audit` — AI executive summary; no-ops with a message when `WEBMOBAI_ANTHROPIC_API_KEY` is unset
- `webmobai_lighthouse_audit` — official 0-100 category scores; needs the optional `lighthouse` + `chrome-launcher` packages
- `webmobai_save_storage_state` — persist a logged-in session for later runs (see `testing-web-authenticated-sessions`)

## Output

Everything lands in one session directory: `<os.tmpdir()>/webmobai-<timestamp>-<rand>/`. By the end of a run, the user should have:

1. An **HTML report** — `report-<ts>.html` — summarizing every test result, accessibility issue, performance metric, console error, and pages explored.
2. **JUnit XML** — `junit-<ts>.xml`, written alongside it unless you passed `junit: false`. Drop into CI for native test-result display.
3. A **Playwright trace** — `trace.zip` in the session dir, printed by both `webmobai_generate_report` and `webmobai_close_browser`. Open it at https://trace.playwright.dev.
4. A **session video** — `recordings/*.webm` — of the full headed run, when `record_video` was on.
5. A directory of **screenshots** — `screenshots/screenshot-<n>-<ts>.png` (viewport) and `full-<n>-<ts>.png` (full-page), covering homepage + each breakpoint + each crawled page.
6. A short **end-of-turn summary** from you: pass/fail counts, the report path, the top 3 issues worth fixing first, and the AI executive summary if step 9 ran.

Two report sections come from the CLI, not from this MCP workflow:

- **`report-<ts>.pdf`** — a PDF render of the HTML report. Emitted only by the `webmobai-test` binary, non-fatally (a PDF failure never aborts that run). `webmobai_generate_report` does not produce one.
- **The "vs historical baseline" table** — this-run-vs-median-of-recent-runs, auto-embedded in the report. Also `webmobai-test` only: it is the only entry point that appends to `~/.webmobai/history.json`, and the table appears only once that URL has at least 2 prior runs on record. Over MCP you can still *read* the same data with `webmobai_get_run_history` / `webmobai_check_regressions` — see `monitoring-web-regressions`.

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
- **Auth walls**: if `webmobai_navigate` lands on a login page that you didn't expect, stop and surface this to the user before continuing — don't fabricate credentials. If they have (or want) a saved session, switch to `testing-web-authenticated-sessions` and relaunch with `storage_state_path`; a stale session looks the same as no session (redirect to `/login`), so re-capture rather than debugging the assertions.
- **AI is opt-in and silent when off**: `webmobai_summarize_audit` returns the "AI features are disabled" sentence rather than failing when `WEBMOBAI_ANTHROPIC_API_KEY` is unset. Report that plainly; don't present a missing summary as a tool error.
- **Artifacts live in the session dir, not the cwd**: `webmobai_generate_report` deliberately writes next to the screenshots, recordings, and `trace.zip` under `<os.tmpdir()>/webmobai-<ts>-<rand>/`. Copy anything the user needs to keep — the temp dir is not durable.
- **Crawl politeness**: stay on the same origin. Don't follow external links during the crawl phase — `webmobai_get_links` already separates internal from external.
- **Report once**: each report is timestamped, but generating multiple reports per session clutters the output dir. Generate one final report unless the user explicitly wants intermediates.
- **Video is large**: warn the user if the session is long (>10 min) — the `.webm` can be hundreds of MB.

## Example Invocations

User: *"Test https://example.com and give me a full report."*
→ Run the full workflow, default scope (5 pages, default breakpoints), produce the HTML report, summarize the top issues.

User: *"Audit my landing page at https://launch.example.com — I care most about mobile and a11y."*
→ Same workflow, but extend the breakpoint list to include extra small (iPhone SE 320×568) and tag a11y issues with extra detail in the per-issue test result. Consider also chaining into `auditing-web-accessibility` for a deeper second pass.

User: *"Run a full QA on https://shop.example.com headless, top 10 pages."*
→ Launch with `headless: true`, raise the crawl cap to 10, confirm with the user before exceeding it.

User: *"Audit the logged-in dashboard at https://app.example.com/dashboard."*
→ Navigate first; if it redirects to `/login`, stop and route through `testing-web-authenticated-sessions` to capture `auth.json`, then relaunch with `storage_state_path: "auth.json"` and run the normal workflow from step 2.
