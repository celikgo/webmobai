# WebMobAI User Manual

WebMobAI is an end-to-end web testing framework. This manual covers everything you need to install, run, and use the project — whether you're driving it interactively, scripting it with scenarios, or asking Claude to compose tests for you.

For an architectural map of what's shipped, see [FEATURES.md](./FEATURES.md). For contributing, see [CONTRIBUTING.md](./CONTRIBUTING.md). [docs/README.md](./docs/README.md) indexes every document in the repo; the deep dives this manual summarizes are [docs/SCENARIO_FORMAT.md](./docs/SCENARIO_FORMAT.md) (the canonical schema mirror), [docs/AUTHENTICATION.md](./docs/AUTHENTICATION.md), and [docs/CI.md](./docs/CI.md).

If you drive WebMobAI through Claude rather than the CLI, the 20 skills in [.claude/skills/](./.claude/skills/README.md) encode these workflows as prompt-triggered playbooks — see [Driving WebMobAI through Claude](#driving-webmobai-through-claude) below.

---

## Table of contents

1. [Install](#1-install)
2. [The seven binaries](#2-the-seven-binaries)
3. [Five-minute quick start](#3-five-minute-quick-start)
4. [Workflows by job](#4-workflows-by-job)
   - [Test behind a login (authenticated sessions)](#test-behind-a-login-authenticated-sessions)
   - [Driving WebMobAI through Claude](#driving-webmobai-through-claude)
5. [Scenario file format](#5-scenario-file-format)
6. [Suite file format](#6-suite-file-format)
7. [MCP tool reference](#7-mcp-tool-reference)
8. [Reports and artifacts](#8-reports-and-artifacts)
9. [Configuration reference](#9-configuration-reference)
10. [CI integration](#10-ci-integration)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Install

### Prerequisites
- **Node.js 18+** on your PATH
- **Chromium** is auto-downloaded on first run (~170MB). Firefox + WebKit only when you launch them.

### Option A — npm (recommended for CLI users)

```bash
npm install -g webmobai-mcp
```

This installs all seven binaries: `webmobai-mcp`, `webmobai-test`, `webmobai-scenario`, `webmobai-suite`, `webmobai-codegen`, `webmobai-monitor`, `webmobai-doctor`.

### Option B — Desktop app (point-and-click)

Download the latest `.dmg` from [Releases](https://github.com/celikgo/webmobai/releases). Drag to Applications. The app bundles the MCP server, so you only need Node.js installed.

> ⚠️ **First-launch Gatekeeper warning** ("WebMobAI is damaged and can't be opened"). The current releases are not yet signed or notarized, so macOS quarantines them. The app is fine — strip the quarantine flag once:
> ```bash
> xattr -cr /Applications/WebMobAI.app
> ```
> See [Troubleshooting → macOS says the app is damaged](#macos-says-the-app-is-damaged) for details.

### Option C — From source

```bash
git clone https://github.com/celikgo/webmobai.git
cd webmobai/mcp-server
npm install
npm run build
# binaries available as ./node_modules/.bin/webmobai-*
```

### Connecting Claude

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "webmobai": { "command": "npx", "args": ["-y", "webmobai-mcp"] }
  }
}
```

**Claude Code** (`.mcp.json` in your project root):
```json
{
  "mcpServers": {
    "webmobai": { "command": "npx", "args": ["-y", "webmobai-mcp"] }
  }
}
```

Restart Claude; the 51 `webmobai_*` tools will appear.

---

## 2. The seven binaries

| Binary | What it does | When to use |
|---|---|---|
| `webmobai-mcp` | stdio MCP server | Connected to Claude Desktop / Claude Code |
| `webmobai-test <url>` | One-shot full audit | "Test this site once and give me a report" |
| `webmobai-scenario <file>` | Run a single JSON scenario | Scripted E2E tests you check into the repo |
| `webmobai-suite <file>` | Run a suite (many scenarios, parallel, sharded) | CI pipelines |
| `webmobai-codegen <url>` | Interactive recording → scenario JSON | "I want to write a test by clicking around" |
| `webmobai-monitor <url>` | Scheduled/interval runs with alert webhook + regression detection | "Watch this URL and alert me when it regresses" |
| `webmobai-doctor` | Preflight check: Node, Playwright browsers, optional deps, auth file | "Is my environment set up correctly?" |

Three binaries produce reports: `webmobai-test` (HTML + PDF + JUnit + trace), `webmobai-scenario` (HTML + JUnit + trace), and `webmobai-suite` (aggregate HTML + JUnit + raw JSON, plus one trace per scenario). `webmobai-codegen` emits only scenario JSON, `webmobai-monitor` emits nothing itself (its child `webmobai-test` runs do), and `webmobai-doctor` writes nothing at all. See [§8](#8-reports-and-artifacts).

### Flag reference

Every flag below takes its value as the **next argv token** (`--tag smoke`), not `--tag=smoke` — the sole exceptions are `webmobai-monitor`'s `--interval=`, `--alert-webhook=`, and `--config=`.

| Binary | Positionals | Flags |
|---|---|---|
| `webmobai-mcp` | none | none — it parses no arguments at all |
| `webmobai-test` | `<url>` then an optional `[config-json]` string | none |
| `webmobai-scenario` | `<scenario.json>` | `--storage-state <file>`, `--save-storage-state <file>` |
| `webmobai-suite` | `<suite.json>` | `--workers N`, `--shard k/n`, `--tag T` (repeatable), `--exclude-tag T` (repeatable), `--reporter html\|junit\|both\|none`, `--out DIR`, `--allow-empty`, `--storage-state F`, `-h`/`--help` |
| `webmobai-codegen` | `<url>` | `-o`/`--out <file>`, `-h`/`--help` |
| `webmobai-monitor` | `<url>` then an optional `[config-json]` string | `--once`, `--interval <dur>` / `--interval=<dur>`, `--every <dur>`, `--alert-webhook <url>` / `--alert-webhook=<url>`, `--config <json>` / `--config=<json>` |
| `webmobai-doctor` | none | `--storage-state <file>`, `-h`/`--help` |

Notes on the sharp edges:

- **`webmobai-test` and `webmobai-scenario` have no `--help`.** `webmobai-scenario` also silently ignores any unrecognized `-`-prefixed token; `webmobai-suite` treats one as a usage error (exit 2).
- **There is no `--headed` flag anywhere.** `webmobai-scenario` and `webmobai-suite` are hardcoded headless; `webmobai-test` and `webmobai-codegen` are hardcoded headed. Headed automation is otherwise reachable only over MCP, where `webmobai_launch_browser` defaults to `headless: false`.
- **`webmobai-monitor` accepts `--every 5m` but rejects `--every=5m`** — only `--interval` has an `=`-form. Duration grammar is a number plus `ms`, `s`, `m`, or `h`; the default interval is 5m.
- **`webmobai-test` prints its usage line as `auto-test <url> [config-json]`** (the internal module name), and **exits 0 even when checks fail** — never gate CI on it. See [§10](#10-ci-integration).
- **`webmobai-codegen` writes its scenario JSON to stdout** unless `-o` is given; all status output goes to stderr, so `webmobai-codegen <url> > out.json` is safe.

Exit codes: `0` success, `1` a real failure (failed step/scenario, or a thrown error), `2` a usage error. `webmobai-doctor` never exits 2, and `webmobai-test` never exits non-zero for a failing check.

---

## 3. Five-minute quick start

### Audit a website
```bash
webmobai-test https://example.com
```
Opens a Chromium window, navigates, runs error / a11y / perf / responsive audits, crawls a few internal links, writes an HTML report. The path is printed at the end.

### Record a flow → scenario
```bash
webmobai-codegen https://example.com -o my-scenario.json
```
A browser opens. Click around. Close the window. `my-scenario.json` now contains the recorded steps.

### Replay the scenario
```bash
webmobai-scenario my-scenario.json
```

### Group scenarios into a suite, run in parallel
Create `pre-deploy.json`:
```json
{
  "name": "Pre-deploy suite",
  "scenarios": [
    { "path": "./my-scenario.json", "tags": ["smoke"] }
  ]
}
```

```bash
webmobai-suite pre-deploy.json --workers 4 --tag smoke
```

### Ask Claude to compose a test
With the MCP server connected:
> "Open https://example.com/signup, fill the form with test@example.com and Password123!, submit, and verify the welcome page loads."

Claude calls the appropriate `webmobai_*` tools in sequence.

---

## 4. Workflows by job

### Smoke test (60-second pass/fail)
```bash
webmobai-scenario smoke.json
```
With a minimal scenario:
```json
{
  "name": "Site is alive",
  "url": "https://example.com",
  "steps": [
    { "type": "assertVisible", "selector": "h1" },
    { "type": "assertText", "selector": "h1", "expected": "Welcome", "exact": false }
  ]
}
```

### Full audit with report
```bash
webmobai-test https://example.com '{"maxPages":10,"enableA11y":true,"enablePerformance":true}'
```
The second arg is a JSON SessionConfig override. See [§9](#9-configuration-reference) for fields.

### Scripted E2E with assertions
Write a scenario JSON; run with `webmobai-scenario`. The scenario format ([§5](#5-scenario-file-format)) supports clicks, typing, navigation, network mocking, visual snapshots, and five assertion types.

### Parallel CI suite with sharding
On each CI machine:
```bash
# Machine 1
webmobai-suite suite.json --shard 1/4 --workers 4
# Machine 2
webmobai-suite suite.json --shard 2/4 --workers 4
# Machine 3
webmobai-suite suite.json --shard 3/4 --workers 4
# Machine 4
webmobai-suite suite.json --shard 4/4 --workers 4
```
Each machine runs 1/4 of the suite. Use `--reporter junit` to produce JUnit XML for CI test reporting.

### Visual regression with baselines
First run captures baselines:
```bash
webmobai-scenario visual-suite.json
```
With:
```json
{
  "name": "Visual checks",
  "url": "https://example.com",
  "steps": [
    {
      "type": "visualSnapshot",
      "name": "homepage-hero",
      "baselineDir": "./visual-baselines",
      "selector": ".hero"
    }
  ]
}
```

Subsequent runs compare. On mismatch, `.actual.png` and `.diff.png` are written next to the baseline. If the change was intentional:
```json
{ "type": "visualSnapshot", "name": "homepage-hero", "updateBaseline": true }
```

Check the `visual-baselines/` directory into git so baselines version with your code.

### Track regressions across runs
History is automatically appended after each `webmobai-test` run. To check via Claude:
> "Has LCP regressed on https://example.com in the last 5 runs?"

Claude calls `webmobai_check_regressions` with the URL and reports the deltas.

### Realistic mobile performance measurement
Via Claude:
> "Measure performance on https://example.com with a mid-tier Android profile."

Claude composes:
1. `webmobai_launch_browser({ device: "Pixel 5" })`
2. `webmobai_set_network_throttle({ preset: "slow-4g" })`
3. `webmobai_set_cpu_throttle({ slowdown: 4 })`
4. `webmobai_run_perf_multi({ url, runs: 3 })`

Returns a median + p95 table for LCP/FCP/CLS/TTI/INP/TTFB.

### Compose a NL test into a scenario
Via Claude:
> "Generate a starter scenario for https://example.com/signup."

Claude calls `webmobai_generate_scenario`, which inspects the page (H1, forms with sample-value typing, nav links, CTAs) and emits a Scenario JSON. Refine and save.

### Test behind a login (authenticated sessions)

By default every session starts with a clean, cookie-less profile, so tools can only reach public pages. To test anything behind a login, capture the logged-in session **once** into a Playwright `storageState` JSON, then replay that file on every later run. This is the deep version's summary — see [docs/AUTHENTICATION.md](./docs/AUTHENTICATION.md) for the full treatment, and the [testing-web-authenticated-sessions](./.claude/skills/testing-web-authenticated-sessions/SKILL.md) skill for the Claude-driven path.

#### Step 1 — capture the session

**The reliable path is over MCP, headed, with Claude driving.** This is the only surface where a human can complete an MFA code, CAPTCHA, or SSO consent mid-flow, because the browser simply sits there between tool calls:

> "Launch a headed browser, go to https://app.example.com/login, type my email and password, submit, and then stop so I can enter the MFA code."

…complete the manual step in the visible window, then:

> "Now save the session to auth.json and close the browser."

The tool sequence Claude runs is:

1. `webmobai_launch_browser` with `{ "headless": false }` — the MCP default is already headed. Do **not** pass `storage_state_path` when capturing.
2. `webmobai_navigate` to the login URL.
3. `webmobai_type` / `webmobai_click` to drive the credential form.
4. *(you complete MFA/CAPTCHA/SSO in the window — no tool call needed)*
5. `webmobai_save_storage_state` with `{ "path": "auth.json" }`.
6. `webmobai_close_browser`.

**For a fully scriptable login with no human step**, capture from the CLI instead:

```bash
webmobai-scenario capture-auth.json --save-storage-state auth.json
```

```json
{
  "name": "Capture authenticated session",
  "url": "https://app.example.com/login",
  "steps": [
    { "type": "type", "selector": "#email", "text": "qa@example.com" },
    { "type": "type", "selector": "#password", "text": "REPLACE_ME" },
    { "type": "click", "selector": "[data-testid=submit]" },
    { "type": "wait", "urlContains": "/dashboard", "timeoutMs": 30000 },
    { "type": "assertVisible", "selector": "[data-testid=user-menu]", "description": "Confirm we are logged in" },
    { "type": "saveStorageState", "path": "auth.json" }
  ]
}
```

The `assertVisible` step is load-bearing: without it, a login that silently failed still reaches `saveStorageState` and writes an unauthenticated `auth.json`. `--save-storage-state` runs after `runScenario` returns and before the browser closes, so it fires even when earlier steps failed.

> ⚠️ **`pauseForManual` does not work through either CLI.** `webmobai-scenario` and `webmobai-suite` both launch hardcoded headless, and in headless mode `pauseForManual` logs a warning to stderr, records the step as **pass**, and continues immediately. A CLI capture scenario containing `pauseForManual` followed by `saveStorageState` will therefore write a pre-MFA, unauthenticated file **and report all green**. For any interactive login, use the MCP flow above.

#### Step 2 — replay authenticated

| Surface | How |
|---|---|
| MCP | `webmobai_launch_browser` with `{ "storage_state_path": "auth.json" }`. Close any running browser first — the tool refuses to relaunch over a live one. |
| One scenario | `webmobai-scenario checkout.json --storage-state auth.json`, or set `"storageState": "auth.json"` in the scenario file. |
| Whole suite | `webmobai-suite pre-deploy.json --storage-state auth.json`, or set it once under the suite's `defaults`. |

**Precedence differs between the two CLIs — this is a real inconsistency, not a typo:**

- `webmobai-scenario`: **the `--storage-state` flag wins** over the scenario file's `storageState` field.
- `webmobai-suite`: **the flag loses.** Precedence is scenario's own `storageState` > `suite.defaults.storageState` > `--storage-state`. The flag only fills in scenarios that specify nothing, so a scenario hardcoding `"storageState": "dev-auth.json"` will silently ignore `--storage-state ci-auth.json`.

Relative paths are resolved against the **invoking cwd**, not the scenario or suite file's directory — including a `"./auth.json"` written inside a suite's `defaults`. `webmobai-doctor` is the one place that resolves to an absolute path, so it can report on a different file than the run will use. Prefer absolute paths in CI.

#### Step 3 — check the session before you rely on it

```bash
webmobai-doctor --storage-state auth.json
```

Adds one check to the standard preflight:

- file missing → `✗ error`, exit 1
- not valid JSON → `✗ error`, exit 1
- there is at least one cookie with a numeric `expires` and **every** such cookie is in the past → `! warn`, exit 0 — "the session is likely stale; re-save it"
- otherwise → `✓ ok`, `<n> cookie(s) loaded from auth.json`

The heuristic is deliberately weak and you should know its blind spots: a single unexpired dated cookie makes the whole check `ok`, session cookies (no `expires`, or `-1`) are excluded from the expiry evaluation entirely, and `origins[]`/localStorage — where a JWT usually lives — is never inspected. Treat `ok` as "the file is well-formed", not "you are still logged in".

#### Step 4 — re-capture when it goes stale

**Nothing checks expiry at run time.** `launch()` only verifies the file exists. An expired session produces ordinary step failures — a redirect to `/login`, an `assertVisible` timeout on a logged-in-only element — with no distinct diagnostic, and there is no refresh loop or retry-on-401 anywhere in the codebase. When runs start failing that way, re-run Step 1. Put the `assertVisible` on a logged-in-only element as the *first* step of every authenticated scenario so a stale session fails loudly and early.

#### In CI

There is **no environment variable** for the session — no `WEBMOBAI_STORAGE_STATE` or equivalent exists. CI must materialize the JSON to a file on disk before invoking the CLI:

```yaml
- name: Materialize the session
  run: printf '%s' "$WEBMOBAI_AUTH_JSON" > "$RUNNER_TEMP/auth.json"
  env:
    WEBMOBAI_AUTH_JSON: ${{ secrets.WEBMOBAI_AUTH_JSON }}

- run: webmobai-doctor --storage-state "$RUNNER_TEMP/auth.json"

- run: webmobai-suite ./e2e/suite.json --storage-state "$RUNNER_TEMP/auth.json" --out ./reports
```

Regenerate the secret from a fresh capture on whatever cadence your IdP's session lifetime demands; there is no automation for that.

#### What is and is not captured

`storageState` is Playwright's standard shape, `{ cookies: [...], origins: [{ origin, localStorage: [...] }] }`:

- **Cookies — yes**, context-wide, including a separate SSO/IdP domain.
- **localStorage — yes**, verified to round-trip. A JWT/bearer token in localStorage is written to the file in plaintext.
- **`origins[]` only covers origins the context actually visited during capture.** An app that reads its token from an origin never loaded won't be authenticated on replay.
- **sessionStorage and IndexedDB — no.** This is Playwright's documented limitation and WebMobAI adds nothing on top. An app that keeps its token in either **cannot** be replayed with this feature at all.
- Nothing captures HTTP-only request headers, an `Authorization` header set by JS, or service-worker state.

Sites that fingerprint headless browsers may authenticate during the headed capture and then reject the headless replay. WebMobAI mitigates only partially — a spoofed desktop Chrome UA for chromium-without-device, and `--disable-blink-features=AutomationControlled`. Not a guarantee.

#### Secret hygiene

> ⚠️ **`auth.json` contains live session tokens. Treat it exactly as you would a password.**

Enforced in code:

- The launch response never echoes the storageState path — it prints a fixed sentence instead.
- Session **contents** never appear in any tool response, log line, or report; there is a test asserting the secret value cannot leak into the tool output.
- The missing-file error message deliberately omits the path.
- All logger output goes to stderr, never stdout and never to a file.
- `webmobai-codegen` redacts `input[type="password"]`, emitting the literal `<REDACTED — password field>` as the step's text.
- `.gitignore` covers `auth.json`, `*.auth.json`, and `*storage-state*.json`.

Convention only — **not** enforced, so these are on you:

- **The save path *is* printed.** `webmobai_save_storage_state` returns `Saved the current session to <path>`, and `webmobai-scenario` prints the path to stdout. Only contents are protected, not the filename.
- **No permission hardening.** Nothing chmods to `0600`, encrypts, sets an expiry, or creates missing parent directories.
- **The `.gitignore` coverage is name-based.** `session.json`, `state.json`, `.auth/creds.json`, and `ci-auth-prod.json` match none of the three patterns.
- **The Playwright trace and video capture the authenticated session and are not redacted.** Tracing records screenshots, DOM snapshots, and sources; `trace.zip`'s path *is* printed by `webmobai_close_browser` and `webmobai-scenario`. MCP launch defaults `record_video: true`, so a headed login is filmed by default. CI jobs that archive a session directory will publish credential-equivalent material.
- **`webmobai-codegen` redacts only password inputs.** An email, a TOTP code typed into a text input, an API key, or a card number is written verbatim into the emitted scenario.

#### Surfaces with no auth support (verified, not assumed)

- **`webmobai-codegen`** cannot record behind a login and cannot save a session — it launches a bare context with no options.
- **`webmobai-test`** and **`webmobai-monitor`** do not support `storageState`. They have a separate, older mechanism: a `credentials: {username, password}` field in the run config drives a best-effort landing-page auto-login heuristic.
- **The AI scenario generators cannot emit auth steps.** Both `webmobai_generate_scenario` and `webmobai_generate_scenario_from_prompt` omit `storageState`, `saveStorageState`, and `pauseForManual` from their vocabularies, and the latter's validator would reject them. Hand-write auth scenarios.
- **There is no MCP tool that runs a scenario file**, so `pauseForManual` has no headed entry point outside a programmatic `BrowserManager` + `runScenario` caller.

### Driving WebMobAI through Claude

Everything above is also reachable by asking Claude in natural language. The repo ships **20 skills** under [`.claude/skills/`](./.claude/skills/README.md) that encode these workflows as prompt-triggered playbooks, so you get a consistent tool sequence and report instead of ad-hoc calls. The ones that map onto this section:

| Skill | Use it for |
|---|---|
| [testing-web-authenticated-sessions](./.claude/skills/testing-web-authenticated-sessions/SKILL.md) | Capture and replay a logged-in session |
| [running-web-ci-suites](./.claude/skills/running-web-ci-suites/SKILL.md) | Build a suite file, shard it, wire JUnit into CI |
| [troubleshooting-webmobai-setup](./.claude/skills/troubleshooting-webmobai-setup/SKILL.md) | WebMobAI itself is broken — driven by `webmobai-doctor` |
| [testing-web-app](./.claude/skills/testing-web-app/SKILL.md) | The full end-to-end QA pass |
| [authoring-web-scenarios](./.claude/skills/authoring-web-scenarios/SKILL.md) | Turn an exploration into a replayable scenario JSON |

See [.claude/skills/README.md](./.claude/skills/README.md) for the full list of 20 and the conventions they share.

---

## 5. Scenario file format

A scenario is a JSON file with `{name, url, steps[]}`. Run with `webmobai-scenario <file>`. It has exactly two flags:

| Flag | Notes |
|---|---|
| `--storage-state <file>` | Run authenticated from a saved storageState JSON. Overrides the scenario's own `storageState` field |
| `--save-storage-state <file>` | After the run, persist the resulting session to this path. Fires even when steps failed, since it runs before the browser closes |

Both are legal together: `webmobai-scenario flow.json --storage-state old.json --save-storage-state refreshed.json`. Values are space-separated; there is no `=`-form and no `--help`.

### Top-level fields

| Field | Type | Notes |
|---|---|---|
| `name` | string | Human-readable name; appears in reports |
| `description` | string | Optional |
| `url` | string | Starting URL; runner navigates here before step 1 |
| `viewport` | `{width, height}` | Optional; passed to launch |
| `browser` | `"chromium" \| "firefox" \| "webkit"` | Optional, default chromium |
| `device` | string | Optional Playwright device preset (e.g., `"iPhone 13"`); overrides viewport |
| `continueOnFailure` | boolean | Default false: halt on first failed step, marking the rest `skipped` |
| `storageState` | string | Optional path to a Playwright storageState JSON; the scenario runs already authenticated. `webmobai-scenario --storage-state` **overrides** this field — but inside a suite this field **beats** the flag. See [§4](#test-behind-a-login-authenticated-sessions) |
| `steps` | array | See verbs below |

The runner always navigates to `url` before step 1, so an authenticated replay lands on the target page already logged in.

### Step verbs

#### Navigation & interaction
```json
{ "type": "navigate", "url": "https://example.com/pricing" }
{ "type": "click", "selector": "[data-testid=submit]" }
{ "type": "type", "selector": "#email", "text": "test@example.com" }
{ "type": "select", "selector": "#country", "value": "US" }
{ "type": "press", "key": "Enter" }
{ "type": "scroll", "direction": "down", "amount": 500 }
{ "type": "wait", "selector": ".loaded", "timeoutMs": 5000 }
{ "type": "wait", "urlContains": "/welcome", "timeoutMs": 10000 }
{ "type": "screenshot", "description": "post-submit state" }
```

#### Assertions
```json
{ "type": "assertVisible", "selector": "h1", "timeoutMs": 5000 }
{ "type": "assertHidden", "selector": ".loading-spinner" }
{ "type": "assertText", "selector": "h1", "expected": "Welcome", "exact": false }
{ "type": "assertUrl", "contains": "/dashboard" }
{ "type": "assertUrl", "pattern": "^https://app\\.example\\.com/users/\\d+" }
{ "type": "assertCount", "selector": ".product-card", "expected": 12 }
```

#### Network mocking
```json
{
  "type": "route",
  "pattern": "**/api/users/*",
  "action": "fulfill",
  "status": 200,
  "body": "{\"id\":42,\"name\":\"Mocked\"}",
  "contentType": "application/json"
}
{ "type": "route", "pattern": "**/analytics/**", "action": "abort" }
```

#### Visual regression
```json
{
  "type": "visualSnapshot",
  "name": "checkout/cart-empty",
  "baselineDir": "./visual-baselines",
  "selector": ".cart",
  "maxDiffPixelRatio": 0.005
}
```

#### Authenticated sessions

```json
{ "type": "saveStorageState", "path": "auth.json" }
{ "type": "pauseForManual", "prompt": "Enter the MFA code in the browser", "timeoutMs": 120000 }
```

- **`saveStorageState`** — `path` is required. Writes the current session's cookies + localStorage to a storageState JSON. Report label: "Save authenticated session (storageState)".
- **`pauseForManual`** — both fields optional. `prompt` defaults to "Complete the manual step (MFA / CAPTCHA / SSO), then wait."; `timeoutMs` defaults to **30000** and is clamped to a hard ceiling of **300000** (5 minutes), so an SSO consent flow longer than that cannot be waited out in one step.

  Two things to understand before using it. First, **in headless mode it is a no-op**: it logs a warning to stderr, records the step as **pass**, and returns immediately — and both `webmobai-scenario` and `webmobai-suite` launch hardcoded headless, so it never actually pauses through either CLI. Second, even headed it is a blind `waitForTimeout`, not a stdin prompt or a completion detector: it always burns the full window and cannot be shortened by finishing early. For interactive logins use the MCP capture flow in [§4](#test-behind-a-login-authenticated-sessions).

### Step failure semantics

The runner executes steps in order, stops at the first failed step, and marks the remainder `skipped` — unless `continueOnFailure: true`. `webmobai-scenario` exits 1 if and only if `failed > 0`; skipped steps alone can never cause a non-zero exit, since they only appear after a failure.

> **Changed in v1.4.0.** For the steps that delegate to a tool handler — `route`, `visualSnapshot`, and the five assertions — **anything that is not an explicit success string is now a step failure.** Previously a capture error, a missing baseline, a bad selector, or a failed route install could return a non-`FAIL` error string and slip through as PASS, leaving the mock uninstalled or the diff unmeasured while the report went green. If a scenario that used to pass now fails on one of these steps, read the step's message: it is the tool's own error text, and it was always there.
>
> Also in v1.4.0: **`assertUrl` no longer passes vacuously.** A step with neither `contains` nor `pattern` used to evaluate to PASS; it now fails with "assert_url requires 'contains' or 'pattern'". This is the one change in the release that can flip an existing green test red.

### Selector tips

- **Stable** (preferred): `[data-testid=…]`, `#id`, `[aria-label=…]`
- **Semantic**: `role=button[name="Sign Up"]`, `text=Sign Up`
- **Last resort**: CSS class selectors, `:nth-of-type`

If a selector fails, the response includes a self-healing diagnostic with ranked alternatives. Use those for retries.

### Example: signup happy path

```json
{
  "name": "Signup happy path",
  "url": "https://example.com/signup",
  "steps": [
    { "type": "assertVisible", "selector": "h1" },
    { "type": "assertText", "selector": "h1", "expected": "Create an account" },
    { "type": "type", "selector": "#email", "text": "test+e2e@example.com" },
    { "type": "type", "selector": "#password", "text": "TestPassword123!" },
    { "type": "click", "selector": "[data-testid=submit]" },
    { "type": "wait", "urlContains": "/welcome", "timeoutMs": 10000 },
    { "type": "assertText", "selector": "h1", "expected": "Welcome" },
    { "type": "visualSnapshot", "name": "welcome-page", "baselineDir": "./visual-baselines" }
  ]
}
```

---

## 6. Suite file format

A suite is a JSON file referencing one or more scenarios. Run with `webmobai-suite <file>`.

### Top-level fields

| Field | Type | Notes |
|---|---|---|
| `name` | string | Suite name; appears in aggregate report |
| `description` | string | Optional |
| `defaults` | object | Fallbacks applied to every scenario that doesn't set its own: `viewport`, `browser`, `device`, `continueOnFailure`, `storageState` |
| `scenarios` | array | Entries — see below |

`defaults` are a fallback, never an override: an explicit value on a scenario always wins. A suite takes a **file path**, never a directory — `webmobai-suite ./scenarios/` fails.

### Entry shapes

**Path-based** (most common — load from a separate file):
```json
{ "path": "./scenarios/login.json", "tags": ["smoke", "auth"] }
```
Paths are resolved relative to the suite file's directory.

**Inline**:
```jsonc
{
  "scenario": { "name": "smoke", "url": "https://example.com", "steps": [ /* … */ ] },
  "tags": ["smoke"]
}
```

### CLI flags

| Flag | Default | Notes |
|---|---|---|
| `--workers N` | `min(4, cpus)` | Concurrent scenario count |
| `--shard k/n` | none | 1-based; e.g., `--shard 1/4` |
| `--tag T` | none (repeatable) | Include only scenarios with this tag (OR) |
| `--exclude-tag T` | none (repeatable) | Drop scenarios with this tag; wins over include |
| `--reporter R` | `both` | `html` \| `junit` \| `both` \| `none`. Anything else is a usage error |
| `--out DIR` | `cwd` | Where aggregate reports land; created with `mkdir -p` |
| `--allow-empty` | off | Treat a tag filter that matched zero scenarios as success instead of exit 2 |
| `--storage-state F` | none | Run every scenario authenticated from a saved storageState JSON — but only those that don't already specify one |
| `-h`, `--help` | — | Print the help text and exit 0 |

There is no `--save-storage-state` on `webmobai-suite`; capture is a `webmobai-scenario` (or MCP) job. See [§4](#test-behind-a-login-authenticated-sessions).

### Tag filtering, sharding, and exit codes

- **Tags come from the suite entry**, not the scenario file. Matching is exact string equality — no globbing, no negation, no case-insensitivity.
- Repeated `--tag` is **OR**; repeated `--exclude-tag` is **OR**; **exclude wins over include**, so `tags: ["smoke","slow"]` with `--tag smoke --exclude-tag slow` is dropped.
- `--shard k/n` is **1-based modular striping, not contiguous chunking**: `--shard 1/3` takes scenario indices 0, 3, 6… Filtering runs *before* sharding, so **every shard must be given identical `--tag` / `--exclude-tag` flags** or the shards disagree about the index space and will silently overlap or skip.
- `--workers` is a promise pool, not worker threads. Each scenario gets its own session directory and its own browser, always headless with video off, so artifacts never collide — but results are collected in **completion order**, so the aggregate report's ordering is nondeterministic above one worker.

> **Changed in v1.4.0.** A tag filter that matches **zero** scenarios is now a hard **exit 2** with `Tag filter matched 0 of N scenarios`, instead of a green no-op. It fires only when all four hold: a `--tag`/`--exclude-tag` was supplied, the post-filter count is 0, the suite itself was non-empty, and `--allow-empty` was not passed. The point is to catch a mistyped tag that would otherwise report a passing build having run nothing. Pass `--allow-empty` when an empty selection is genuinely expected — the run then falls through to "No scenarios to run." and exits 0. An empty suite file and a shard that receives zero scenarios both exit 0 without the guard.

Exit codes: `0` all scenarios passed (or `--help`, or nothing to run); `1` at least one scenario had a failed step, or a thrown error — including a loader error or a malformed `--shard`, which throw rather than dying with a usage code; `2` a usage error, per the list above. A scenario that fails to launch is not fatal to the run: it is recorded as one failed `navigate` step and the suite continues, then exits 1.

### Example suite

```json
{
  "name": "Pre-deploy E2E",
  "description": "Smoke + regression suite run on every PR",
  "defaults": {
    "browser": "chromium",
    "viewport": { "width": 1280, "height": 720 },
    "continueOnFailure": false,
    "storageState": "/abs/path/to/auth.json"
  },
  "scenarios": [
    { "path": "./scenarios/login.json", "tags": ["smoke", "auth"] },
    { "path": "./scenarios/checkout.json", "tags": ["e2e"] },
    { "path": "./scenarios/profile-edit.json", "tags": ["e2e", "slow"] },
    {
      "scenario": {
        "name": "homepage is alive",
        "url": "https://example.com",
        "steps": [
          { "type": "assertVisible", "selector": "h1" }
        ]
      },
      "tags": ["smoke"]
    }
  ]
}
```

Run smoke only on PRs:
```bash
webmobai-suite pre-deploy.json --tag smoke
```

Run full suite nightly across 4 machines:
```bash
# Each machine
webmobai-suite pre-deploy.json --shard ${SHARD}/4 --workers 2 --exclude-tag slow
```

---

## 7. MCP tool reference

**51 tools in 16 groups** (7+1+5+2+5+5+2+2+4+5+3+3+2+2+2+1 = 51). Each is callable from Claude or any MCP-compatible client; the full JSON schemas are exposed via `tools/list` on the MCP server.

**Reading the "Browser" column.** Most tools need a live page, and the dispatcher pre-checks for one, returning `Browser is not launched. Call webmobai_launch_browser first.` without ever entering the handler.

| Value | Meaning |
|---|---|
| **yes** | Needs a launched browser. The dispatcher blocks the call with the standard message |
| **yes\*** | Needs a launched browser, but the handler guards itself and returns its own wording |
| **no** | Works with no browser at all |

Six browser-control tools — `webmobai_navigate`, `webmobai_click`, `webmobai_type`, `webmobai_scroll`, `webmobai_screenshot`, `webmobai_set_viewport` — sit in an unguarded group and surface the raw `Error executing <name>: Browser not launched. Call launch() first.` instead of the friendly message. Cosmetic difference, same outcome.

**Gates.** Four tools are conditionally unavailable, and all four degrade to an ordinary text response rather than an MCP error:

- `WEBMOBAI_ANTHROPIC_API_KEY` gates exactly three: `webmobai_summarize_audit`, `webmobai_explain_visual_diff`, `webmobai_generate_scenario_from_prompt`. Unset (or whitespace-only) returns `AI features are disabled. Set WEBMOBAI_ANTHROPIC_API_KEY (and optionally WEBMOBAI_AI_MODEL) to enable.` The check happens before the browser check, so an AI tool reports the disabled message even with no browser running.
- The `lighthouse` + `chrome-launcher` **optional** dependencies gate exactly one: `webmobai_lighthouse_audit`. Missing, it returns install instructions.

`webmobai_accessibility_audit` is not gated but does depend on `@axe-core/playwright` at run time; if axe fails to inject (strict CSP, for instance) it silently degrades to the supplementary heuristic ruleset rather than erroring, so results can be lower-fidelity than they look.

### Browser control (7)

| Tool | Browser | What it does |
|---|---|---|
| `webmobai_launch_browser` | no | Launches chromium/firefox/webkit (default chromium, `headless: false`, 1280x720, `record_video: true`). Optional Playwright `device` preset, `idle_timeout_ms`, and `storage_state_path`. Refuses if a browser is already running. Downloads the engine on first use |
| `webmobai_navigate` | yes | `goto` with `domcontentloaded`, 30s timeout, then a best-effort `networkidle`; returns title + final URL |
| `webmobai_go_back` | yes | History back, returns the new URL + title |
| `webmobai_scroll` | yes | Scrolls up/down (default down 500px) plus a fixed 500ms settle for lazy content |
| `webmobai_screenshot` | yes | Viewport PNG, or full-page with `full_page: true`; writes to the session's `screenshots/` and returns the path |
| `webmobai_set_viewport` | yes | Resizes the viewport |
| `webmobai_close_browser` | no | Stops tracing, closes context + browser, resets routes; returns the video and `trace.zip` paths. Safe to call with nothing running |

### Session / auth (1)

| Tool | Browser | What it does |
|---|---|---|
| `webmobai_save_storage_state` | yes\* | Writes the current session's cookies + localStorage to a Playwright storageState JSON at the required `path`. Never logs the contents. Replay it via `storage_state_path` on launch. See [§4](#test-behind-a-login-authenticated-sessions) |

### Interaction (5)

| Tool | Browser | What it does |
|---|---|---|
| `webmobai_click` | yes | Clicks with a 10s timeout; snapshots the element fingerprint for self-healing, then waits for `domcontentloaded` |
| `webmobai_type` | yes | `fill` — clears the field first; also records a self-healing snapshot |
| `webmobai_hover` | yes | Hovers with a 10s timeout |
| `webmobai_press_key` | yes | Sends a keyboard key |
| `webmobai_select_option` | yes | Selects an `<option>` by value |

### Waiting and scripting (2)

| Tool | Browser | What it does |
|---|---|---|
| `webmobai_wait_for` | yes | Priority order: `selector` (wait for visible) → `url_contains` → a plain timeout. Default 10000ms |
| `webmobai_evaluate` | yes | Runs a script in the page and returns the JSON-stringified result |

### Page analysis (5)

| Tool | Browser | What it does |
|---|---|---|
| `webmobai_get_page_state` | yes | URL, title, and a DOM summary; appends the accessibility tree only with `include_accessibility_tree: true` |
| `webmobai_get_interactive_elements` | yes | Links, buttons, inputs, selects with selectors, text, and position |
| `webmobai_get_links` | yes | All `<a href>`, split internal vs external by the current page's origin, with counts |
| `webmobai_check_errors` | yes | Three sections: broken images, console entries filtered to `type === "error"`, and captured network failures |
| `webmobai_get_console_errors` | yes | Every buffered console error **and warning** since launch, timestamped. Broader than `webmobai_check_errors`, which filters to errors only |

### Assertions (5)

All five auto-wait, polling every 100ms up to `timeout_ms` (default **5000**).

| Tool | Browser | What it does |
|---|---|---|
| `webmobai_assert_visible` | yes | Element exists and is visible |
| `webmobai_assert_hidden` | yes | Element is absent or not visible |
| `webmobai_assert_text` | yes | Trimmed `innerText`; substring by default, exact with `exact: true`. Failure echoes the last-seen text (120 chars) |
| `webmobai_assert_url` | yes | Matches `contains` and/or regex `pattern` — both must hold if both are given. **Rejects a call with neither** (v1.4.0) |
| `webmobai_assert_count` | yes | Locator count equals `expected` |

On failure the four selector-based assertions append a self-healing diagnostic (the prior element fingerprint, similar elements, candidate selectors) plus failure triage (URL, console and network errors, a screenshot). `webmobai_assert_url` gets the triage only, having no selector.

### Request mocking (2)

| Tool | Browser | What it does |
|---|---|---|
| `webmobai_route` | yes | Intercepts a URL pattern with `fulfill` (default status 200, `application/json`, empty body), `abort` (default reason `failed`), or `continue` |
| `webmobai_unroute` | yes | Removes one route by exact pattern match, or all routes when `pattern` is omitted. Routes are also cleared on browser close and server shutdown |

### Accessibility (2)

| Tool | Browser | What it does |
|---|---|---|
| `webmobai_accessibility_audit` | yes | axe-core is the primary engine; supplementary in-page heuristics are merged in and deduped by rule id. Output is grouped critical/serious/moderate/minor, max 5 nodes per issue. If axe throws it falls back to the supplementary rules alone |
| `webmobai_get_accessibility_tree` | yes | The real CDP full AX tree, not a DOM walk. **Chromium only** — returns "Accessibility tree not available (CDP not supported on this browser)" on Firefox and WebKit |

### Performance (4)

| Tool | Browser | What it does |
|---|---|---|
| `webmobai_get_performance_metrics` | yes | A rated table of LCP, FCP, CLS (running and at-load), TTI, INP, TTFB, DCL, load. `strict_tti: true` adds a `ttiStrict` row using a 5s long-task quiet window |
| `webmobai_run_perf_multi` | yes | Navigates **the caller's browser** to `url` N times (`runs` clamped 1-10, default 3) and reports median / p95 (nearest-rank) / min / max / n per metric |
| `webmobai_set_network_throttle` | yes | `offline` works on every engine; the `slow-3g` / `fast-3g` / `slow-4g` bandwidth presets use CDP and are **Chromium only, silently ignored elsewhere**. `null` clears both |
| `webmobai_set_cpu_throttle` | yes | CDP CPU throttling rate. **Chromium only.** `null` or `1` clears it |

### Audits (5)

| Tool | Browser | What it does |
|---|---|---|
| `webmobai_lighthouse_audit` | no | Spawns **its own** headless Chrome and runs upstream Lighthouse; returns the four official category scores x100 with Good / Needs Improvement / Poor plus the 8 lowest-scoring audits, worst first. Uses an explicit `url`, else the current page's URL if a browser happens to be running. **Requires the optional `lighthouse` + `chrome-launcher` packages** |
| `webmobai_security_audit` | yes | CSP from a `<meta http-equiv>` or a header re-fetch (header wins); flags missing CSP, a CSP with **neither** `default-src` nor `script-src`, `unsafe-inline`/`unsafe-eval`, plain HTTP, and cookie flags (Secure/HttpOnly/SameSite), escalating cookies named "session"/"auth" to high. Mixed content is derived only from the captured network-error log, so it is incomplete by construction. Not a penetration test |
| `webmobai_seo_audit` | yes | Title 30-60 chars, meta description 70-160, canonical, og:title/og:image, twitter:card, exactly one `h1`, viewport meta, JSON-LD parse plus `@type`. `check_robots_and_sitemap` (default **true**) fetches `/robots.txt` and `/sitemap.xml` |
| `webmobai_check_broken_links` | yes | Deduped same-origin http(s) `a[href]` only, `max_links` clamped 1-100 (default 50), HEAD with a 5s timeout; reports >=400 and thrown errors as status 0. Skips entirely on non-http(s) pages |
| `webmobai_pwa_audit` | yes | Manifest link, manifest fetched **through the page's own `fetch`** so `webmobai_route` mocks apply, required manifest fields, display enum, a >=192px icon, service-worker registrations, and HTTPS-or-localhost. `test_offline: true` (default false) flips the context offline, reloads, and restores online |

### Visual regression (3)

| Tool | Browser | What it does |
|---|---|---|
| `webmobai_visual_snapshot` | yes\* | Captures a viewport, element, or full-page PNG. The first call (or `update_baseline: true`) writes the baseline and archives the previous one as `<name>.v<unix-ms>.png`; otherwise it pixelmatch-compares against `max_diff_pixels` and/or `max_diff_pixel_ratio` and on failure writes `.actual.png` + `.diff.png`. `baseline_dir` defaults to the session's `visual-baselines/` |
| `webmobai_visual_baseline_list_versions` | no | Lists the archived versions of one baseline with ISO dates and paths. **`baseline_dir` is required here**, unlike on `webmobai_visual_snapshot` |
| `webmobai_visual_baseline_restore_version` | no | Archives the current baseline, then promotes the chosen version. Requires `name`, `baseline_dir`, and the numeric `timestamp`. This is the "we updated the baseline by mistake" undo |

### Reporting (3)

| Tool | Browser | What it does |
|---|---|---|
| `webmobai_test_responsive` | yes | Loops breakpoints (default Mobile 375x812, Tablet 768x1024, Desktop 1280x720), waits 500ms, screenshots, flags horizontal overflow via `scrollWidth > clientWidth`, pushes a pass/warning row into the session results, then restores the original viewport |
| `webmobai_add_test_result` | yes | Appends one `{url, title, status, category, description, details}` row to the session results and records the URL as explored |
| `webmobai_generate_report` | yes | Runs a **fresh** a11y audit and perf snapshot at call time, then writes the HTML report (and JUnit XML unless `junit: false`) into the browser's session directory — deliberately not the cwd — and prints counts, pass rate, and the trace path |

### Run history (2)

Both read `~/.webmobai/history.json`, which is append-only with a 200-entry cap.

| Tool | Browser | What it does |
|---|---|---|
| `webmobai_get_run_history` | no | Last `limit` entries (default 20), newest first, optionally filtered by an exact-string `url`; prints LCP/CLS/FCP, pass counts, a11y issue count, and console-error count per entry |
| `webmobai_check_regressions` | no | Compares the **latest** entry for a URL against the median of the last `baseline_runs` (default 5) at `threshold_pct` (default 10), splitting the findings into regressions and improvements. Needs at least 2 entries for that URL |

### Scenario authoring (2)

| Tool | Browser | What it does |
|---|---|---|
| `webmobai_generate_scenario` | yes | Deterministic, **non-AI**. Inspects forms, nav, and CTAs on the current page and emits a starter scenario JSON |
| `webmobai_generate_scenario_from_prompt` | yes\* | Reads the current page and asks Claude for a scenario JSON matching a natural-language `description`; only the schema-validated object is returned. **Requires `WEBMOBAI_ANTHROPIC_API_KEY`** |

Neither can emit `storageState`, `saveStorageState`, or `pauseForManual` — those are absent from both vocabularies, and the AI generator's validator would reject them. Auth scenarios are hand-written.

### AI analysis (2)

Both **require `WEBMOBAI_ANTHROPIC_API_KEY`**.

| Tool | Browser | What it does |
|---|---|---|
| `webmobai_summarize_audit` | yes\* | Collects the session's test results, console errors, and a fresh a11y audit and perf snapshot, then asks Claude for a prioritized executive summary |
| `webmobai_explain_visual_diff` | no | Reads the baseline and actual PNGs **from disk paths** (plus an optional diff mask) and returns a plain-English change list tagged cosmetic / content / structural |

### Debugging (1)

| Tool | Browser | What it does |
|---|---|---|
| `webmobai_describe_selector` | yes | Counts matches. On zero it emits targeted hints (a missing `#id`, a missing `[data-testid]`) or a generic not-present/not-rendered/different-frame note; on one or more it describes up to `max_matches` (default 10) with tag, id, testid, role, aria-label, text, bounding box, and a `HIDDEN (0x0)` flag, warning when more than one matched |

---

## 8. Reports and artifacts

Each browser session gets its own directory, `<os.tmpdir()>/webmobai-<Date.now()>-<6 random chars>/`. Timestamps in filenames are `Date.now()` milliseconds, resolved independently per file, so the three artifacts of one run can differ by a few ms.

### Per-session directory

| File | What it is | Who writes it |
|---|---|---|
| `report-<ts>.html` | Self-contained HTML report | `webmobai-test`, `webmobai-scenario`, `webmobai_generate_report` |
| `report-<ts>.pdf` | A4 PDF render of the HTML report, `printBackground: true` | **`webmobai-test` only.** Non-fatal if it fails |
| `junit-<ts>.xml` | JUnit XML | **Unconditional** on `webmobai-test` and `webmobai-scenario`; on `webmobai_generate_report` unless `junit: false` |
| `trace.zip` | Playwright trace, written on browser close | Every run that launches through `BrowserManager` (open at https://trace.playwright.dev) |
| `screenshots/screenshot-<n>-<ts>.png`, `screenshots/full-<n>-<ts>.png` | Viewport and full-page captures | Any run that screenshots |
| `recordings/*.webm` | Session video | When video is on — `enableVideo: true` for `webmobai-test`, `record_video` (default **true**) on MCP launch. `webmobai-scenario` and `webmobai-suite` force it **off** |
| `visual-baselines/` | Pixel-diff baselines, plus `<name>.v<unix-ms>.png` archives and, on a failed compare, `.actual.png` + `.diff.png` | `webmobai_visual_snapshot` when `baseline_dir` is not overridden |

### `webmobai-suite` aggregate output

Aggregate artifacts land in `--out` (default **cwd**), not in a session directory:

| File | When |
|---|---|
| `report-<ts>.html` | `--reporter html` or `both` |
| `junit-<ts>.xml` | `--reporter junit` or `both` |
| `suite-<ts>.json` | **Always — even with `--reporter none`.** The full run result: every scenario's tags, step results, and its `sessionDir` |

> **CI gotcha.** Per-scenario screenshots, videos, and `trace.zip` are **not** copied into `--out`. Each scenario gets its own temp session directory, discoverable only via the `sessionDir` field inside `suite-<ts>.json`. To archive traces, read those paths out of the JSON and copy them yourself. Note also that a session directory of an authenticated run contains credential-equivalent material — see [§4](#test-behind-a-login-authenticated-sessions).

### JUnit XML shape

One `<testsuites name="WebMobAI">` wrapping exactly one `<testsuite>` named for the report URL's host + pathname. Status mapping: `pass` → a self-closing `<testcase>`, `fail` → `<failure>`, and **`warning` → `<skipped>`, deliberately not a failure**, so warnings keep CI green. `classname` is the result's category (`Navigation`, `Errors`, `Accessibility`, `Performance`, `Responsive`, `Content`, `Scenario`, or in suite runs the scenario's first tag). The `errors` attribute is hardcoded to `0`.

v1.4.0 hardening: ANSI colour escapes and XML-1.0-illegal control characters are stripped before entity-escaping. Previously a single bad byte in a page title made the whole file unparseable and importers dropped every result.

### The HTML report and the trace

The HTML report includes summary counts + pass rate, per-test results grouped by category, accessibility issues by severity, Web Vitals with ratings, and console errors. The Playwright trace is the better debugger — every action's DOM snapshot, network log, console log, and source location are time-travel-debuggable in the trace viewer.

### Run history

Separate from per-session artifacts: `~/.webmobai/history.json`, append-only with a **200-entry** cap (oldest dropped). Written by `webmobai-test`; read by `webmobai_get_run_history`, `webmobai_check_regressions`, and `webmobai-monitor`'s alerting. The path is not configurable — there is no env var or flag for it.

---

## 9. Configuration reference

### SessionConfig (`webmobai-test` and the desktop app)

The second arg to `webmobai-test` is a JSON SessionConfig:

```json
{
  "viewport": { "width": 1280, "height": 720 },
  "credentials": { "username": "test@example.com", "password": "..." },
  "maxPages": 5,
  "enableVideo": true,
  "enableA11y": true,
  "enablePerformance": true,
  "enableVisualRegression": false,
  "responsiveBreakpoints": [
    { "name": "Mobile", "width": 375, "height": 812 },
    { "name": "Tablet", "width": 768, "height": 1024 },
    { "name": "Desktop", "width": 1280, "height": 720 }
  ]
}
```

Every field is optional; the object is shallow-merged over the defaults shown above, and **malformed JSON warns to stderr and falls back to the defaults rather than exiting**. `maxPages: 5` means the homepage plus four internal links.

`credentials` is a best-effort landing-page auto-login heuristic, **not** the storageState feature. It looks for the first `input[type=email]`, `input[type=text][name*=email i]`, `input[name*=user i]`, or `input[id*=user i]` plus an `input[type=password]`, fills both, and presses Enter. If either input is missing it logs "No login form found on landing page" and continues unauthenticated. There is no `--url` flag: if the login lives on a separate page, pass that page as the positional `<url>`. For anything harder than a single-page form — MFA, SSO, a multi-step login — use a storageState session instead ([§4](#test-behind-a-login-authenticated-sessions)); `webmobai-test` does not support one.

### Environment variables

These three are the **only** environment variables WebMobAI reads anywhere. There is no `WEBMOBAI_HEADLESS`, no output-directory override, no history-path override, and no storageState variable. Playwright's own variables (`PLAYWRIGHT_BROWSERS_PATH` and friends) still apply, but no WebMobAI code reads them.

| Variable | Default | Effect |
|---|---|---|
| `WEBMOBAI_ANTHROPIC_API_KEY` | unset | Master switch for every AI feature: `webmobai_summarize_audit`, `webmobai_explain_visual_diff`, `webmobai_generate_scenario_from_prompt`, and the Claude executive summary in `webmobai-test`. Trimmed, so a whitespace-only value counts as unset. Unset means a polite disabled message, never an error |
| `WEBMOBAI_AI_MODEL` | `claude-opus-4-8` | Model ID for AI calls. An empty string falls back to the default |
| `WEBMOBAI_AI_MAX_TOKENS` | `2048` | Max tokens per AI call. A non-numeric or non-positive value falls back to 2048 |

### Network presets

| Preset | Latency | Download | Upload |
|---|---|---|---|
| `slow-3g` | 2000ms | 500 Kbps | 500 Kbps |
| `fast-3g` | 562.5ms | 1.5 Mbps | 750 Kbps |
| `slow-4g` | 400ms | 4 Mbps | 3 Mbps |
| `offline` | — | 0 | 0 |

Numbers match Chrome DevTools' built-in presets. Set via `webmobai_set_network_throttle`; pass `preset: null` to clear. **`offline` uses Playwright's context-level offline flag and works on every engine; the three bandwidth presets go through CDP and are Chromium-only — on Firefox and WebKit they are silently ignored**, so a "throttled" measurement there is really an unthrottled one.

### CPU throttling

`webmobai_set_cpu_throttle({ slowdown: 4 })` — quarter-speed JS execution, mirroring Lighthouse's mobile profile. `null` or `1` clears it. CDP-based, so **Chromium-only**.

### Visual regression tolerances

| Option | Default | What it controls |
|---|---|---|
| `threshold` | 0.2 | Per-pixel color sensitivity (0 = exact, 1 = any) |
| `max_diff_pixels` | unset | Absolute cap on differing pixels |
| `max_diff_pixel_ratio` | 0.01 | Proportional cap (1% of pixels) |

### Performance rating thresholds

`webmobai_get_performance_metrics` rates each metric good / needs-improvement / poor against these hardcoded cutoffs:

| Metric | Good below | Poor above |
|---|---|---|
| LCP | 2500ms | 4000ms |
| FCP | 1800ms | 3000ms |
| CLS | 0.1 | 0.25 |
| TTI | 3800ms | 7300ms |
| TTFB | 800ms | 1800ms |

INP is measured and reported but has no threshold row, so it is shown unrated.

---

## 10. CI integration

The summary is below; [docs/CI.md](./docs/CI.md) is the full treatment — exit-code contract, browser installation, artifact retention, and worked pipelines.

### GitHub Actions

```yaml
name: E2E
on: [push, pull_request]
jobs:
  e2e:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 22 }
      - run: npm install -g webmobai-mcp
      - run: npx playwright install --with-deps chromium firefox webkit
      - name: Run E2E suite (shard ${{ matrix.shard }}/4)
        run: webmobai-suite ./e2e/suite.json --shard ${{ matrix.shard }}/4 --workers 2 --out ./reports
      - name: Upload reports
        if: always()
        uses: actions/upload-artifact@v7
        with:
          name: reports-shard-${{ matrix.shard }}
          path: ./reports/
      - name: Publish JUnit results
        if: always()
        uses: dorny/test-reporter@v1
        with:
          name: E2E shard ${{ matrix.shard }}
          path: ./reports/junit-*.xml
          reporter: java-junit
```

The JUnit XML maps `fail → <failure>` and `warning → <skipped>` so warnings don't break CI; the dorny/test-reporter step renders results inline on the PR.

Five things that bite people in CI:

1. **Give every shard identical `--tag` / `--exclude-tag` flags.** Filtering runs before sharding, so mismatched filters shift the index space and shards will silently overlap or skip.
2. **A mistyped tag fails the job with exit 2**, not a green no-op. That is the point of the v1.4.0 guard — add `--allow-empty` only when an empty selection is genuinely expected. See [§6](#tag-filtering-sharding-and-exit-codes).
3. **Never gate on `webmobai-test`'s exit code** — it exits 0 with failing checks. Parse its JUnit XML or its emitted JSON `report` event instead.
4. **Traces are not in `--out`.** Only `report-*.html`, `junit-*.xml`, and `suite-*.json` land there; per-scenario traces and screenshots are in `$TMPDIR` under the `sessionDir` recorded in `suite-<ts>.json`. See [§8](#8-reports-and-artifacts).
5. **Pre-install only the engines you use.** `webmobai_launch_browser` self-installs on first use, but that download is untimed and uncached; install `firefox`/`webkit` only if a scenario or suite default names them.

Add `webmobai-doctor` (with `--storage-state` if you run authenticated) as a preflight step to fail fast with a clear message on a missing browser or a stale auth file instead of a cryptic mid-run Playwright error. It exits 1 only on hard errors; optional warnings still exit 0.

### GitLab CI

```yaml
e2e:
  parallel: 4
  image: mcr.microsoft.com/playwright:v1.52.0
  script:
    - npm install -g webmobai-mcp
    - webmobai-doctor
    - webmobai-suite ./e2e/suite.json --shard ${CI_NODE_INDEX}/${CI_NODE_TOTAL} --workers 2 --out ./reports
  artifacts:
    when: always
    reports:
      junit: ./reports/junit-*.xml
    paths:
      - ./reports/
```

`./reports/` holds the aggregate HTML, the JUnit XML, and `suite-<ts>.json`. It does **not** hold `trace.zip` — those live in `$TMPDIR`, one per scenario, at the `sessionDir` paths recorded inside `suite-<ts>.json`. Copy them explicitly if you want them archived, and remember that a trace from an authenticated run carries the session.

---

## 11. Troubleshooting

**Start with `webmobai-doctor`** — it checks Node's version, the three Playwright engines, the optional Lighthouse packages, the AI key, and (with `--storage-state`) your auth file, and tells you the exact install command for anything missing. For a Claude-driven walkthrough of the same ground, see the [troubleshooting-webmobai-setup](./.claude/skills/troubleshooting-webmobai-setup/SKILL.md) skill.

### "Browser is not launched. Call webmobai_launch_browser first."
The page-analysis, interaction, assertion, audit, and reporting tools require an active browser. Call `webmobai_launch_browser` first. Eight tools work with no browser at all: `webmobai_launch_browser`, `webmobai_close_browser`, `webmobai_get_run_history`, `webmobai_check_regressions`, `webmobai_visual_baseline_list_versions`, `webmobai_visual_baseline_restore_version`, `webmobai_lighthouse_audit`, and `webmobai_explain_visual_diff`. See the Browser column in [§7](#7-mcp-tool-reference).

### "Browser is already running. Close it first to relaunch."
`webmobai_launch_browser` refuses to relaunch over a live browser. Call `webmobai_close_browser` first. This is the usual snag when switching from a capture session to an authenticated replay with `storage_state_path`.

### "AI features are disabled."
`webmobai_summarize_audit`, `webmobai_explain_visual_diff`, and `webmobai_generate_scenario_from_prompt` need `WEBMOBAI_ANTHROPIC_API_KEY`. This is a normal tool response, not an error — nothing failed, the feature is simply off. A whitespace-only value counts as unset.

### "Lighthouse is not installed (or failed to load)."
`webmobai_lighthouse_audit` depends on two **optional** packages. Install them alongside the server: `npm install lighthouse chrome-launcher`. Every other tool works without them.

### An authenticated run redirects to /login
The saved session has expired. Nothing checks expiry at run time, so this surfaces as ordinary step failures rather than a distinct diagnostic. Run `webmobai-doctor --storage-state auth.json` for a (weak) staleness signal, then re-capture — see [§4](#test-behind-a-login-authenticated-sessions).

### Selectors are matching too many elements
Run `webmobai_describe_selector` to see what's matching and the recommended tightening.

### "Node.js 18+ is required" from the desktop app
Install Node.js from https://nodejs.org and restart the app. The desktop app spawns the runner via `node`.

### macOS says the app is damaged
"WebMobAI is damaged and can't be opened. You should move it to the Trash." The DMG isn't actually damaged — current releases aren't signed or notarized, so Gatekeeper rejects them. Either:

```bash
# Option 1: strip quarantine from the installed app
xattr -cr /Applications/WebMobAI.app

# Option 2: strip from the DMG before installing
xattr -cr ~/Downloads/WebMobAI_*.dmg
```

You can verify the quarantine flag with `xattr -l /Applications/WebMobAI.app` — `com.apple.quarantine` should be absent after the fix.

Signed/notarized releases are the long-term fix; see [CONTRIBUTING.md → Releasing a signed build](./CONTRIBUTING.md#releasing-a-signed-and-notarized-macos-build).

### Visual snapshot fails on a small intentional change
Increase `max_diff_pixel_ratio` (e.g., `0.02` = 2% tolerance) or `threshold` (e.g., `0.3` for less sensitive per-pixel comparison). If the change is intentional, re-run with `update_baseline: true`.

### Tests run serially despite `--workers N`
Each scenario spawns its own browser. If your scenarios share a stateful backend that doesn't tolerate concurrent runs, reduce `--workers`. Each worker is a separate isolated browser context.

### CSP errors in axe-core injection
The a11y audit injects axe-core via Playwright. Sites with strict CSP (`default-src 'self'`) may block the injection. The audit falls back to the hand-rolled supplementary ruleset with a warning in the log.

### Mobile emulation reports 980px width
Pages without `<meta name="viewport" content="width=device-width">` fall back to Chromium's 980px legacy mobile viewport. Page is being emulated correctly; the page itself isn't responsive. Use `page.viewportSize()` (already what Playwright reports internally) to confirm the emulated viewport.

### Self-healing keeps suggesting the same wrong selector
Snapshots are recorded after every successful action. If your initial selector matched the wrong element, the snapshot is of the wrong element too. Clear by restarting the browser (`webmobai_close_browser` + `webmobai_launch_browser`).

### "Tracing failed to start"
Tracing requires browser-context permissions that are usually fine. If it fails (rare), the run continues without a trace; check the log for the reason.

### A test passes locally but fails in CI
Common causes:
1. **Timing**: animations or async loads are slower in CI. Add `webmobai_wait_for` on a stable selector before assertions.
2. **Viewport**: CI's default may differ. Set viewport explicitly in the scenario.
3. **Locale**: CI may default to a different locale than your dev machine. Set explicitly via the launch.
4. **Fonts**: CI may not have the same fonts, affecting visual regression. Allow more tolerance or check baselines into git from a CI-generated source of truth.

### "Chromium not installed" on the desktop app
The auto-test runner installs Chromium on first launch. If it failed, check the console for the install command output. You can also install manually:
```bash
npx playwright install chromium
```

---

## Further reading

- [README.md](./README.md) — project front door, install paths
- [FEATURES.md](./FEATURES.md) — feature inventory, roadmap, version history
- [CONTRIBUTING.md](./CONTRIBUTING.md) — development setup, contributing guidelines
- [docs/README.md](./docs/README.md) — index of every document in the repo
- [docs/SCENARIO_FORMAT.md](./docs/SCENARIO_FORMAT.md) — the canonical human-readable mirror of the scenario and suite schemas
- [docs/AUTHENTICATION.md](./docs/AUTHENTICATION.md) — authenticated sessions in depth: capture, replay, expiry, CI, threat model
- [docs/CI.md](./docs/CI.md) — running WebMobAI as a CI gate
- [.claude/skills/README.md](./.claude/skills/README.md) — the 20 Claude skills that drive these workflows from natural language
- [Playwright trace viewer](https://trace.playwright.dev) — drop trace.zip to time-travel-debug a run
- [axe-core rules](https://dequeuniversity.com/rules/axe/4.10) — the a11y rule set used in our audits
- [Core Web Vitals](https://web.dev/articles/vitals) — LCP / FCP / CLS / INP / TTFB definitions and thresholds
