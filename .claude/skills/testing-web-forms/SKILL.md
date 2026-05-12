---
name: testing-web-forms
description: Use when the user wants to test form behavior — submission, validation, error states, login flows, signup flows, checkout flows, multi-step wizards. Covers the happy path, validation errors, and accessibility of the form itself. Triggers on "test the form", "test login", "test signup", "test checkout", "form validation", "test the flow", "test the wizard", "verify the form works", "test submission".
---

# Testing Web Forms

## Overview

This skill exercises HTML forms and form-driven flows on a website — single forms (login, signup, contact, search) and multi-step flows (checkout, onboarding wizards). It captures whether the form submits correctly, validates input appropriately, surfaces useful error messages, and is keyboard- and screen-reader-accessible.

The skill is interaction-heavy. It fills fields, submits, observes response, and reports findings. Use it when correctness of a *specific flow* matters more than broad site coverage.

## When to Use

- "Test the login form"
- "Verify signup works"
- "Test the checkout flow"
- "Check form validation on …"
- "Test the contact form submission"
- After backend changes to form-handling endpoints
- Before launching a new sign-up funnel

Use `testing-web-app` for broad audits that include forms as one piece. Use `regression-web-visual` if the user only cares about how the form *looks* between deploys.

## Inputs You Need

1. **Starting URL** — the page hosting the form (e.g., `/signup`).
2. **Form purpose** — login, signup, contact, checkout, search, etc. This affects what data to fill and what success/failure looks like.
3. **Test credentials** — for login/signup, ask explicitly. **Never invent emails or passwords against production systems** — they'll create real accounts or fail auth in surprising ways.
4. **Happy path expectation** — what should happen on successful submit? (Redirect to `/welcome`, show a success toast, etc.)
5. **Validation cases** — what invalid inputs should the user test? Defaults below.
6. **Test mode** — is there a sandbox/staging endpoint? If hitting production, confirm explicitly before submitting.

## Default Validation Cases

If the user doesn't specify, test these per field type:

| Field type | Cases to try |
|------------|--------------|
| Email | empty, missing `@`, missing TLD, unicode local part (`üser@example.com`), 200-char address |
| Password | empty, too short (3 chars), only whitespace, only digits, very long (200 chars), unicode |
| Required text | empty, only whitespace, very long string |
| Number | empty, negative, zero, max + 1, non-numeric, decimal where int expected |
| Phone | empty, letters, too short, international format with `+` |
| Date | empty, past date where future required, malformed (`32/13/2099`) |
| Checkbox (required terms) | leave unchecked |
| File upload | (cannot fully test — note as a gap) |

## Workflow

### 1. Launch
`webmobai_launch_browser`, `headless: false` (form interactions are interesting to watch), `record_video: true` (replay value is high if a flow fails).

### 2. Navigate to the form
`webmobai_navigate` to the starting URL. Wait for the page to settle.

### 3. Map the form
`webmobai_get_page_state` and `webmobai_get_interactive_elements` to enumerate fields, buttons, selects. Confirm with the user (or your own judgment) which inputs are required.

For a more accessible-friendly view, also call `webmobai_get_accessibility_tree` to see what a screen reader user sees — useful for catching unlabeled inputs.

### 4. Happy path
Fill each required field with valid data, submit, verify outcome.

1. For each field: `webmobai_type` (text/email/password) or `webmobai_select_option` (`<select>`) or `webmobai_click` (checkbox/radio).
2. `webmobai_screenshot` of the fully filled, pre-submit form (evidence).
3. `webmobai_click` on the submit button.
4. `webmobai_wait_for` on the success signal: either `url_contains` (redirect) or `selector` (success message).
5. `webmobai_check_errors` post-submit — many form bugs surface as console errors during submit handlers.
6. `webmobai_screenshot` of the post-submit state.
7. `webmobai_add_test_result` — `category: "Forms"`, status based on whether the success signal was observed within the timeout.

### 5. Validation cases
Reset to the form (use `webmobai_go_back` or re-navigate). For each validation case from the table above, applicable to the form's fields:

1. Fill the form with the invalid case
2. Submit
3. **Observe**:
   - Did the form block submission client-side? (Best — fastest feedback)
   - Did it submit and get rejected server-side? (Acceptable)
   - Did it submit and silently fail? (Bug)
   - Was the error message clear and tied to the offending field? (`aria-describedby`, inline error text)
4. `webmobai_screenshot` of the error state
5. `webmobai_add_test_result`

### 6. Accessibility of the form
While you're here, verify:
- **Keyboard nav**: `webmobai_press_key` Tab through all inputs and confirm focus follows visual order
- **Submit on Enter**: from the last text input, `webmobai_press_key` Enter — does it submit? (It should for single-line text inputs.)
- **Labels**: every input should have a `<label>`, `aria-label`, or `aria-labelledby`. The accessibility tree (step 3) tells you which inputs lack accessible names.
- **Error association**: when validation fires, are errors announced to screen readers? Look for `aria-live`, `role="alert"`, or `aria-describedby` linking error to input.

Run `webmobai_accessibility_audit` post-error-state to catch missing labels and ARIA misuse. Many a11y issues only surface when the form is in an error state.

### 7. Multi-step flows
If the form is a wizard (checkout, onboarding):
1. Complete step 1 with valid data, submit, screenshot
2. `webmobai_wait_for` for the next step's heading or first input
3. Repeat per step
4. On the final step, verify the success state (confirmation page, order ID, etc.)

Also test:
- **Back navigation**: `webmobai_go_back` from step 3 → does step 2 retain data?
- **Refresh resilience**: skip this — Playwright can't always cleanly test mid-flow refresh. Note as a manual-test gap.

### 8. Report
`webmobai_generate_report`. Surface the report path and which cases passed/failed.

### 9. Close
`webmobai_close_browser`.

## Result Status Conventions

When you call `webmobai_add_test_result` for form tests:

- `status: "pass"` — the form behaved correctly (happy path completed, validation blocked invalid input, errors were clearly shown)
- `status: "warning"` — the form worked but with rough edges (no inline error, errors not screen-reader-announced, slow response with no loading indicator)
- `status: "fail"` — submission silently failed, validation didn't fire on clearly invalid input, page crashed, success state never appeared

Use clear titles:
- ✓ `"Login — happy path with valid credentials"`
- ✓ `"Login — empty email rejected with inline error"`
- ✗ `"Login — password field"` (too vague — passes or fails on what?)

## Tools Used

Primary:
- `mcp__webmobai__webmobai_launch_browser`
- `mcp__webmobai__webmobai_navigate`
- `mcp__webmobai__webmobai_get_page_state`
- `mcp__webmobai__webmobai_get_interactive_elements`
- `mcp__webmobai__webmobai_type`
- `mcp__webmobai__webmobai_select_option`
- `mcp__webmobai__webmobai_click`
- `mcp__webmobai__webmobai_press_key`
- `mcp__webmobai__webmobai_wait_for`
- `mcp__webmobai__webmobai_check_errors`
- `mcp__webmobai__webmobai_screenshot`
- `mcp__webmobai__webmobai_add_test_result`
- `mcp__webmobai__webmobai_generate_report`
- `mcp__webmobai__webmobai_close_browser`

Conditional:
- `mcp__webmobai__webmobai_evaluate` — for custom assertions (e.g., reading hidden fields, checking field values after JS manipulation)
- `mcp__webmobai__webmobai_get_accessibility_tree` — for form a11y audit
- `mcp__webmobai__webmobai_accessibility_audit` — full a11y pass, especially on error states
- `mcp__webmobai__webmobai_go_back` — reset to form between validation runs

## Output

End-of-turn summary:

```
Form test — Signup at https://example.com/signup
  Happy path: PASS — submitted, redirected to /welcome
  Validation cases (7 run):
    Email — empty:        PASS (blocked, inline error "Email required")
    Email — no @:         PASS (blocked, inline error)
    Email — no TLD:       WARN (blocked, but error is "Invalid" — too vague)
    Password — too short: PASS (blocked, inline error with rule)
    Password — empty:     FAIL (form submitted, server rejected with generic 500)
    Terms — unchecked:    PASS (blocked client-side)
    Email already used:   PASS (server error shown inline)
  Accessibility on errors: 2 warnings — error messages lack aria-live
  Report: /tmp/webmobai-report-1715534000.html
```

## Tips & Gotchas

- **NEVER submit to production with destructive data**. If unsure whether you're on staging vs production, ask before submitting. Real signups create real accounts; real checkouts might trigger real charges.
- **Be careful with credentials in logs**. Type passwords with `webmobai_type` (which is fine) but don't echo them in your summary or recorded results.
- **CSRF tokens**: most forms have hidden CSRF tokens. They're auto-filled by the browser — you don't need to touch them. But if a form is failing inexplicably, check whether the token is being passed (`webmobai_evaluate` to read its value).
- **Captchas**: reCAPTCHA and similar will block automation. If the form has a captcha, the test stops there. Note this as a gap and recommend the user disable it in the test environment.
- **Email validation strictness**: HTML5 `type="email"` does only basic checks. Don't penalize a form for accepting `a@b` (technically valid per RFC) — penalize it for accepting clearly invalid input.
- **Async validation**: some forms validate as you type (debounced). Wait briefly after typing before submitting, or your "invalid" submission may race with the async validator and produce a different error than expected.
- **Native vs custom errors**: HTML5 `required`/`pattern` produce browser-native error popups. Custom JS validation usually shows inline text. Both are valid; report which the form uses.
- **Auto-fill / password managers**: with WebMobAI's clean profile, there are no saved credentials. If a form behaves differently with autofill, you won't catch it here.
- **Hidden honeypot fields**: some forms have anti-spam honeypots (hidden inputs that should stay empty). Don't type into hidden fields with `webmobai_type` — it errors anyway. If the form rejects your submission with no clear reason, check the page state for hidden anti-spam fields.
- **Submit button state**: many forms disable submit until valid. If your `webmobai_click` on submit silently does nothing, the button may be disabled. Check `webmobai_evaluate` with `document.querySelector('button[type=submit]').disabled`.

## Example Invocations

User: *"Test the login form at https://example.com/login. Use test@example.com / Password123!"*
→ Happy path with the given creds. Validation cases on email/password fields. A11y pass on error state.

User: *"Verify checkout works on https://shop.example.com — test product is item 42."*
→ Pre-flight check that you're on staging. Multi-step flow: cart → address → payment → confirm. Screenshot each step. Stop before real payment; report whether you can mock or stub the payment step.

User: *"Test signup validation — make sure people can't submit with junk data."*
→ Skip happy path (or run it last). Lead with the validation matrix. Report which cases the form blocks vs. which sneak through.

User: *"The contact form is broken — figure out why."*
→ Diagnostic mode. Happy-path submit, watch `webmobai_check_errors`, inspect network with `webmobai_evaluate` checking `performance.getEntriesByType('resource')` for failed POSTs. Report what you see.
