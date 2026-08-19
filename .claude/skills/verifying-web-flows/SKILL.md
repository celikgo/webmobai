---
name: verifying-web-flows
description: Use when the user wants a hard pass/fail acceptance test of a user flow — asserting elements are visible/hidden, that text matches, that the URL is correct, and that counts are right, all with auto-wait. This is what makes WebMobAI a real test runner in natural language. Triggers on "verify this flow", "assert", "acceptance test", "check that X appears after Y", "make sure the URL is", "pass/fail test", "does the flow work", "validate the happy path".
---

# Verifying Web Flows

## Overview

This skill turns a described user flow into an **explicit pass/fail acceptance test**. You drive the flow with the normal browser tools, then pin down "did it work?" with the five assertion verbs — `assert_visible`, `assert_hidden`, `assert_text`, `assert_url`, `assert_count`. Unlike audits, an assertion checks a *user-defined expectation* and **fails the run** when the expectation doesn't hold. That failure is the answer, not noise.

Every assertion **auto-waits** (default `timeout_ms` 5000, polling every 100ms) for the expectation to settle before failing — so most timing flakes resolve themselves. On failure the verbs attach diagnostics: the four selector-based verbs get a self-healing block (the fingerprint recorded for that selector when it last worked, plus up to 5 similar elements on the page ranked by similarity with a suggested replacement selector each), and every verb gets a failure-context bundle (current URL, title, viewport, the last 5 console errors, the last 5 network errors, and a freshly captured screenshot).

Use this skill when the pass/fail *verdict* is the deliverable. Use `testing-web-forms` instead for form-specific happy-path + validation coverage, and `testing-web-app` for a full multi-facet audit. For deep locator repair when an assertion can't find its target, hand off to `debugging-web-selectors`.

## When to Use

Trigger keywords: verify the flow, assert, acceptance test, "check that X shows after Y", "make sure the URL is /dashboard", pass/fail, "does the flow work", validate the happy path.

Use when the user has a concrete expectation to prove ("after I click Login I should land on /dashboard and see a welcome heading"). If they want general exploration, error-hunting, or a report deliverable, pick the matching sibling skill.

## Inputs You Need

1. **Start URL** (required). Where the flow begins.
2. **The flow** (required). The ordered user actions — clicks, typing, selects — that lead to the state under test.
3. **The expectations** (required). What must be true at the end (and optionally at intermediate steps): an element visible/hidden, text present, URL correct, a count. Vague goals ("make sure it works") should be pinned to concrete assertions before you run.
4. **Login / credentials** (if the flow is gated). Never invent them — ask. See "Behind a login?" below.

### Behind a login?

If the flow *starts* logged in (checkout from a saved cart, an account settings change), don't spend the first four steps re-driving a login — the assertions you care about come after it, and a login that changes (new MFA prompt, new field) fails the run for a reason unrelated to the flow under test.

Detect the wall the usual way: after `webmobai_navigate` the final URL is `/login` or `?next=`. Then launch with `storage_state_path: "auth.json"` so step 2 lands on the real start URL already authenticated. Capture procedure and expiry handling: `testing-web-authenticated-sessions`. If the login itself is what the user wants verified, keep driving it here — and treat a stale session as a distinct outcome from a failed assertion, since both surface as "expected element never appeared".

## Workflow

### 1. Launch
`webmobai_launch_browser` with `headless: false` (let the user watch), `record_video: true` (the replay is useful evidence for an acceptance run).

### 2. Navigate to the start
`webmobai_navigate` to the start URL. Confirm it didn't silently redirect to an error or login page.

### 3. Drive the flow
Perform the described actions with `webmobai_click`, `webmobai_type`, `webmobai_select_option`, `webmobai_press_key`, etc. If a step depends on an element that loads async, precede it with `webmobai_wait_for`. Keep the action sequence honest to what the user described — don't skip steps.

### 4. Assert the expected end state
Fire the assertion verbs that encode the user's expectations. Each fails the run (returns `FAIL — …`) if unmet after its `timeout_ms`:
- `webmobai_assert_url` — verify the landing URL. **You must pass `contains`, `pattern`, or both.** As of v1.4.0 a call with neither is rejected outright: `FAIL — assert_url requires 'contains' or 'pattern'; neither was supplied, so there is nothing to verify.` Before v1.4.0 the same call evaluated `true && true` and reported PASS while verifying nothing, so any older test that relied on a bare `assert_url` was passing vacuously and will now go red — that is the bug surfacing, not a new failure. Use `contains: "/dashboard"` for a substring, `pattern` for a regex (no delimiters); if both are given, both must hold.
- `webmobai_assert_visible` — an element that must appear (selector, `timeout_ms`).
- `webmobai_assert_hidden` — an element that must be gone or hidden (a spinner cleared, a modal dismissed, an error not shown).
- `webmobai_assert_text` — an element `contains` the `expected` substring (case-sensitive); pass `exact: true` to match trimmed innerText exactly. Good for headings, labels, confirmation and error messages.
- `webmobai_assert_count` — the number of elements matching a selector `expected` (list rows, cart items, result cards).

Rely on the built-in auto-wait rather than inserting manual sleeps. Bump `timeout_ms` above 5000 only for genuinely slow transitions.

### 5. On a failing assertion — read the triage, don't retry to "make it pass"
A `FAIL` from `assert_visible`, `assert_hidden`, `assert_text` or `assert_count` carries self-healing diagnostics: the fingerprint previously recorded for that selector (tag, text, role, testid, position — captured automatically the last time a `click` or `type` succeeded on it), then up to 5 candidate elements scored by similarity, each with a suggested replacement selector. When nothing similar is found, it says so — usually meaning the page navigated away or the element was removed.

Every assertion that actually ran and then failed, `assert_url` included, also appends the failure-context block: current URL and title, viewport, the last 5 console errors, the last 5 network errors, and a screenshot path. `assert_url` gets **only** that block — there is no selector to self-heal. The one exception is the no-matcher rejection above: it returns immediately, so it carries no triage at all.

Read it before acting. If the selector was wrong or brittle, hand off to `debugging-web-selectors` for locator repair, then re-assert. If the element is genuinely absent, the flow is broken — report it.

### 6. Record each verdict
For each assertion call `webmobai_add_test_result` with category `Navigation` (URL/landing checks) or `Forms`/`Content` as fits, and status `pass` or `fail`. A `warning` is rarely right here — assertions are binary. This makes the verdicts show up grouped if a report is generated.

### 7. Close
`webmobai_close_browser` (saves the video).

### 8. (Optional) Report
Only if the user asked for a document. `webmobai_generate_report` with the primary URL. Most acceptance runs just want the inline PASS/FAIL summary below.

## Tools Used

- `mcp__webmobai__webmobai_launch_browser`
- `mcp__webmobai__webmobai_navigate`
- `mcp__webmobai__webmobai_click`
- `mcp__webmobai__webmobai_type`
- `mcp__webmobai__webmobai_select_option`
- `mcp__webmobai__webmobai_press_key`
- `mcp__webmobai__webmobai_wait_for`
- `mcp__webmobai__webmobai_assert_visible`
- `mcp__webmobai__webmobai_assert_hidden`
- `mcp__webmobai__webmobai_assert_text`
- `mcp__webmobai__webmobai_assert_url`
- `mcp__webmobai__webmobai_assert_count`
- `mcp__webmobai__webmobai_add_test_result`
- `mcp__webmobai__webmobai_generate_report` *(optional — only if a document is requested)*
- `mcp__webmobai__webmobai_close_browser`

## Output

An inline pass/fail scorecard — the flow, each assertion, and the overall verdict:

```
FLOW VERIFY: PASS — Login happy path @ https://app.example.com
  Steps: navigate /login → type email/password → click "Sign in"
  ✓ assert_url        contains "/dashboard"          (matched: /dashboard?welcome=1)
  ✓ assert_visible    h1.welcome                     (visible in 380ms)
  ✓ assert_text       [data-testid=greeting] ~ "Hi, Sam"
  ✓ assert_hidden     .login-error                   (absent)
  ✓ assert_count      nav a.tab  == 4
  Video: /var/folders/…/webmobai-1747050000000-a1b2c3/recordings/3f8c1e0b9a.webm
```

The video path is whatever `webmobai_close_browser` returned — a `.webm` under `recordings/` in that run's `<os.tmpdir()>/webmobai-<ts>-<rand>/` session directory (Playwright names the file, not us). The same response prints the `trace.zip` path; include it when an assertion failed, since the trace is the fastest way to see what the page was doing at that moment.

```
FLOW VERIFY: FAIL — Checkout @ https://shop.example.com
  Steps: add item → open cart → click "Checkout"
  ✓ assert_url        contains "/checkout"
  ✗ assert_visible    button#place-order — not visible within 5000ms
      triage: nearest matches → button.btn-primary "Continue", a#pay-now
      console: 1 error (TypeError in checkout.js:88)  screenshot saved
  → selector likely wrong or step blocked; see debugging-web-selectors
```

## Tips & Gotchas

- **`assert_url` needs a matcher.** An empty `assert_url` (no `contains`, no `pattern`) is rejected with a FAIL — it would verify nothing. This changed in v1.4.0; the same call used to report PASS. If a previously green suite starts failing here, the assertion was never checking anything. Always supply at least one matcher.
- **`assert_text` is substring + case-sensitive by default.** Pass `exact: true` for an exact trimmed-innerText match. "Submit" won't match an element whose text is "submit".
- **Let auto-wait do its job.** Every verb polls up to `timeout_ms` (default 5s). Don't wrap assertions in manual retry loops — that's what the built-in wait is for. Raise `timeout_ms` only for slow transitions.
- **A failure is the answer.** Don't loosen selectors or re-run until it passes. If the assertion is genuinely mis-targeted, repair the locator via `debugging-web-selectors`; if the element is truly missing, the flow is broken — report it.
- **Assertions are binary.** Record them `pass`/`fail`, not `warning`.
- **Don't confuse with forms.** Form-specific validation/error-state coverage belongs to `testing-web-forms`; this skill verifies *any* flow's end state.
- **Self-healing suggests, it does not substitute.** The candidate selectors in a failure block are ranked guesses from the current DOM; nothing retries them for you. Verify one with `describe_selector` before re-asserting.
- **Auth & destructive steps.** Never invent credentials, and don't drive real checkouts/signups against production unless the user explicitly authorized it. For a gated flow, prefer a saved session over typing credentials each run — `testing-web-authenticated-sessions`.
- **A stale session mimics a broken flow.** Both look like "assert_visible timed out". Check the failure block's `Current URL` first: if it is `/login`, the session expired and the flow verdict is inconclusive, not FAIL.

## Example Invocations

User: *"Verify that after logging into https://app.example.com the user lands on /dashboard and sees the welcome heading."*
→ Navigate, type creds (ask if not given), click Sign in, then `assert_url` contains `/dashboard` + `assert_visible` on the heading. Report the verdict.

User: *"Acceptance test: on the pricing page there should be exactly 3 plan cards and the URL should stay on /pricing."*
→ Navigate, `assert_count` on the plan-card selector expected 3, `assert_url` contains `/pricing`. PASS/FAIL scorecard.

User: *"Make sure the error banner disappears after I fix the form and the success toast shows."*
→ Drive the fix + submit, then `assert_hidden` on the error banner and `assert_text` on the toast. Report both.

User: *"Does the checkout flow actually work end to end?"*
→ Pin the vague ask to concrete assertions (URL reaches `/confirmation`, order-number text visible), drive the flow, assert, and report. If an assertion fails, surface the triage and suggest `debugging-web-selectors`.

User: *"Verify that a logged-in user with items in the cart can reach the payment step."*
→ The login is setup, not the test. Launch with `storage_state_path: "auth.json"` (capture it via `testing-web-authenticated-sessions` if absent), navigate straight to the cart, drive to payment, then `assert_url` contains `/payment` + `assert_visible` on the payment form. Stop before submitting a real payment.
