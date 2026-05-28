# Scenario Format

A WebMobAI **scenario** is a JSON document describing a deterministic browser
flow — a sequence of actions and assertions a tester (or an AI) wants
replayed. The runner executes the steps in order, stops on the first failure
(unless `continueOnFailure` is set), and emits an HTML report, a JUnit XML,
and a Playwright trace.

Run a scenario with:

```bash
webmobai-scenario ./scenarios/login.json
```

Run a collection (suite) with parallelism, sharding, and tag filters with
`webmobai-suite`. The suite format (which wraps scenarios) is documented at
the bottom of this file.

The canonical source of truth for every type is
[`mcp-server/src/scenario/types.ts`](../mcp-server/src/scenario/types.ts).
If anything in this doc disagrees with the types, the types win.

---

## Top-level shape

```jsonc
{
  "name": "string",                 // Required. Used in reports + UI.
  "url": "https://app.example.com", // Required. Starting URL for the run.
  "description": "string",          // Optional. Documentation only.
  "viewport": { "width": 1280, "height": 720 }, // Optional. Defaults to suite/Run config.
  "browser": "chromium",            // Optional: "chromium" | "firefox" | "webkit"
  "device": "iPhone 13",            // Optional. Playwright device preset. Overrides viewport.
  "continueOnFailure": false,       // Optional. Default false — stop on first fail.
  "steps": [ /* see below */ ]
}
```

Set `continueOnFailure: true` for a tolerant pass where you want every step
attempted so you can collect all failures at once (useful for exploratory
sweeps).

---

## Step verbs

Every step is one verb. The runner dispatches on the `type` field. Fields
marked **(required)** must be present; optional fields default to sensible
behavior.

### Navigation and interaction

#### `navigate`
Goes to a new URL. Use `wait` after if you need to verify the destination.

```json
{ "type": "navigate", "url": "https://example.com/dashboard" }
```

#### `click`
Click an element by CSS selector. Records a selector fingerprint for
self-healing on later misses.

```json
{ "type": "click", "selector": "[data-testid=submit]", "description": "Submit the form" }
```

#### `type`
Fill an input. Replaces existing content.

```json
{ "type": "type", "selector": "#email", "text": "user@example.com" }
```

#### `select`
Choose an option in a `<select>` element by value or visible label.

```json
{ "type": "select", "selector": "#country", "value": "DE" }
```

#### `press`
Press a keyboard key (Playwright key syntax — `"Enter"`, `"Tab"`,
`"ArrowDown"`, `"Shift+Tab"`).

```json
{ "type": "press", "key": "Enter" }
```

#### `scroll`
Scroll the page.

```json
{ "type": "scroll", "direction": "down", "amount": 800 }
```

`direction` defaults to `"down"`. `amount` is in pixels; omit for a sensible
default.

#### `wait`
Wait for a selector, a URL substring, or a raw timeout.

```jsonc
{ "type": "wait", "selector": "[data-testid=loaded]", "timeoutMs": 5000 }
{ "type": "wait", "urlContains": "/welcome", "timeoutMs": 5000 }
{ "type": "wait", "timeoutMs": 1000 } // raw delay — last resort
```

Prefer the selector or URL forms — raw timeouts are flaky.

### Assertions

All assertions auto-wait up to `timeoutMs` (default 5000) before failing.
Failure responses include the
[**failure-triage bundle**](../FEATURES.md#23-assertions-real-e2e) — last
console errors, last network errors, current URL, screenshot path — and, for
selector-based assertions, the **self-healing diagnostic**: prior element
fingerprint plus ranked candidate replacement selectors.

#### `assertVisible` / `assertHidden`

```json
{ "type": "assertVisible", "selector": "[data-testid=success-banner]" }
{ "type": "assertHidden",  "selector": ".loading-spinner" }
```

#### `assertText`

```jsonc
{ "type": "assertText", "selector": "h1", "expected": "Welcome" }
{ "type": "assertText", "selector": "h1", "expected": "Welcome back, Alex", "exact": true }
```

Substring match by default; `exact: true` requires the full text to match.

#### `assertUrl`

```jsonc
{ "type": "assertUrl", "contains": "/dashboard" }
{ "type": "assertUrl", "pattern": "^https://app\\.example\\.com/u/\\d+$" }
```

`pattern` is a regular expression source string (no slashes).

#### `assertCount`

```json
{ "type": "assertCount", "selector": ".product-card", "expected": 12 }
```

### Other verbs

#### `screenshot`
Capture a screenshot of the current viewport. Saved in the session dir; the
HTML report embeds them automatically.

```json
{ "type": "screenshot", "description": "After login" }
```

#### `route`
Intercept matching requests. Useful for mocking flaky backends.

```jsonc
{ "type": "route", "pattern": "**/api/users", "action": "fulfill", "status": 200,
  "body": "{\"users\":[]}", "contentType": "application/json" }
{ "type": "route", "pattern": "**/analytics/**", "action": "abort" }
{ "type": "route", "pattern": "**/api/orders", "action": "continue" }
```

#### `visualSnapshot`
Pixel-perfect visual regression — first run captures the baseline,
subsequent runs diff against it. Mismatches write `.actual.png` and
`.diff.png` alongside the baseline. Sprint 16 archives the prior baseline as
`.v<unix-ms>.png` on overwrite so history is preserved.

```jsonc
{ "type": "visualSnapshot", "name": "checkout/cart-empty" }
{ "type": "visualSnapshot", "name": "welcome", "fullPage": true, "baselineDir": "./visual-baselines" }
```

Tolerance fields (all optional): `threshold` (per-pixel color sensitivity
0–1, default 0.2), `maxDiffPixels` (absolute), `maxDiffPixelRatio`
(proportional, default 0.01 = 1%). Set `updateBaseline: true` to overwrite
an existing baseline after an intentional UI change.

---

## Complete example

`./scenarios/signup-happy-path.json`:

```json
{
  "name": "Signup happy path",
  "url": "https://app.example.com/signup",
  "description": "New user signs up with a fresh email and lands on /welcome",
  "viewport": { "width": 1280, "height": 720 },
  "steps": [
    { "type": "assertVisible", "selector": "h1" },
    { "type": "type", "selector": "#email", "text": "test@example.com" },
    { "type": "type", "selector": "#password", "text": "TestPass123!" },
    { "type": "click", "selector": "[data-testid=submit]" },
    { "type": "wait", "urlContains": "/welcome", "timeoutMs": 10000 },
    { "type": "assertText", "selector": "h1", "expected": "Welcome" },
    { "type": "visualSnapshot", "name": "welcome", "baselineDir": "./visual-baselines" }
  ]
}
```

Run it:

```bash
webmobai-scenario ./scenarios/signup-happy-path.json
```

You'll get:

- `report-<ts>.html` — visual HTML report with screenshots
- `report-<ts>.junit.xml` — JUnit XML for CI
- `report-<ts>.pdf` *(Sprint 16, auto-test only)*
- `trace.zip` — Playwright trace; drop into <https://trace.playwright.dev>
- `~/.webmobai/history.json` — appended summary for regression detection

---

## Suite format (parallel + sharded)

A **suite** runs a collection of scenarios with bounded concurrency. It
lives in its own JSON file:

```jsonc
{
  "name": "Pre-deploy E2E",
  "defaults": {                                  // optional, cascades onto scenarios
    "browser": "chromium",
    "viewport": { "width": 1280, "height": 720 },
    "continueOnFailure": false
  },
  "scenarios": [
    { "path": "./scenarios/login.json",    "tags": ["smoke", "auth"] },
    { "path": "./scenarios/signup.json",   "tags": ["e2e", "auth"] },
    { "path": "./scenarios/checkout.json", "tags": ["e2e"] },
    // Inline form is also supported:
    { "scenario": { /* a full Scenario object */ }, "tags": ["inline-example"] }
  ]
}
```

`path` is resolved relative to the suite file. Use `scenario` for inline
scenarios when you don't want to create a separate file.

CLI flags for `webmobai-suite`:

| Flag | What it does |
|---|---|
| `--workers N` | Run up to N scenarios in parallel (default 4) |
| `--shard k/n` | Run only the kth slice of n (deterministic striping — `--shard 1/4` takes scenarios 0/4/8…). Combine with CI parallelism. |
| `--tag T` | Only run scenarios with tag T (repeatable; multiple tags OR together) |
| `--exclude-tag T` | Skip scenarios with tag T (repeatable; exclude wins over include) |
| `--reporter html\|junit\|both\|none` | Which report formats to write |
| `--out DIR` | Output directory (default: per-session temp) |

Exit codes:

| Code | Meaning |
|---|---|
| 0 | All scenarios passed |
| 1 | At least one scenario failed |
| 2 | Suite couldn't load (file error, malformed JSON) |

---

## Generating scenarios

Three ways to author one without writing JSON by hand:

1. **`webmobai-codegen <url>`** — opens a headed Chromium, records your
   clicks/typing/navigations, and emits a starter scenario. Passwords are
   redacted on output.
2. **MCP `webmobai_generate_scenario`** — inspects the current live page
   (forms, CTAs, nav links) and emits a starter scenario for Claude to
   refine.
3. **MCP `webmobai_generate_scenario_from_prompt`** *(Sprint 15, opt-in via
   `WEBMOBAI_ANTHROPIC_API_KEY`)* — converts a natural-language description
   plus the live page into a fully-validated scenario.
