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
3. **Login required?** If the target is behind a login, ask whether a saved session file already exists rather than asking for a password. See "Behind a login?" below.

### Behind a login?

Detect it: the final URL after `webmobai_navigate` is `/login` / `/signin` / carries a `?next=` or `?redirect=` param, or the page state is a bare password form. That is **blocked, not failed** — say so explicitly.

The fix is a one-line change, not a hand-driven login: relaunch with `storage_state_path: "auth.json"` (CLI: `--storage-state auth.json`) so the smoke test starts already authenticated. Capturing that file — including MFA/SSO flows and how to tell a stale session from a missing one — is `testing-web-authenticated-sessions`. `webmobai-doctor --storage-state auth.json` will tell you whether the file is present and parseable before you burn a run on it.

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

### Not every red is the site's fault

If the run dies before it reaches the page — `webmobai_launch_browser` errors, the browser download stalls, the target is unreachable — that is an environment problem, not a smoke-test failure. Run the preflight before re-running the test:

```bash
webmobai-doctor
webmobai-doctor --storage-state auth.json   # add when the target is behind a login
```

It checks, in order: Node ≥ 18, chromium (**required** — missing is a hard error), firefox and webkit (optional — warn), the optional `lighthouse` package, `WEBMOBAI_ANTHROPIC_API_KEY`, and, only with the flag, the storageState file (missing or unparseable = error; every dated cookie expired = warn). Exit 1 means at least one hard error must be fixed; warnings still exit 0. Report the failing line verbatim. For anything the doctor output doesn't resolve, hand off to `troubleshooting-webmobai-setup`.

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
  Screenshot: /var/folders/…/webmobai-1747050000000-a1b2c3/screenshots/screenshot-1-1747050001234.png
```

or

```
SMOKE TEST: FAIL — https://example.com
  - Navigation: ok
  - Title: "Example Site"
  - Console: 3 errors (TypeError in main.js:42)
  - Images: 2 broken (/static/hero.png, /static/logo.svg)
  - Expected "Sign Up" button: NOT FOUND
  Screenshot: /var/folders/…/webmobai-1747050000000-a1b2c3/screenshots/screenshot-1-1747050001234.png
```

Screenshot paths are whatever `webmobai_screenshot` returned — a `screenshots/screenshot-<n>-<ts>.png` file inside that run's `<os.tmpdir()>/webmobai-<ts>-<rand>/` session directory. Surface the path verbatim; don't reformat or invent one.

## Tips & Gotchas

- **Don't crawl**. Smoke tests are single-page. If the user says "check every page" they want `testing-web-app`, not this skill.
- **Don't record video**. Adds startup latency and disk pressure for no benefit on a 60-second run.
- **Failures are signal, not noise**. If the smoke test fails, do not retry to "make it pass" — the failure is the answer. Report it.
- **Console warnings**: ignore for smoke tests. Many production sites have benign warnings. Errors are the bar.
- **Hydration races**: on heavy SPAs, the initial DOM may be sparse while React/Vue mount. If `get_page_state` shows near-empty content, retry with a 1-2s `webmobai_wait_for` before declaring failure.
- **Auth pages**: if the URL is gated and you have neither credentials nor a session file, the smoke test result is "blocked, not failed". Report that distinction, then offer the one-time capture in `testing-web-authenticated-sessions` so the next post-deploy run can pass `storage_state_path` and actually smoke-test the logged-in page.
- **A green smoke test on a login page is meaningless.** If the final URL is the login screen, the page "loaded fine" — you verified the wrong page. Check the final URL before declaring PASS.
- **Environment vs. site**: launch failures, a missing chromium, or a first-run browser download are `webmobai-doctor` territory, not a site regression. See "Not every red is the site's fault" above.

## Example Invocations

User: *"Quick smoke test on https://staging.example.com — we just deployed."*
→ Run the standard flow, no expected-content assertion. Report PASS/FAIL with the screenshot.

User: *"Is https://shop.example.com still working? Make sure the 'Add to Cart' button shows up."*
→ Same flow, but include a `webmobai_wait_for` on a selector that should match the Add to Cart button (or `evaluate` checking innerText). Report whether the assertion held.

User: *"Sanity check the new release on https://app.example.org/login."*
→ Smoke-test the login page only. Note in the output that the test stops at the login wall — it did not log in.

User: *"Smoke test the dashboard at https://app.example.org/home — we have auth.json from last week."*
→ Launch with `storage_state_path: "auth.json"`, then run the normal flow. If the final URL is `/login`, the session expired: say so and point at `testing-web-authenticated-sessions` to re-capture — don't report it as a site outage.

User: *"The smoke test won't even start — it errors on launch."*
→ Not a site failure. Run `webmobai-doctor`, report the failing check verbatim, and hand off to `troubleshooting-webmobai-setup` if the fix isn't obvious from the output.
