---
name: authoring-web-scenarios
description: Use when the user wants to turn a live exploration or a plain-English description into a reusable, deterministic JSON scenario they can replay in CI with webmobai-scenario / -suite. Triggers on "write a test", "record this flow", "save as a scenario", "generate a scenario", "make a reusable test", "turn this into a test", "author a scenario", "natural language to test".
---

# Authoring Web Scenarios

## Overview

MCP tools **explore** a page interactively; a **scenario** is the deterministic replay. This skill bridges the two: it captures a flow you (or the user) just performed, or drafts one from a plain-English description, and emits **Scenario JSON** that the standalone `webmobai-scenario` (single file) and `webmobai-suite` (a directory of them) CLIs replay in CI — same steps, same order, every time.

There are two paths to the JSON:
- **`webmobai_generate_scenario`** — inspects the *currently loaded page* (forms, links, CTAs) and scaffolds a starter scenario with `assertVisible`/`assertText` steps and sample form fills. Deterministic, no API key.
- **`webmobai_generate_scenario_from_prompt`** — takes a natural-language goal plus the current page state and asks Claude to compose a validated scenario. **AI-gated** on `WEBMOBAI_ANTHROPIC_API_KEY`.

This skill does **not** run the scenario — it produces reviewed JSON for the user to save and run later. For live end-to-end testing, use `testing-web-app`; for form-specific exercising, `testing-web-forms`; to discover a site first, `exploring-web-app`.

## When to Use

Trigger keywords: write a test, record this flow, save as a scenario, generate a scenario, make a reusable test, turn this into a test, natural language to test.

Use when the user wants a **durable, replayable artifact** — something to commit and run in CI — rather than a one-off interactive check. If they just want to know "does it work right now?", that's `running-web-smoke-test` or `testing-web-app`.

## Inputs You Need

1. **Starting URL** (required). The page the scenario begins on — the browser must be navigated there before scaffolding, since both tools read the *current* page.
2. **The flow** — one of:
   - A description of what to test in plain English (login with a bad password, add to cart, submit contact form), for the prompt-based path, or
   - Nothing extra, if you're scaffolding whatever is on the current page.
3. **A scenario name** (optional, for `generate_scenario`) — human-readable label stored in the JSON.
4. **Credentials** — only if the flow needs auth. Never invent them; ask.

## Workflow

### 1. Launch
`webmobai_launch_browser` (headed by default so the user can watch; `record_video: false` — scenario authoring is not evidence-gathering).

### 2. Navigate to the starting page
`webmobai_navigate` to the target URL. Both generator tools read `page.url()` and the live DOM, so the browser must be on the exact page the scenario should start from.

### 3. (Optional) explore to ground the draft
If the flow spans interactions, drive them once with `webmobai_click`, `webmobai_type`, `webmobai_get_interactive_elements` so you know the real selectors. `webmobai_describe_selector` confirms a selector resolves to what you expect — worth doing before baking it into replayable JSON.

### 4. Generate the scenario
- **From the page as-is:** `webmobai_generate_scenario` with an optional `name`. Returns a starter JSON with detected assertions and sample fills.
- **From a description:** `webmobai_generate_scenario_from_prompt` with `description` (plain English). It reads the current page's title, headings, and interactive elements + selectors and returns a validated scenario. If `WEBMOBAI_ANTHROPIC_API_KEY` is unset, this tool returns a clean "AI disabled" message instead of failing — fall back to `generate_scenario` and hand-edit.

### 5. Review and tighten the JSON (mandatory)
The emitted JSON is a **first draft, never auto-run**. Conform it to the step vocabulary (see below) and:
- Replace brittle selectors (nth-child, generated hashes) with stable ones (`[data-testid]`, roles, labels).
- Replace sample form values with intended ones; strip any real credentials.
- Add explicit `assert*` steps for the outcome that matters (`assertUrl`, `assertText`, `assertVisible`) — a scenario without assertions proves nothing.
- Set `continueOnFailure` only if you want all steps to run regardless; default stops on first failure.
- **Untrusted-page caveat:** steps derived from a page you don't control can encode text/URLs from that page. Read every step before saving; do not blindly trust scaffolded values.

### 6. Save and hand off
Give the user the final JSON and the run command. One file runs with `webmobai-scenario path/to/flow.json`; a directory of scenarios runs as a suite with `webmobai-suite path/to/dir/`. Suggest committing it alongside the app for CI.

### 7. Close
`webmobai_close_browser`.

## Scenario Step Vocabulary

The JSON must conform to this narrow verb set (from `scenario/types.ts`). Top level: `name`, `url`, optional `description`, `viewport`, `browser`, `device`, `continueOnFailure`, and `steps[]`. Each step is one `type`:

- **Actions:** `navigate` (`url`), `click` (`selector`), `type` (`selector`, `text`), `select` (`selector`, `value`), `press` (`key`), `scroll` (`direction`, `amount`), `wait` (`selector` | `urlContains` | `timeoutMs`), `screenshot`.
- **Assertions:** `assertVisible` (`selector`), `assertHidden` (`selector`), `assertText` (`selector`, `expected`, optional `exact`), `assertUrl` (`contains` | `pattern`), `assertCount` (`selector`, `expected`).
- **Advanced:** `route` (`pattern`, `action`: fulfill/abort/continue, optional `status`/`body`/`contentType`) for mocking; `visualSnapshot` (`name`, optional `fullPage`/`threshold`/`selector`/`updateBaseline`) for pixel-diff regression.

Any step outside this set will fail the runner. Verbs mirror the MCP tool names, so what you did live maps 1:1.

## Tools Used

- `mcp__webmobai__webmobai_launch_browser`
- `mcp__webmobai__webmobai_navigate`
- `mcp__webmobai__webmobai_get_interactive_elements` *(optional, to find real selectors)*
- `mcp__webmobai__webmobai_describe_selector` *(optional, to verify a selector)*
- `mcp__webmobai__webmobai_click` / `webmobai_type` *(optional, to walk the flow once)*
- `mcp__webmobai__webmobai_generate_scenario` — scaffold from the current page (no API key)
- `mcp__webmobai__webmobai_generate_scenario_from_prompt` — NL → scenario (needs `WEBMOBAI_ANTHROPIC_API_KEY`)
- `mcp__webmobai__webmobai_close_browser`

You do **not** run assertions, audits, or `generate_report` here — this skill produces JSON, it doesn't execute a test. To run the drafted scenario, use the `webmobai-scenario` / `webmobai-suite` CLIs.

## Output

A reviewed scenario JSON plus the command to run it:

```json
{
  "name": "Login — wrong password shows inline error",
  "url": "https://app.example.com/login",
  "steps": [
    { "type": "type", "selector": "[data-testid=email]", "text": "user@example.com" },
    { "type": "type", "selector": "[data-testid=password]", "text": "wrong-pass" },
    { "type": "click", "selector": "[data-testid=submit]" },
    { "type": "assertVisible", "selector": ".form-error", "description": "inline error appears" },
    { "type": "assertText", "selector": ".form-error", "expected": "Invalid credentials" },
    { "type": "assertUrl", "contains": "/login" }
  ]
}
```

```
Saved: ./scenarios/login-bad-password.json
Run:   webmobai-scenario ./scenarios/login-bad-password.json
Suite: webmobai-suite ./scenarios/      (runs every *.json in the dir)
```

## Tips & Gotchas

- **The page must be right before you generate.** Both tools read the *current* page — navigate (and, for multi-step flows, walk the flow) first, or you'll scaffold the wrong context.
- **Draft ≠ done.** `generate_scenario` emits sample fills and best-guess assertions. Always tighten selectors and assertions by hand before committing.
- **AI path degrades gracefully.** Without `WEBMOBAI_ANTHROPIC_API_KEY`, `generate_scenario_from_prompt` returns "AI disabled" — not an error. Use `generate_scenario` and edit, or set the key.
- **Stable selectors win.** `[data-testid]`, ARIA roles, and label text survive redesigns; nth-child and hashed classes do not. This is the difference between a scenario that lasts and one that flakes next sprint.
- **Assert the outcome, not just the steps.** A scenario that clicks through with no `assert*` step passes even when the app is broken. Add at least one assertion for the thing that matters.
- **Untrusted content.** Scaffolded text/URLs come from the live page. Review every value before saving — never blindly replay page-derived steps.
- **Only the validated scenario is emitted.** The prompt-based tool discards raw model output and returns just the schema-valid JSON; if it couldn't validate, you'll get an error, not garbage.

## Example Invocations

User: *"I just walked through the checkout on staging — turn that into a test I can run in CI."*
→ Ensure the browser is on the checkout page, use `webmobai_generate_scenario` to scaffold, tighten selectors/assertions, hand back JSON + `webmobai-scenario` command.

User: *"Write a test for the login form on https://app.foo.com/login that submits a bad password and checks the error shows."*
→ Navigate there, call `webmobai_generate_scenario_from_prompt` with that description, review the validated JSON, deliver it. If no API key, say so and scaffold + edit instead.

User: *"Save this contact-form flow as a reusable scenario."*
→ Confirm the current page, scaffold with `generate_scenario` (name it "Contact form"), swap in real field values, add an `assertText`/`assertUrl` on the success state, output the file and run command.

User: *"Generate a scenario that adds an item to the cart and verifies the cart count."*
→ Optionally walk it once with `webmobai_click` to confirm selectors, then generate from the prompt, ensuring an `assertCount` (or `assertText`) on the cart badge is in the final JSON.
