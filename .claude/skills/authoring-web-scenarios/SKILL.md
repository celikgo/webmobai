---
name: authoring-web-scenarios
description: Use when the user wants to turn a live exploration or a plain-English description into a reusable, deterministic JSON scenario they can replay in CI with webmobai-scenario / -suite. Triggers on "write a test", "record this flow", "save as a scenario", "generate a scenario", "make a reusable test", "turn this into a test", "author a scenario", "natural language to test".
---

# Authoring Web Scenarios

## Overview

MCP tools **explore** a page interactively; a **scenario** is the deterministic replay. This skill bridges the two: it captures a flow you (or the user) just performed, or drafts one from a plain-English description, and emits **Scenario JSON** that the standalone `webmobai-scenario` (one scenario file) and `webmobai-suite` (one *suite* file listing many scenarios) CLIs replay in CI — same steps, same order, every time.

There are two paths to the JSON:
- **`webmobai_generate_scenario`** — inspects the *currently loaded page* (forms, links, CTAs) and scaffolds a starter scenario with `assertVisible`/`assertText` steps and sample form fills. Deterministic, no API key.
- **`webmobai_generate_scenario_from_prompt`** — takes a natural-language goal plus the current page state and asks Claude to compose a validated scenario. **AI-gated** on `WEBMOBAI_ANTHROPIC_API_KEY`.

Neither generator emits the full format. Both are limited to a subset of the verb set, and the AI path's validation schema hard-rejects anything outside it — see "What the generators can't emit" below. Anything authenticated, mocked, or manual you add by hand.

`docs/SCENARIO_FORMAT.md` is the full human-readable spec and mirrors `mcp-server/src/scenario/types.ts`; point the user there for anything this skill summarizes.

This skill does **not** run the scenario — it produces reviewed JSON for the user to save and run later. For live end-to-end testing, use `testing-web-app`; for form-specific exercising, `testing-web-forms`; to discover a site first, `exploring-web-app`. To wire the finished scenarios into a CI gate (suite files, `--workers`, `--shard`, `--tag`, JUnit, exit codes), hand off to `running-web-ci-suites`. To author anything that runs behind a login, pair with `testing-web-authenticated-sessions`.

## When to Use

Trigger keywords: write a test, record this flow, save as a scenario, generate a scenario, make a reusable test, turn this into a test, natural language to test.

Use when the user wants a **durable, replayable artifact** — something to commit and run in CI — rather than a one-off interactive check. If they just want to know "does it work right now?", that's `running-web-smoke-test` or `testing-web-app`.

## Inputs You Need

1. **Starting URL** (required). The page the scenario begins on — the browser must be navigated there before scaffolding, since both tools read the *current* page.
2. **The flow** — one of:
   - A description of what to test in plain English (login with a bad password, add to cart, submit contact form), for the prompt-based path, or
   - Nothing extra, if you're scaffolding whatever is on the current page.
3. **A scenario name** (optional, for `generate_scenario`) — human-readable label stored in the JSON.
4. **Auth** — if the flow runs behind a login, what you need is a **saved `storageState` file**, not credentials in the scenario. Ask where that file lives (or send the user to `testing-web-authenticated-sessions` to capture one) and set the top-level `storageState` field. Never invent credentials, and never leave a real password in a committed `type` step.

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
- If the flow needs a login, add the top-level `storageState` field rather than scripting the login as steps.
- **Untrusted-page caveat:** steps derived from a page you don't control can encode text/URLs from that page. Read every step before saving; do not blindly trust scaffolded values.

### 6. Save and hand off
Give the user the final JSON and the run command:

```
webmobai-scenario ./scenarios/flow.json
webmobai-scenario ./scenarios/flow.json --storage-state ./auth.json
```

For several scenarios, `webmobai-suite` takes a **suite JSON file** — it does not accept a directory, and passing one is a hard error. The suite file names the scenarios explicitly:

```json
{
  "name": "Pre-deploy E2E",
  "defaults": { "browser": "chromium", "viewport": { "width": 1280, "height": 720 } },
  "scenarios": [
    { "path": "./scenarios/login.json", "tags": ["smoke", "auth"] },
    { "path": "./scenarios/checkout.json", "tags": ["e2e"] }
  ]
}
```

```
webmobai-suite ./scenarios/suite.json
```

`path` entries resolve relative to the suite file's own directory. Suggest committing both the scenarios and the suite file alongside the app; `running-web-ci-suites` covers the CI wiring.

### 7. Close
`webmobai_close_browser`.

## Scenario Step Vocabulary

The JSON must conform to this verb set (from `scenario/types.ts`; `docs/SCENARIO_FORMAT.md` is the prose spec).

**Top level:** `name` (required), `url` (required), `steps[]` (required), plus optional `description`, `viewport`, `browser`, `device`, `continueOnFailure`, and **`storageState`**.

`storageState` is a path to a Playwright storageState JSON captured from a prior logged-in session. When set, the scenario launches already authenticated and its steps can reach pages behind a login:

```json
{
  "name": "Checkout as a logged-in user",
  "url": "https://app.example.com/cart",
  "storageState": "auth.json",
  "steps": [
    { "type": "assertVisible", "selector": "[data-testid=user-menu]", "description": "Session is still valid" },
    { "type": "click", "selector": "[data-testid=checkout]" },
    { "type": "wait", "urlContains": "/checkout", "timeoutMs": 15000 },
    { "type": "assertText", "selector": "h1", "expected": "Checkout" }
  ]
}
```

The file holds live session cookies and localStorage — it is a credential. Gitignore it, and never inline its contents into the scenario.

**17 step verbs**, each step being one `type`:

- **Actions:** `navigate` (`url`), `click` (`selector`), `type` (`selector`, `text`), `select` (`selector`, `value`), `press` (`key`), `scroll` (`direction`, `amount`), `wait` (`selector` | `urlContains` | `timeoutMs`), `screenshot`.
- **Assertions:** `assertVisible` (`selector`), `assertHidden` (`selector`), `assertText` (`selector`, `expected`, optional `exact`), `assertUrl` (`contains` | `pattern` — at least one is required; a call with neither is a hard FAIL, not a vacuous pass), `assertCount` (`selector`, `expected`). All five take an optional `timeoutMs`.
- **Advanced:** `route` (`pattern`, `action`: fulfill/abort/continue, optional `status`/`body`/`contentType`) for mocking; `visualSnapshot` (`name`, optional `baselineDir`/`selector`/`fullPage`/`threshold`/`maxDiffPixels`/`maxDiffPixelRatio`/`updateBaseline`) for pixel-diff regression.
- **Auth:** `saveStorageState` and `pauseForManual` — below.

Most steps also accept an optional `description`, which becomes the step's label in the report; **`navigate`, `scroll`, and `route` do not** — those three fall back to a generated label (`Navigate to <url>`, `Scroll down 500px`, `Route <pattern> → <action>`). Any step type outside this set throws. Verbs mirror the MCP tool names, so what you did live maps 1:1.

### `saveStorageState`

Persists the current — typically just-logged-in — session to a file, mid-scenario. `path` is required:

```json
{ "type": "saveStorageState", "path": "auth.json", "description": "Persist the logged-in session" }
```

It captures cookies and localStorage. It does **not** capture sessionStorage or IndexedDB — an app that keeps its token there cannot be replayed this way at all. With no `description`, the report labels the step "Save authenticated session (storageState)". As a *step*, the path is deliberately never logged — though the `--save-storage-state` CLI flag and the `webmobai_save_storage_state` MCP tool both do print it, so don't promise the filename stays private either way. Only the file's contents are protected.

### `pauseForManual`

Gives a human a bounded window to complete an MFA code, CAPTCHA, or SSO consent, then continues. Both fields optional:

```json
{ "type": "pauseForManual", "prompt": "Enter the MFA code in the browser window", "timeoutMs": 120000 }
```

- Default `prompt`: `Complete the manual step (MFA / CAPTCHA / SSO), then wait.`
- Default `timeoutMs`: **30000**, clamped to a hard ceiling of **300000** (5 minutes). An SSO flow longer than that cannot be waited out in one step.
- The wait is a **blind timer**, not a keypress or stdin read. It always burns the full window; a human finishing early does not shorten it.
- **In headless mode it is a no-op**: it logs a warning to stderr, records the step as **pass**, and continues immediately.

**Read that last point carefully before writing a capture scenario.** `webmobai-scenario` and `webmobai-suite` both launch hardcoded headless, and neither has a `--headed` flag. So a scenario shaped "log in → pauseForManual for MFA → saveStorageState" run through the CLI will skip the pause, save a **pre-MFA, unauthenticated** `auth.json`, and report every step green. The reliable way to capture a session behind MFA is the interactive MCP flow (headed browser, human acts between tool calls, then `webmobai_save_storage_state`) — that's `testing-web-authenticated-sessions`. Author `pauseForManual` only for a programmatic headed runner, and say so when you hand the file over.

### What the generators can't emit

Neither generator produces the auth surface, so you add it by hand:

- `webmobai_generate_scenario` (the deterministic scaffolder) never emits `storageState`, `saveStorageState`, or `pauseForManual`.
- `webmobai_generate_scenario_from_prompt` is stricter still: its prompt vocabulary and its validation schema both omit `route`, `saveStorageState`, and `pauseForManual`, and its top-level schema accepts only `name`, `url`, `description`, and `steps` — so `viewport`, `browser`, `device`, `continueOnFailure`, and `storageState` are dropped even if the model tries. Its `visualSnapshot` is limited to `name` + `fullPage`.

Add those fields in the review step (step 5). A generated scenario is never the finished file when auth or mocking is involved.

## Non-Success Is a Step Failure (v1.4.0)

For the steps the runner implements by calling a tool handler — the five assertions, `route`, and `visualSnapshot` — the runner now requires an **explicit success prefix** in the tool's response and treats anything else as a failed step:

| Step | Accepted success prefix |
|---|---|
| `assertVisible` / `assertHidden` / `assertText` / `assertUrl` / `assertCount` | `PASS` |
| `route` | `Route active` |
| `visualSnapshot` | `PASS` or `Visual baseline` |

Previously a handler that returned `Error executing …` or a validation string — a failed route install, a bad snapshot selector, a capture error — was ignored and the step recorded a pass. That is the "reports green on a red build" defect this closes.

Two consequences worth telling the user about:

- **A scenario that passed on 1.3.x can legitimately fail on 1.4.0** without the app changing. The most common case is a `route` step whose mock never actually installed: later steps were silently hitting the real backend, and the run was green. It failing now is the fix working.
- `assertUrl` with neither `contains` nor `pattern` used to evaluate vacuously true and report PASS. It now returns a FAIL explaining nothing was verified. Grep drafted scenarios for bare `assertUrl` steps before committing.

A first-run `visualSnapshot` is a pass (`Visual baseline created`), so a scenario's very first CI run establishes baselines rather than failing — expect real comparison from the second run on.

## Tools Used

- `mcp__webmobai__webmobai_launch_browser`
- `mcp__webmobai__webmobai_navigate`
- `mcp__webmobai__webmobai_get_interactive_elements` *(optional, to find real selectors)*
- `mcp__webmobai__webmobai_describe_selector` *(optional, to verify a selector)*
- `mcp__webmobai__webmobai_click` / `webmobai_type` *(optional, to walk the flow once)*
- `mcp__webmobai__webmobai_generate_scenario` — scaffold from the current page (no API key)
- `mcp__webmobai__webmobai_generate_scenario_from_prompt` — NL → scenario (needs `WEBMOBAI_ANTHROPIC_API_KEY`)
- `mcp__webmobai__webmobai_save_storage_state` *(only when the user needs an `auth.json` to reference from `storageState` and is logged in right now — the fuller capture workflow is `testing-web-authenticated-sessions`)*
- `mcp__webmobai__webmobai_close_browser`

You do **not** run assertions, audits, or `generate_report` here — this skill produces JSON, it doesn't execute a test. There is also **no MCP tool that runs a scenario file**; to execute the draft, use the `webmobai-scenario` / `webmobai-suite` CLIs.

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
Suite: webmobai-suite ./scenarios/suite.json   (a suite FILE listing scenarios — never a directory)
```

If the scenario runs authenticated, the run line is `webmobai-scenario ./scenarios/flow.json --storage-state ./auth.json`. Note the flag beats the file's own `storageState` in `webmobai-scenario`, but **loses** to it in `webmobai-suite` — a scenario that hardcodes `"storageState": "dev-auth.json"` will ignore `--storage-state ci-auth.json` inside a suite. Leave the field unset in scenarios you intend to point at a different session per environment.

## Tips & Gotchas

- **The page must be right before you generate.** Both tools read the *current* page — navigate (and, for multi-step flows, walk the flow) first, or you'll scaffold the wrong context.
- **Draft ≠ done.** `generate_scenario` emits sample fills and best-guess assertions. Always tighten selectors and assertions by hand before committing.
- **AI path degrades gracefully.** Without `WEBMOBAI_ANTHROPIC_API_KEY`, `generate_scenario_from_prompt` returns "AI disabled" — not an error. Use `generate_scenario` and edit, or set the key.
- **Stable selectors win.** `[data-testid]`, ARIA roles, and label text survive redesigns; nth-child and hashed classes do not. This is the difference between a scenario that lasts and one that flakes next sprint.
- **Assert the outcome, not just the steps.** A scenario that clicks through with no `assert*` step passes even when the app is broken. Add at least one assertion for the thing that matters.
- **Untrusted content.** Scaffolded text/URLs come from the live page. Review every value before saving — never blindly replay page-derived steps.
- **Only the validated scenario is emitted.** The prompt-based tool discards raw model output and returns just the schema-valid JSON; if it couldn't validate, you'll get an error, not garbage. The flip side is that anything outside its narrow schema — `storageState`, `route`, `saveStorageState`, `pauseForManual`, `viewport`, `browser`, `continueOnFailure` — is dropped silently rather than surfaced as a warning. Diff the output against what you asked for.
- **`webmobai-suite` takes a file, not a folder.** Pointing it at a directory fails; the loader reads the path as JSON and requires a `name` string plus a `scenarios` array. Always hand over a suite file.
- **Auth belongs in `storageState`, not in steps.** A scenario that types a username and password is a scenario that ships a credential in git, re-runs a login on every CI job, and breaks the moment MFA is enabled. Reference a session file instead.
- **`pauseForManual` silently passes in headless.** It is not a way to make a CLI run wait for a human — see the verb section. Never combine it with `saveStorageState` in a file you tell the user to run through `webmobai-scenario`.
- **Relative paths resolve against the invoking cwd**, not the scenario or suite file's directory — `storageState` included (unlike suite `path` entries, which *are* suite-relative). A suite-relative-looking `"./auth.json"` will be looked up wherever the CLI was launched from. Say which directory the command assumes.

## Example Invocations

User: *"I just walked through the checkout on staging — turn that into a test I can run in CI."*
→ Ensure the browser is on the checkout page, use `webmobai_generate_scenario` to scaffold, tighten selectors/assertions, hand back JSON + `webmobai-scenario` command.

User: *"Write a test for the login form on https://app.example.com/login that submits a bad password and checks the error shows."*
→ Navigate there, call `webmobai_generate_scenario_from_prompt` with that description, review the validated JSON, deliver it. If no API key, say so and scaffold + edit instead.

User: *"Save this contact-form flow as a reusable scenario."*
→ Confirm the current page, scaffold with `generate_scenario` (name it "Contact form"), swap in real field values, add an `assertText`/`assertUrl` on the success state, output the file and run command.

User: *"Generate a scenario that adds an item to the cart and verifies the cart count."*
→ Optionally walk it once with `webmobai_click` to confirm selectors, then generate from the prompt, ensuring an `assertCount` (or `assertText`) on the cart badge is in the final JSON.

User: *"Write a test for the account settings page — it's behind our login."*
→ Don't script the login. Ask whether a `storageState` file already exists; if not, hand off to `testing-web-authenticated-sessions` to capture one. Then author the scenario against the settings URL with top-level `"storageState": "auth.json"` and a first step asserting a logged-in marker (`assertVisible` on the user menu) so an expired session fails loudly instead of looking like a missing element.

User: *"Turn these five scenarios into something our CI can run."*
→ Write a suite **file** — `{name, defaults, scenarios: [{path, tags}]}` — with paths relative to the suite file, tag each scenario, and hand back `webmobai-suite ./scenarios/suite.json`. Correct the user if they expected to point the CLI at a directory. Then hand off to `running-web-ci-suites` for workers, sharding, JUnit, and exit codes.

User: *"This scenario passed last release and fails now, but we didn't touch the app."*
→ Check for a `route`, `visualSnapshot`, or bare `assertUrl` step. v1.4.0 stopped treating a non-success tool response as a pass, so a mock that never installed (or an `assertUrl` with no matcher) that used to report green now reports the failure it always was. Explain the change rather than loosening the scenario.
