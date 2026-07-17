---
name: verifying-web-flows
description: Use when the user wants a hard pass/fail acceptance test of a user flow — asserting elements are visible/hidden, that text matches, that the URL is correct, and that counts are right, all with auto-wait. This is what makes WebMobAI a real test runner in natural language. Triggers on "verify this flow", "assert", "acceptance test", "check that X appears after Y", "make sure the URL is", "pass/fail test", "does the flow work", "validate the happy path".
---

# Verifying Web Flows

## Overview

This skill turns a described user flow into an **explicit pass/fail acceptance test**. You drive the flow with the normal browser tools, then pin down "did it work?" with the five assertion verbs — `assert_visible`, `assert_hidden`, `assert_text`, `assert_url`, `assert_count`. Unlike audits, an assertion checks a *user-defined expectation* and **fails the run** when the expectation doesn't hold. That failure is the answer, not noise.

Every assertion **auto-waits** (default 5s, polling every 100ms) for the expectation to settle before failing — so most timing flakes resolve themselves. On failure the verbs return a self-healing triage bundle (prior snapshot, similar elements, suggested selectors, plus URL / console / network errors and a screenshot).

Use this skill when the pass/fail *verdict* is the deliverable. Use `testing-web-forms` instead for form-specific happy-path + validation coverage, and `testing-web-app` for a full multi-facet audit. For deep locator repair when an assertion can't find its target, hand off to `debugging-web-selectors`.

## When to Use

Trigger keywords: verify the flow, assert, acceptance test, "check that X shows after Y", "make sure the URL is /dashboard", pass/fail, "does the flow work", validate the happy path.

Use when the user has a concrete expectation to prove ("after I click Login I should land on /dashboard and see a welcome heading"). If they want general exploration, error-hunting, or a report deliverable, pick the matching sibling skill.

## Inputs You Need

1. **Start URL** (required). Where the flow begins.
2. **The flow** (required). The ordered user actions — clicks, typing, selects — that lead to the state under test.
3. **The expectations** (required). What must be true at the end (and optionally at intermediate steps): an element visible/hidden, text present, URL correct, a count. Vague goals ("make sure it works") should be pinned to concrete assertions before you run.
4. **Login / credentials** (if the flow is gated). Never invent them — ask.

## Workflow

### 1. Launch
`webmobai_launch_browser` with `headless: false` (let the user watch), `record_video: true` (the replay is useful evidence for an acceptance run).

### 2. Navigate to the start
`webmobai_navigate` to the start URL. Confirm it didn't silently redirect to an error or login page.

### 3. Drive the flow
Perform the described actions with `webmobai_click`, `webmobai_type`, `webmobai_select_option`, `webmobai_press_key`, etc. If a step depends on an element that loads async, precede it with `webmobai_wait_for`. Keep the action sequence honest to what the user described — don't skip steps.

### 4. Assert the expected end state
Fire the assertion verbs that encode the user's expectations. Each fails the run (returns `FAIL — …`) if unmet after its `timeout_ms`:
- `webmobai_assert_url` — verify the landing URL. **You must pass `contains`, `pattern`, or both** — an assertion with neither verifies nothing and is rejected. Use `contains: "/dashboard"` for a substring, `pattern` for a regex (no delimiters); if both are given, both must hold.
- `webmobai_assert_visible` — an element that must appear (selector, `timeout_ms`).
- `webmobai_assert_hidden` — an element that must be gone or hidden (a spinner cleared, a modal dismissed, an error not shown).
- `webmobai_assert_text` — an element `contains` the `expected` substring (case-sensitive); pass `exact: true` to match trimmed innerText exactly. Good for headings, labels, confirmation and error messages.
- `webmobai_assert_count` — the number of elements matching a selector `expected` (list rows, cart items, result cards).

Rely on the built-in auto-wait rather than inserting manual sleeps. Bump `timeout_ms` above 5000 only for genuinely slow transitions.

### 5. On a failing assertion — read the triage, don't retry to "make it pass"
A `FAIL` for a selector-based verb comes with self-healing diagnostics: similar elements and suggested selectors, plus a page-state bundle (current URL, console/network errors, screenshot). Read it. If the selector was simply wrong or brittle, hand off to `debugging-web-selectors` for locator repair, then re-assert. If the element is genuinely absent/wrong, the flow is broken — report it.

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
  Video: /tmp/webmobai-videos/2026-07-14-login.webm
```

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

- **`assert_url` needs a matcher.** An empty `assert_url` (no `contains`, no `pattern`) is rejected with a FAIL — it would verify nothing. Always supply at least one.
- **`assert_text` is substring + case-sensitive by default.** Pass `exact: true` for an exact trimmed-innerText match. "Submit" won't match an element whose text is "submit".
- **Let auto-wait do its job.** Every verb polls up to `timeout_ms` (default 5s). Don't wrap assertions in manual retry loops — that's what the built-in wait is for. Raise `timeout_ms` only for slow transitions.
- **A failure is the answer.** Don't loosen selectors or re-run until it passes. If the assertion is genuinely mis-targeted, repair the locator via `debugging-web-selectors`; if the element is truly missing, the flow is broken — report it.
- **Assertions are binary.** Record them `pass`/`fail`, not `warning`.
- **Don't confuse with forms.** Form-specific validation/error-state coverage belongs to `testing-web-forms`; this skill verifies *any* flow's end state.
- **Auth & destructive steps.** Never invent credentials, and don't drive real checkouts/signups against production unless the user explicitly authorized it.

## Example Invocations

User: *"Verify that after logging into https://app.example.com the user lands on /dashboard and sees the welcome heading."*
→ Navigate, type creds (ask if not given), click Sign in, then `assert_url` contains `/dashboard` + `assert_visible` on the heading. Report the verdict.

User: *"Acceptance test: on the pricing page there should be exactly 3 plan cards and the URL should stay on /pricing."*
→ Navigate, `assert_count` on the plan-card selector expected 3, `assert_url` contains `/pricing`. PASS/FAIL scorecard.

User: *"Make sure the error banner disappears after I fix the form and the success toast shows."*
→ Drive the fix + submit, then `assert_hidden` on the error banner and `assert_text` on the toast. Report both.

User: *"Does the checkout flow actually work end to end?"*
→ Pin the vague ask to concrete assertions (URL reaches `/confirmation`, order-number text visible), drive the flow, assert, and report. If an assertion fails, surface the triage and suggest `debugging-web-selectors`.
