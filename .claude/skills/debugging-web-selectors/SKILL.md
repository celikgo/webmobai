---
name: debugging-web-selectors
description: Use when a selector has stopped matching, a test fails on an element that "should be there", or the user wants to understand WHY a locator broke and what to use instead. Drives describe_selector plus the self-healing triage returned on assertion failure. Triggers on "selector broke", "element not found", "locator no longer works", "which selector should I use", "debug this selector", "self-heal", "why did my test fail on this element", "strict mode violation", "matches 0 elements", "matches too many".
---

# Debugging Web Selectors

## Overview

One job: **diagnose a broken or ambiguous selector and hand back a ranked set of replacement candidates** you can retry with. This is WebMobAI's headline self-healing feature, surfaced as a workflow.

Two engines drive it:
- `webmobai_describe_selector` — a live X-ray of what a selector matches *right now*: the match count, and a per-match fingerprint (tag, text, role, aria-label, data-testid, id, class, position, visibility). It answers "is my selector wrong, ambiguous, or just too early?"
- The **self-healing failure triage** baked into `webmobai_assert_visible / hidden / text / count`. When one FAILs, its response already carries a prior-fingerprint snapshot, ranked replacement candidates (each with a `suggestedSelector` and similarity score), and a page-state bundle (current URL, console/network errors, screenshot). This skill exists to read that payload and act on it.

This skill does **not** fix your test files or rewrite a whole scenario — it diagnoses one selector and proposes what to use instead. For running full flows use `testing-web-app` or `testing-web-forms`.

## When to Use

Trigger keywords: selector broke, element not found, locator no longer works, "matches 0 elements", "matches too many", strict-mode violation, "which selector should I use", debug this selector, self-heal, "why did my test fail on this element".

Use when the failing unit is **a single locator**, not the page. If the whole page is blank or erroring, that's a smoke test (`running-web-smoke-test`), not a selector problem.

## Inputs You Need

1. **URL** (required) — the page where the selector should match. Get it to the same state the test was in (logged in, right tab open, right step reached).
2. **The failing selector** (required) — the exact CSS / Playwright locator that broke.
3. **What it was for** (helpful) — visible? contains text? counted? clicked? This picks the assertion verb and sharpens candidate ranking.
4. **The original failure output** (optional but gold) — if the user already has the FAIL text from an assertion, paste it; it may already contain the self-healing candidates and you can skip straight to interpreting them.

## Workflow

### 1. Launch
`webmobai_launch_browser` with `headless: false` (let the user see the element), `record_video: false` (this is diagnosis, not evidence).

### 2. Get to the page state
`webmobai_navigate` to the URL. If the element only appears after interaction (a menu opens, a modal shows), reproduce those steps with `webmobai_click` / `webmobai_type` so the selector has a fair chance to match. Note: those successful interactions also seed the self-healing fingerprint used in step 5.

### 3. X-ray the selector
`webmobai_describe_selector` with the failing `selector` (and `max_matches`, default 10). Read the count first — it splits the diagnosis three ways:
- **0 matches** → wrong or too-early selector. The tool surfaces hints (e.g. "No element with id=... exists", "No element with data-testid=... exists"). If none, the element may be unrendered, in an iframe, or since removed. Try a `webmobai_wait_for` on the selector (short timeout) to rule out a timing race, then re-describe.
- **1 match** → the selector is fine; the failure was likely timing or a state/visibility issue (element present but `0×0` / HIDDEN in the summary). Look at the fingerprint's `visible` flag and position.
- **2+ matches** → **ambiguity / strict-mode**. The tool lists each match with its distinguishing attributes. Pick the one the user meant and build a tighter selector from a stable attribute it *uniquely* has (prefer `data-testid`, then `id`, then `role` + accessible name; avoid position-only `:nth-of-type` unless nothing else is stable).

### 4. Reproduce under the assertion (surfaces the self-healing triage)
Run the assertion verb that matches the original intent so you get the full self-healing payload on FAIL:
- was-it-there → `webmobai_assert_visible`
- should-be-gone → `webmobai_assert_hidden`
- had-specific-text → `webmobai_assert_text` (`expected`, optional `exact`)
- list/row count → `webmobai_assert_count` (`expected`)

Use a realistic `timeout_ms` (default 5000). A PASS here means the selector actually works now — report that the failure was transient/timing. A FAIL returns the triage bundle described next.

### 5. Read the self-healing triage
On FAIL, the `assert_*` response appends (for `visible/hidden/text/count` — **not** `assert_url`, which has no selector):
- **Prior snapshot** — the fingerprint from the last time this selector worked *in this session* (tag, data-testid, role, text). Contrast it with what's on the page now: a changed testid or role tells you exactly what the developers renamed.
- **Suggested replacements** — up to 5 candidates ranked by similarity, each printed as `[score N] <suggestedSelector> — <tag> text="…"`. These are directly retryable locators.
- **Failure context** — current URL, recent console/network errors, and a saved screenshot path. Check the URL first: a redirect to `/login` means the session expired and the selector was never the problem.

### 6. Verify the winning candidate
Take the top-ranked suggested selector (or the tightened one from step 3) and confirm it: `webmobai_describe_selector` on it should now show exactly 1 match, then re-run the same `assert_*` verb → expect PASS.

### 7. Record & close
Optionally log the outcome via `webmobai_add_test_result` (category `Errors`, status `pass` if a working replacement was found, `fail` if none matched). Then `webmobai_close_browser`.

## Tools Used

- `mcp__webmobai__webmobai_launch_browser`
- `mcp__webmobai__webmobai_navigate`
- `mcp__webmobai__webmobai_click` *(conditional — reach the element's state)*
- `mcp__webmobai__webmobai_type` *(conditional — reach the element's state)*
- `mcp__webmobai__webmobai_describe_selector`
- `mcp__webmobai__webmobai_wait_for` *(conditional — rule out timing races)*
- `mcp__webmobai__webmobai_assert_visible` / `webmobai_assert_hidden` / `webmobai_assert_text` / `webmobai_assert_count` *(the verb matching intent — surfaces the self-healing triage on FAIL)*
- `mcp__webmobai__webmobai_add_test_result` *(optional)*
- `mcp__webmobai__webmobai_close_browser`

No `generate_report` — this is a targeted diagnosis, not a report deliverable.

## Output

A short diagnosis and a ranked fix:

```
SELECTOR DIAGNOSIS — #submit-btn on https://app.example.com/checkout
  describe_selector: 0 matches
  Hint: No element with id="submit-btn" exists on the page.
  Prior snapshot (last worked): button[data-testid=checkout-submit] role=button text="Place order"
  Ranked replacements:
    [score 0.95] [data-testid="checkout-submit"]   — button text="Place order"   ← recommended
    [score 0.71] button.btn-primary                — button text="Place order"
    [score 0.44] form footer button                — button text="Continue"
  Verified: [data-testid="checkout-submit"] → 1 match, assert_visible PASS.
  Root cause: the id was renamed; use the data-testid, which is stable.
```

Ambiguity case:

```
SELECTOR DIAGNOSIS — .btn on https://example.com  (strict-mode / ambiguous)
  describe_selector: 4 matches
    [1] <button data-testid="save"> "Save"        (12,80 90x36)
    [2] <button data-testid="cancel"> "Cancel"    (110,80 90x36)
    [3] <a role="button"> "Learn more"            (12,300 120x20)
    [4] <button> "Close" — HIDDEN (0×0)
  Fix: you likely meant [1]. Use [data-testid="save"] (unique, stable) instead of .btn.
```

## Tips & Gotchas

- **The ranked candidates need a prior success in this session.** The self-healing fingerprint is recorded when a selector *works* (via a successful click/type). A brand-new session with no prior success gives you the failure context but no "prior snapshot" and possibly no candidates — in that case lean on `describe_selector`'s live match list to build the replacement yourself.
- **`assert_url` has no self-healing.** It isn't selector-based, so it emits only the page-state context, not candidates. Wrong-URL failures are usually redirects, not selectors.
- **0 matches ≠ wrong selector.** It's often a timing race (SPA not hydrated) or a wrong page state. Always try a short `webmobai_wait_for` and confirm you're on the right URL before declaring the selector dead.
- **Prefer stable attributes.** Rank replacements you propose: `data-testid` > `id` > `role` + accessible name > text > class. Positional selectors (`:nth-of-type`, `nth=`) are last resort — they re-break on the next layout change.
- **HIDDEN (0×0) in the fingerprint** means the element exists but isn't visible — `assert_visible` correctly fails. That's a display/state bug, not a selector bug; don't "fix" it by swapping selectors.
- **Check the failure-context URL first.** A silent redirect to `/login` (session expired) masquerades as "element not found." The triage bundle shows it.
- **Don't retry to force a pass.** If no candidate matches, the honest answer is "the element is gone" — report it, don't invent a selector.

## Example Invocations

User: *"My test broke — `#submit-btn` on the checkout page can't be found anymore. Why?"*
→ Launch, navigate to checkout, `describe_selector('#submit-btn')` (0 matches + id hint), run `assert_visible` to pull the self-healing candidates, verify the top `data-testid` replacement, report the renamed-id root cause.

User: *"`.btn` gives a strict-mode violation. Which selector should I actually use?"*
→ `describe_selector('.btn')` → list all matches with their distinguishing attributes, identify the intended one, propose a unique `data-testid`/`id`-based locator and confirm it resolves to 1.

User: *"Debug this selector: `[data-testid=hero] h1` — the test says the text is wrong."*
→ Navigate, `describe_selector` to confirm it matches once, then `assert_text` with the expected string; read the FAIL's "Last seen" text and the triage to show what the heading actually says now.

User: *"Self-heal the login button locator on staging."*
→ Reproduce the click that used to work (seeds the fingerprint), trigger the failing `assert_visible`, and surface the ranked replacement candidates from the self-healing payload; hand back the top one, verified.
