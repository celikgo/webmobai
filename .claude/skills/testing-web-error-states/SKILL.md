---
name: testing-web-error-states
description: Use when the user wants to test how a site behaves under failure — API 500s, empty responses, slow/aborted requests, offline, or a blocked third-party script. Drives request interception and network throttling to force deterministic failures. Triggers on "test error states", "what if the API fails", "mock a 500", "empty state", "offline test", "slow network", "abort request", "block third-party", "simulate failure", "network error handling".
---

# Testing Web Error States

## Overview

This skill forces **deterministic failure conditions** on a page and verifies the app degrades gracefully — the error UI renders, nothing hangs forever, no uncaught exceptions leak to the console. Real backends rarely fail on demand, so we synthesize the failure with request interception (`webmobai_route`) and network throttling (`webmobai_set_network_throttle`).

It covers the failure modes an app should survive:
- **Server errors** — fulfill a matched request with HTTP 500/503/429 and an error body.
- **Empty / malformed data** — fulfill with `[]`, `{}`, or truncated JSON to exercise empty-state and parse-error handling.
- **Aborted requests** — `abort` a request to mimic a connection drop.
- **Offline** — `set_network_throttle` with the `offline` preset.
- **Slow network** — `slow-3g` / `fast-3g` to test loading states and timeouts.
- **Blocked third-party** — `abort` an analytics/ads/widget host to check the app doesn't break without it.

This is **fault injection**, not a load or chaos test — it changes one condition at a time and checks the UI response. For the happy-path form flow, use `testing-web-forms`. For raw speed under throttle, use `auditing-web-performance`.

## When to Use

Trigger keywords: test error states, what if the API fails, mock a 500, empty state, offline, slow network, abort request, block third-party, simulate failure, network error handling.

Use when the user cares about **resilience** — "does the app show an error message instead of a blank screen when the API dies?" If they want to confirm the feature works normally, that's `testing-web-forms` or `running-web-smoke-test`.

## Inputs You Need

1. **URL** (required) — the page whose failure behavior you're testing.
2. **The request(s) to intercept** — the API endpoint or third-party host, as a glob pattern (e.g. `**/api/products*`, `**/*.google-analytics.com/**`). If the user doesn't know it, discover it: navigate once normally and use `webmobai_check_errors` / `webmobai_get_page_state`, or ask which action triggers the fetch.
3. **The failure to simulate** — 500, empty body, abort, offline, slow, or blocked third-party.
4. **Expected graceful behavior** — what *should* the user see? (an error banner, a retry button, an empty-state message). This is the assertion target. If unstated, ask, or verify the weaker bar: "no blank screen, no uncaught console error."

## Workflow

Golden rule: **register the route BEFORE the request fires.** Route, then navigate or trigger. Always `webmobai_unroute` (or `webmobai_close_browser`, which resets routes) at the end so a stray interception can't poison later steps.

### 1. Launch
`webmobai_launch_browser` with `headless: false` so the user watches the failure play out. `record_video: true` — the degraded UI is the evidence.

### 2. (If needed) Discover the request
If the endpoint pattern is unknown, `webmobai_navigate` to the URL normally first, then `webmobai_check_errors` and `webmobai_get_page_state` to see what the page fetches. Note the pattern, then proceed.

### 3. Arm the failure
Pick the mechanism for the scenario:
- **Server error**: `webmobai_route` with `pattern`, `action: "fulfill"`, `status: 500` (or 503/429), `body: '{"error":"Internal Server Error"}'`, `content_type: "application/json"`.
- **Empty state**: `webmobai_route` with `action: "fulfill"`, `status: 200`, `body: "[]"` (or `"{}"`).
- **Malformed body**: `action: "fulfill"`, `status: 200`, `body: "{not valid json"` to hit the parse/catch path.
- **Aborted request**: `webmobai_route` with `action: "abort"` (optional `abort_reason` like `"connectionfailed"` / `"timedout"`).
- **Blocked third-party**: `webmobai_route` on the third-party host glob with `action: "abort"`.
- **Offline**: `webmobai_set_network_throttle` with `preset: "offline"`.
- **Slow network**: `webmobai_set_network_throttle` with `preset: "slow-3g"` (or `fast-3g`).

Combine sparingly — one fault per check keeps the result attributable.

### 4. Trigger the request
`webmobai_navigate` to the URL (for on-load fetches) or `webmobai_click` the control that fires the request (for on-demand fetches). For slow-network cases, use `webmobai_wait_for` to observe the loading state before the response lands.

### 5. Verify graceful degradation
Assert the error UI actually rendered — do **not** just eyeball it:
- `webmobai_assert_visible` on the error banner / empty-state / retry-button selector.
- `webmobai_assert_text` to confirm the message wording, or `webmobai_assert_hidden` that a spinner cleared.
- `webmobai_assert_count` to confirm a list rendered 0 rows (empty state) rather than stale data.
- `webmobai_check_errors` — the app may show a nice banner *and* still throw an uncaught exception. A console error under fault injection is usually a `warning` (handled) or `fail` (crash), depending on whether the UI recovered.
- `webmobai_screenshot` with a `description` naming the scenario ("API 500 — product list error state").

### 6. Record the result
`webmobai_add_test_result` under category `Errors`, one entry per scenario. `pass` = the app degraded gracefully (error UI shown, no crash); `warning` = handled but rough (blank region, console noise, spinner never cleared); `fail` = blank screen, stale data shown as if real, or an uncaught exception.

### 7. Reset before the next scenario
`webmobai_unroute` (with the same `pattern`, or no pattern to clear all) and `webmobai_set_network_throttle` with `preset: null`. Then repeat from step 3 for the next fault. **Skipping this leaks the fault into the next check.**

### 8. Report & close
If multiple scenarios ran, `webmobai_generate_report` with the primary URL. Then `webmobai_close_browser` (also resets all routes and throttling).

## Tools Used

- `mcp__webmobai__webmobai_launch_browser`
- `mcp__webmobai__webmobai_navigate`
- `mcp__webmobai__webmobai_route` — arm the fault (`fulfill` 500 / empty / malformed, `abort`, block third-party)
- `mcp__webmobai__webmobai_unroute` — remove the fault between scenarios
- `mcp__webmobai__webmobai_set_network_throttle` — `offline` / `slow-3g` / `fast-3g`, `null` to clear
- `mcp__webmobai__webmobai_click` *(conditional — on-demand fetches)*
- `mcp__webmobai__webmobai_wait_for` *(conditional — observe loading state)*
- `mcp__webmobai__webmobai_assert_visible`
- `mcp__webmobai__webmobai_assert_text`
- `mcp__webmobai__webmobai_assert_hidden` *(conditional — spinner cleared)*
- `mcp__webmobai__webmobai_assert_count` *(conditional — empty list)*
- `mcp__webmobai__webmobai_check_errors`
- `mcp__webmobai__webmobai_get_page_state` *(conditional — discovery)*
- `mcp__webmobai__webmobai_screenshot`
- `mcp__webmobai__webmobai_add_test_result`
- `mcp__webmobai__webmobai_generate_report` *(if multiple scenarios)*
- `mcp__webmobai__webmobai_close_browser`

## Output

```
ERROR-STATE TEST — https://shop.example.com/products
  [1] API 500 (GET **/api/products*)
      → error banner "Something went wrong" visible, list empty  PASS
  [2] Empty response (body [])
      → "No products found" empty state visible                  PASS
  [3] Abort request (connectionfailed)
      → retry button visible, no uncaught console error          PASS
  [4] Offline (set_network_throttle offline)
      → blank region, spinner never cleared, 1 console error     WARNING
  [5] Block third-party (**/*.google-analytics.com/**)
      → page fully functional without analytics                 PASS
  Report: /path/to/webmobai-report-2026-07-17.html
```

## Tips & Gotchas

- **Route before the request, always.** Playwright can't intercept a request that already left. If nothing was mocked, you armed the route after navigating — reset and redo in order.
- **Patterns are globs.** `**/api/users/*` matches path segments; use `**/host.com/**` to catch a whole third-party host regardless of path. A too-narrow pattern silently matches nothing and your "500" never fires — verify the fault actually hit via `check_errors`.
- **Always unroute / clear throttle between scenarios.** A leftover `offline` or a stale `fulfill` will make the *next* scenario lie. Step 7 is not optional. `close_browser` also resets everything as a safety net.
- **A pretty error banner can still hide a crash.** Run `check_errors` even when the UI looks handled — a caught render path plus an uncaught async rejection is a real bug.
- **`offline` and throttling are Chromium-only.** On firefox/webkit sessions the throttle is a no-op; use `route` + `abort` to simulate connection loss instead.
- **Distinguish `warning` from `fail`.** Console noise under injected failure with a working UI is a `warning`. A blank screen, stale data shown as real, or a hard crash is a `fail`.
- **Don't mock destructive endpoints on prod** to fake success on a real POST/DELETE — that hides genuine failures. Fault injection is about surfacing bad behavior, not masking it.

## Example Invocations

User: *"What does https://shop.example.com show if the products API returns a 500?"*
→ Route `**/api/products*` → `fulfill` status 500, navigate, assert the error banner is visible and `check_errors` is clean of uncaught throws, screenshot, unroute, close.

User: *"Test the empty state on my dashboard — pretend the user has no items."*
→ Route the list endpoint → `fulfill` status 200 body `[]`, reload, `assert_visible` the empty-state message and `assert_count` the list at 0 rows.

User: *"Does the checkout page still work with analytics blocked, and what happens offline?"*
→ Two scenarios: (1) `route` the analytics host → `abort`, verify the page is fully functional; (2) reset, `set_network_throttle` `offline`, trigger a fetch, verify an offline notice appears rather than a hang. `add_test_result` for each, then report.

User: *"Simulate a dropped connection when I click Submit."*
→ Route the submit endpoint → `action: "abort"` with `abort_reason: "connectionfailed"`, `click` Submit, `assert_visible` the retry/error UI, confirm no uncaught console error.
