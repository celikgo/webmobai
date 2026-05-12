---
name: running-web-smoke-test
description: Use when the user wants a fast pass/fail check that a website is "alive" — page loads, no console errors, no broken images, key elements present. Faster and shallower than a full audit. Triggers on "smoke test", "quick test", "sanity check", "is the site up", "does the site work", "verify deploy", "post-deploy check", "is it broken".
---

# Running a Web Smoke Test

## Overview

A smoke test is a *narrow, fast* pass that answers one question: **does the site basically work?** It does **not** measure Web Vitals deeply, doesn't crawl, doesn't run multi-breakpoint audits. It catches the obvious regressions — page errors, broken images, console blow-ups, missing critical content — typically in under a minute.

Use this skill for:
- Post-deploy verification
- "Is it down?" diagnostics
- Pre-release gate checks
- Quick triage when a user reports "something is wrong"

Use `testing-web-app` instead when a full deliverable report is wanted.

## When to Use

Trigger keywords: smoke test, quick check, sanity check, post-deploy, "is it broken", "is it up".

Use only when **speed matters more than depth**. If the user says "test" or "audit" without qualifier, default to `testing-web-app`.

## Inputs You Need

1. **URL** (required). Usually a single page — the homepage or a specific changed route.
2. **Expected content** (optional but useful). A string or selector that *must* be present (e.g., "Sign Up button", `h1`, `[data-testid=hero]`). If absent, the smoke test can't verify content correctness — only that the page loaded without errors.
3. **Login required?** If the user wants the smoke test on an authenticated page, ask for credentials.

## Workflow

The whole pass should take ≤60 seconds for a fast site.

### 1. Launch
`webmobai_launch_browser` with `headless: false` (let the user watch), `record_video: false` (no need for a smoke test — saves disk).

### 2. Navigate
`webmobai_navigate` to the URL. Confirm:
- The final URL matches expected (no silent redirect to an error/login page).
- The page title is non-empty.

If navigation throws or times out → smoke test **fails**. Stop and report.

### 3. Page state snapshot
`webmobai_get_page_state` — minimal call, no a11y tree (`include_accessibility_tree: false`). Use the DOM summary to confirm the page rendered actual content (headings exist, body isn't blank).

Red flags from the summary:
- Zero `<h1>` and zero text content → likely error page or hydration failure
- Title contains "404", "Error", "Not Found"
- Headings/links count near zero on a site that should have rich content

### 4. Error check
`webmobai_check_errors` — surfaces broken images, console errors, network failures in one call. Treat any **console error** (not warning) or **broken image** as smoke-test failure.

### 5. Content assertion (if provided)
If the user specified expected content, verify it. Choose the cheapest tool:
- **Text content**: `webmobai_evaluate` with `document.body.innerText.includes("Sign Up")`
- **Selector**: `webmobai_wait_for` with `selector` and a short timeout (3000ms is plenty for a smoke test)

Missing expected content → **fail**.

### 6. One screenshot
`webmobai_screenshot` with a `description` like "Smoke test — homepage post-deploy". This is the evidence artifact the user will look at if anything looks off.

### 7. Close
`webmobai_close_browser`.

## Pass / Fail Criteria

Report **PASS** if all of these hold:
- Navigation succeeded
- Final URL matches expected
- Title is non-empty and doesn't look like an error
- No console errors (warnings OK)
- No broken images
- All expected content present (if user provided expectations)

Otherwise **FAIL** and list which checks failed. Be specific — "console error on line 14 of bundle-abc.js" beats "errors found".

## Tools Used

- `mcp__webmobai__webmobai_launch_browser`
- `mcp__webmobai__webmobai_navigate`
- `mcp__webmobai__webmobai_get_page_state`
- `mcp__webmobai__webmobai_check_errors`
- `mcp__webmobai__webmobai_wait_for` *(conditional, for selector assertions)*
- `mcp__webmobai__webmobai_evaluate` *(conditional, for text assertions)*
- `mcp__webmobai__webmobai_screenshot`
- `mcp__webmobai__webmobai_close_browser`

You do **not** run `accessibility_audit`, `get_performance_metrics`, `test_responsive`, or `generate_report` for a smoke test. They're slow and out of scope. If the user wants those, escalate to the relevant skill.

## Output

Short structured response:

```
SMOKE TEST: PASS — https://example.com
  - Navigation: ok (200, final URL matches)
  - Title: "Example Site"
  - Console: 0 errors, 2 warnings
  - Images: all loaded (24/24)
  - Expected "Sign Up" button: found
  Screenshot: /tmp/webmobai-screenshots/2026-05-12-smoke.png
```

or

```
SMOKE TEST: FAIL — https://example.com
  - Navigation: ok
  - Title: "Example Site"
  - Console: 3 errors (TypeError in main.js:42)
  - Images: 2 broken (/static/hero.png, /static/logo.svg)
  - Expected "Sign Up" button: NOT FOUND
  Screenshot: /tmp/webmobai-screenshots/2026-05-12-smoke.png
```

## Tips & Gotchas

- **Don't crawl**. Smoke tests are single-page. If the user says "check every page" they want `testing-web-app`, not this skill.
- **Don't record video**. Adds startup latency and disk pressure for no benefit on a 60-second run.
- **Failures are signal, not noise**. If the smoke test fails, do not retry to "make it pass" — the failure is the answer. Report it.
- **Console warnings**: ignore for smoke tests. Many production sites have benign warnings. Errors are the bar.
- **Hydration races**: on heavy SPAs, the initial DOM may be sparse while React/Vue mount. If `get_page_state` shows near-empty content, retry with a 1-2s `webmobai_wait_for` before declaring failure.
- **Auth pages**: if the URL is gated and you weren't given credentials, the smoke test result is "blocked, not failed". Report that distinction.

## Example Invocations

User: *"Quick smoke test on https://staging.example.com — we just deployed."*
→ Run the standard flow, no expected-content assertion. Report PASS/FAIL with the screenshot.

User: *"Is https://shop.foo.com still working? Make sure the 'Add to Cart' button shows up."*
→ Same flow, but include a `webmobai_wait_for` on a selector that should match the Add to Cart button (or `evaluate` checking innerText). Report whether the assertion held.

User: *"Sanity check the new release on https://app.bar.com/login."*
→ Smoke-test the login page only. Note in the output that the test stops at the login wall — it did not log in.
