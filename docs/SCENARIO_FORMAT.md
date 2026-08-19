# Scenario Format

A WebMobAI **scenario** is a JSON document describing a deterministic browser
flow — a sequence of actions and assertions a tester (or an AI) wants
replayed. The runner executes the steps in order, stops on the first failure
(unless `continueOnFailure` is set), and emits an HTML report, a JUnit XML,
and a Playwright trace.

Run a scenario with:

```bash
webmobai-scenario ./scenarios/login.json
webmobai-scenario ./scenarios/login.json --storage-state auth.json
webmobai-scenario ./scenarios/login.json --save-storage-state auth.json
```

Run a collection (suite) with parallelism, sharding, and tag filters with
`webmobai-suite`. The suite format (which wraps scenarios) is documented at
the bottom of this file.

Both CLI runners are **hardcoded headless** — there is no `--headed` flag.
This matters for one verb; see [`pauseForManual`](#pauseformanual).

The canonical source of truth for every type is
[`mcp-server/src/scenario/types.ts`](../mcp-server/src/scenario/types.ts),
and for execution semantics
[`mcp-server/src/scenario/runner.ts`](../mcp-server/src/scenario/runner.ts).
If anything in this doc disagrees with those files, the source wins.

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
  "storageState": "./auth.json",    // Optional. Playwright storageState JSON — run already authenticated.
  "steps": [ /* see below */ ]
}
```

The runner always navigates to `url` before executing step 1, so a scenario
that supplies `storageState` lands on its target URL already logged in.

Set `continueOnFailure: true` for a tolerant pass where you want every step
attempted so you can collect all failures at once (useful for exploratory
sweeps).

### `storageState`

Path to a Playwright storageState JSON (cookies + per-origin localStorage)
captured from a prior logged-in session. The file is a **credential** — keep it
out of version control.

Precedence differs between the two runners, and this is real, not a typo:

| Runner | Rule |
|---|---|
| `webmobai-scenario` | `--storage-state` **overrides** this field |
| `webmobai-suite` | this field (and `defaults.storageState`) **override** `--storage-state` |

Relative paths resolve against the **invoking cwd**, not the scenario file's
directory. Use absolute paths in CI. Full detail — capture, expiry, secret
hygiene, limitations — in [`AUTHENTICATION.md`](AUTHENTICATION.md).

---

## Step verbs

Every step is one verb. The runner dispatches on the `type` field. Fields
marked **(required)** must be present; optional fields default to sensible
behavior. There are **17 verbs**.

Most verbs accept an optional `description`, which replaces the auto-generated
label in the report. Three do **not** — `navigate`, `scroll`, and `route` —
their type definitions have no `description` field.

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

`direction` defaults to `"down"`. `amount` is in pixels and defaults to `500`.

#### `wait`
Wait for a selector, a URL substring, or a raw timeout.

```jsonc
{ "type": "wait", "selector": "[data-testid=loaded]", "timeoutMs": 5000 }
{ "type": "wait", "urlContains": "/welcome", "timeoutMs": 5000 }
{ "type": "wait", "timeoutMs": 1000 } // raw delay — last resort
```

`timeoutMs` defaults to **10000**. The three forms are evaluated in strict
priority order — `selector` first, then `urlContains`, then the raw timeout —
so a step that sets both `selector` and `urlContains` only ever waits on the
selector. `urlContains` is matched as the glob `**/*<value>*`.

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
Comparison is against the element's trimmed `innerText` and is
**case-sensitive**. On failure the message echoes the last-seen text, truncated
to 120 characters.

#### `assertUrl`

```jsonc
{ "type": "assertUrl", "contains": "/dashboard" }
{ "type": "assertUrl", "pattern": "^https://app\\.example\\.com/u/\\d+$" }
```

`pattern` is a regular expression source string (no slashes). Both matchers may
be given, in which case both must hold.

**v1.4.0 behavior change:** an `assertUrl` step with **neither** `contains` nor
`pattern` now fails with
`FAIL — assert_url requires 'contains' or 'pattern'; neither was supplied, so
there is nothing to verify.` Previously it evaluated `true && true` and reported
PASS. This is the one v1.4.0 change that can flip an existing scenario from
green to red — and if it does, that scenario was never verifying anything.

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

### Authenticated-session verbs

#### `saveStorageState`
Persist the current (typically just-logged-in) session to a Playwright
storageState JSON so later runs can replay authenticated.

```json
{ "type": "saveStorageState", "path": "auth.json", "description": "Persist the logged-in session" }
```

| Field | Required | Notes |
|---|---|---|
| `path` | **yes** | Where to write the JSON. Relative paths resolve against the invoking cwd. No parent directory is created for you. |
| `description` | no | Report label. Defaults to `Save authenticated session (storageState)`. |

The written file contains session tokens. Gitignore it — the repo's
`.gitignore` covers `auth.json`, `*.auth.json`, and `*storage-state*.json`, and
nothing else. The runner never logs the path or the contents.

Use this for a **non-interactive** login. For anything with MFA, capture over
MCP instead — see [`AUTHENTICATION.md` §3](AUTHENTICATION.md#3-creating-a-session--three-surfaces).

#### `pauseForManual`
Give a human a bounded window to complete a manual step — an MFA code, a
CAPTCHA, an SSO consent screen — before the scenario continues. Typically paired
with a following `saveStorageState`.

```json
{ "type": "pauseForManual", "prompt": "Enter the MFA code in the browser window", "timeoutMs": 120000 }
```

| Field | Required | Notes |
|---|---|---|
| `prompt` | no | Logged message. Defaults to `Complete the manual step (MFA / CAPTCHA / SSO), then wait.` |
| `timeoutMs` | no | Default **30000**, clamped to `[0, 300000]`. |
| `description` | no | Report label. Defaults to `Pause for manual step (<prompt>)`. |

**Read this before using it.** In headless mode there is no human, so the verb
logs a warning to stderr, records the step as **pass**, and returns
immediately — and **both shipped CLI runners are hardcoded headless**.
`webmobai-scenario` has no `--headed` flag, and no MCP tool runs a scenario
file. So under the CLI this verb never pauses, and a capture scenario shaped
`login → pauseForManual → saveStorageState` will write a **pre-MFA,
unauthenticated** file while reporting every step green.

Even in a headed programmatic run (a caller that constructs its own
`BrowserManager` and calls `runScenario`), the wait is a blind
`page.waitForTimeout` — it does not detect completion, does not read stdin,
cannot be shortened by finishing early, and cannot exceed five minutes.

---

## Step failure semantics (v1.4.0)

The runner marks a step **failed** when it throws — and, since v1.4.0, also
when the underlying tool returns anything that is not an explicit success
string. Each delegating verb whitelists its success prefixes:

| Verb | Accepted as pass |
|---|---|
| `route` | text starting with `Route active` |
| `visualSnapshot` | text starting with `PASS` or `Visual baseline` |
| the five `assert*` verbs | text starting with `PASS` |

Anything else — `Error executing …`, a validation message, an empty
response — throws and fails the step.

This closed a real false-green class: before v1.4.0 a failed route install left
the mock uninstalled while the step passed and later steps silently hit the
real backend, and a capture error or missing baseline in `visualSnapshot`
reported green. If a scenario that used to pass now fails on a `route` or
`visualSnapshot` step, the step was not doing what its report claimed.

On the first failed step the runner halts and marks every remaining step
`skipped`, unless the scenario sets `continueOnFailure: true`. Skipped steps
alone never affect the exit code — they only exist after a failure.

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
- `junit-<ts>.xml` — JUnit XML for CI
- `trace.zip` — Playwright trace; drop into <https://trace.playwright.dev>

No PDF and no run-history entry: `report-<ts>.pdf` and the `~/.webmobai/history.json`
append are emitted by `webmobai-test` only (and by `webmobai-monitor`, which spawns it).

All of these land in a fresh session directory under
`<os.tmpdir()>/webmobai-<ts>-<rand>/`, whose paths `webmobai-scenario` prints
on completion. Only `webmobai-suite --out DIR` writes aggregate reports to a
directory you choose.

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
    "device": "iPhone 13",                       // optional; overrides viewport
    "continueOnFailure": false,
    "storageState": "./auth.json"                // optional; run every scenario authenticated
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

**`defaults` is a fallback, not an override** — every key is applied as
`scenario.<key> ?? defaults.<key>`, so a value set on the scenario itself always
wins. Tags live on the **suite entry**, not inside the scenario file.

CLI flags for `webmobai-suite`:

| Flag | What it does |
|---|---|
| `--workers N` | Run up to N scenarios in parallel (default `min(4, cpus)`) |
| `--shard k/n` | Run only the kth slice of n, `k` 1-based (deterministic striping — `--shard 1/4` takes scenarios 0/4/8…). Combine with CI parallelism. |
| `--tag T` | Only run scenarios with tag T (repeatable; multiple tags OR together) |
| `--exclude-tag T` | Skip scenarios with tag T (repeatable; exclude wins over include) |
| `--allow-empty` | Treat a tag filter matching 0 scenarios as success instead of a usage error |
| `--reporter html\|junit\|both\|none` | Which report formats to write (default `both`) |
| `--out DIR` | Output directory for the aggregate reports (default: **current working directory**) |
| `--storage-state F` | Run every scenario authenticated from a saved storageState JSON |
| `-h`, `--help` | Print help and exit 0 |

Filtering happens **before** sharding, so every shard in a CI matrix must be
given identical `--tag` / `--exclude-tag` flags or the shards will disagree
about the index space.

`suite-<ts>.json` — the full raw result, including each scenario's `sessionDir`
— is written to `--out` unconditionally, even with `--reporter none`.

Exit codes:

| Code | Meaning |
|---|---|
| 0 | All scenarios passed; `--help`; or nothing to run (empty suite, an empty shard, or `--allow-empty`) |
| 1 | At least one scenario failed — **or** a fatal error: the suite file couldn't load (missing, malformed JSON, missing `name`/`scenarios`), a referenced scenario file was unreadable, or `--shard` was malformed or out of range |
| 2 | Usage error: unknown option, missing flag value, bad `--workers` or `--reporter`, a second positional, no suite path, or a tag filter that matched 0 of a non-empty suite without `--allow-empty` |

Note that a suite that fails to **load** exits 1, not 2 — loader errors throw
and surface as `Suite CLI fatal error:` on stderr. Exit 2 means the invocation
itself was wrong.

The zero-match tag guard exists so a mistyped tag fails the build instead of
producing a green run that tested nothing. It fires only when a tag flag was
supplied, the post-filter count is 0, the suite was non-empty, and
`--allow-empty` was absent.

Full CI wiring — JUnit, artifacts, worked sharding examples, pipeline YAML —
is in [`CI.md`](CI.md).

---

## Generating scenarios

Four ways to author one without writing JSON by hand:

1. **`webmobai-codegen <url>`** — opens a headed Chromium, records your
   clicks/typing/navigations, and emits a starter scenario. Passwords are
   redacted on output as the literal string `<REDACTED — password field>`, so a
   recorded login needs hand-editing before it will replay. Codegen has no
   storageState support and cannot record behind a login.
2. **MCP `webmobai_generate_scenario`** — inspects the current live page
   (forms, CTAs, nav links) and emits a starter scenario for Claude to
   refine.
3. **MCP `webmobai_generate_scenario_from_prompt`** *(Sprint 15, opt-in via
   `WEBMOBAI_ANTHROPIC_API_KEY`)* — converts a natural-language description
   plus the live page into a fully-validated scenario.
4. **Capture a session, then write the replay scenario against it** — log in
   once over MCP, call `webmobai_save_storage_state`, and give the resulting
   file to a scenario's `storageState` field. `webmobai-scenario
   <file> --save-storage-state auth.json` does the same for a non-interactive
   login. See [`AUTHENTICATION.md`](AUTHENTICATION.md).

Neither AI path can emit auth steps: the generator's step vocabulary and the
schema that validates the model's output both omit `saveStorageState`,
`pauseForManual`, and the top-level `storageState`. Add those by hand.
