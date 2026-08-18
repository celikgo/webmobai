---
name: testing-web-authenticated-sessions
description: Use when the user wants to test, audit, or crawl a site that sits behind a login wall — capture a logged-in session once with webmobai_save_storage_state, then replay it on every later run via storage_state_path, --storage-state, or the scenario storageState field. Triggers on "test behind the login", "authenticated test", "log in first", "save the session", "storageState", "test the logged-in area", "test the dashboard", "reuse my login", "session cookie", "MFA", "SSO login", "it redirects me to /login".
---

# Testing Web Authenticated Sessions

## Overview

Most of a real app lives behind a login. Every other WebMobAI skill launches a **clean Chromium profile** — no cookies, no localStorage — so it sees the login page and nothing else. This skill is the bridge: it captures a logged-in session **once** into a Playwright storageState JSON, then replays that session on every subsequent run so the audit/crawl/form test the user actually asked for can reach the authenticated pages.

Two modes, and they are almost never used in the same turn:

- **Mode A — Capture** (one time, headed, a human may be involved). Log in for real, prove you are logged in, write the session to a file.
- **Mode B — Replay** (every run after — headed or headless, local or CI). Seed a fresh browser from that file, land on an authenticated page directly, and hand off to the downstream skill.

The file this produces is a **live credential**. It holds session cookies and localStorage tokens in plaintext. Treat it exactly as you would a password: never print its contents, never commit it, never paste it into a report.

Capability shipped in v1.4.0 (Sprint 18). Two MCP surfaces (`webmobai_save_storage_state`, plus `storage_state_path` on `webmobai_launch_browser`), two scenario step verbs (`saveStorageState`, `pauseForManual`), one scenario field (`storageState`), one suite default (`defaults.storageState`), and CLI flags on `webmobai-scenario`, `webmobai-suite`, and `webmobai-doctor`.

## When to Use

Trigger keywords: test behind the login, authenticated test, log in first, save the session, storageState, test the logged-in area, reuse my login, MFA, SSO, "it keeps redirecting me to /login".

Use this skill when:

- The target URL is inside an authenticated area (`/dashboard`, `/account`, `/admin`, `/app/*`).
- Another skill hit a login wall mid-run — see **Detecting a login wall** below.
- The user wants an authenticated suite to run unattended in CI.
- A previously working authenticated run started failing with redirects to `/login` (expired session — go to Mode A re-capture).

Do **not** use this skill to *test the login form itself*. Exercising validation, error messages, and the happy path of a login form is `testing-web-forms`. This skill treats logging in as plumbing, not as the thing under test.

## Inputs You Need

1. **Login URL** — the page hosting the login form (e.g. `https://app.example.com/login`).
2. **Credentials** — ask explicitly. **Never invent them.** If the user won't share them, Mode A can still work: drive the browser headed and let the user type the password themselves during a manual pause.
3. **Second factor** — is there MFA, a CAPTCHA, or an SSO redirect to a third-party IdP? This decides whether a human must be in the loop (it usually does — see the limitations).
4. **A logged-in proof selector** — something that exists only when authenticated (`[data-testid=user-menu]`, an avatar, a "Sign out" link). Without this you cannot tell a real session from a cached login page, and you will happily save an unauthenticated file.
5. **Session file path** — default to `auth.json` in the project root; it is already gitignored (see Secret Hygiene). Anything else, confirm it is ignored first.
6. **Environment** — staging or production? An authenticated production session grants real privileges. Confirm before capturing, and refuse destructive downstream work on an admin session.
7. **What they actually want tested** — the authenticated session is a means, not an end. Get the downstream goal so you can hand off in the same browser session.

## Workflow

### Mode A — Capture a session (one time, headed)

This is the **only reliable capture path**. Do it over MCP, headed. Read the `pauseForManual` warning in Tips before considering the CLI route.

#### A1. Launch headed, with a clean profile

`webmobai_launch_browser`. Do **not** pass `storage_state_path` — you are creating the session, not reusing one.

```json
{ "headless": false, "record_video": false }
```

`headless` already defaults to `false`, but be explicit: a human may need to see this window. Set `record_video: false` deliberately — MCP launch defaults it to `true`, and a recording of a headed login captures the credentials being typed on video.

`webmobai_launch_browser` refuses with `"Browser is already running. Close it first to relaunch."` if a browser is open. Call `webmobai_close_browser` first.

#### A2. Navigate to the login page

`webmobai_navigate` to the login URL. Then `webmobai_get_interactive_elements` to find the real selectors for the email, password, and submit controls — do not guess them.

#### A3. Drive the login

Fill and submit with `webmobai_type` and `webmobai_click`:

```json
{ "selector": "#email", "text": "qa@example.com" }
```

If the user declined to share the password, skip typing it and go straight to A4 — the human types it in the visible window.

#### A4. Let a human complete anything you cannot automate

MFA codes, CAPTCHAs, and SSO consent screens cannot be automated. Over MCP this needs **no tool at all**: the headed browser simply sits there between tool calls. Tell the user plainly:

> The browser window is open on the MFA prompt. Complete it, then tell me to continue.

Then wait for their reply before calling the next tool. This is strictly better than the `pauseForManual` scenario step, which is a blind fixed timer (see Tips).

#### A5. Prove you are actually logged in

**Do not skip this.** This is what stops you from writing an unauthenticated file that fails mysteriously a week later.

- `webmobai_wait_for` with `url_contains` set to the post-login path (e.g. `/dashboard`).
- `webmobai_assert_visible` on the logged-in proof selector from Inputs.

```json
{ "selector": "[data-testid=user-menu]", "timeout_ms": 10000 }
```

If the assertion fails, **stop**. Report the failure and the self-healing triage it returns; do not save a session you cannot prove.

#### A6. Save the session

`webmobai_save_storage_state`:

```json
{ "path": "auth.json" }
```

`path` is required. The tool guards on a launched browser and replies:

```
Saved the current session to auth.json.
Reuse it on a later launch via storage_state_path (or --storage-state) to start already logged in.
⚠️ This file contains session tokens — add it to .gitignore and never commit or share it.
```

It writes cookies **and** localStorage. It never echoes the file contents. Relative paths resolve against the process working directory.

#### A7. Verify the file, then close

`webmobai-doctor --storage-state auth.json` — confirms the file parses and reports the cookie count. Then `webmobai_close_browser`.

Tell the user the **path** and that it is a credential. Never show them the file.

### Mode B — Replay the session (every run after)

Pick the surface that matches where the run happens.

#### B1. Interactive / MCP

`webmobai_launch_browser` with `storage_state_path`:

```json
{ "storage_state_path": "auth.json", "headless": false }
```

`BrowserManager.launch()` checks the file exists up front and throws a directive error if not:

```
storageState file not found. Create one by logging in once and saving the session
(the webmobai_save_storage_state tool, saveStorageState(), or the --save-storage-state CLI flag).
```

Note the error deliberately omits the path, and the success response deliberately does not echo it either — it prints `The browser started from a saved authenticated session (already logged in).` instead of the usual clean-profile line. That line is your confirmation the session was applied.

#### B2. Confirm the session survived, then go

Navigate **straight to the authenticated page** — no login detour:

1. `webmobai_navigate` to e.g. `https://app.example.com/dashboard`.
2. `webmobai_assert_visible` on the logged-in proof selector.
3. `webmobai_assert_url` with `contains: "/dashboard"` — catches a silent bounce to `/login`.

If either assertion fails, the session is stale. Go to **Re-capture** below.

#### B3. Scenario file

Set the top-level `storageState` field:

```json
{
  "name": "Checkout as a logged-in user",
  "url": "https://app.example.com/cart",
  "storageState": "auth.json",
  "steps": [
    { "type": "assertVisible", "selector": "[data-testid=user-menu]", "description": "Session is still valid" },
    { "type": "assertUrl", "contains": "/cart" },
    { "type": "click", "selector": "[data-testid=checkout]" },
    { "type": "wait", "urlContains": "/checkout", "timeoutMs": 15000 }
  ]
}
```

The runner navigates to `scenario.url` before step 1, so the run lands on the authenticated page directly. Lead with an assertion that proves the session — a stale session otherwise fails several steps later with a confusing message.

Run it: `webmobai-scenario checkout.json`, or override the file's field from the command line:

```bash
webmobai-scenario checkout.json --storage-state ci-auth.json
```

#### B4. Suite / CI

Apply one session to every scenario via `defaults.storageState`:

```json
{
  "name": "Pre-deploy E2E",
  "defaults": { "storageState": "auth.json", "continueOnFailure": false },
  "scenarios": [
    { "path": "./scenarios/checkout.json", "tags": ["e2e", "auth"] },
    { "path": "./scenarios/account.json", "tags": ["smoke", "auth"] }
  ]
}
```

Or from the command line: `webmobai-suite pre-deploy.json --storage-state auth.json`.

**Precedence differs between the two CLIs — this is real, not a typo:**

| Runner | Behavior | Effective precedence |
|---|---|---|
| `webmobai-scenario` | `opts.storageState ?? scenario.storageState` | **flag wins** over the scenario field |
| `webmobai-suite` | `r.scenario.storageState ??= args.storageState` | scenario field > `defaults.storageState` > **flag loses** |

So a scenario that hardcodes `"storageState": "dev-auth.json"` will **silently ignore** `--storage-state ci-auth.json` inside a suite. If CI must control the session, leave `storageState` out of the scenario files entirely.

Both flags take a **space-separated** value. `--storage-state=auth.json` is not supported: `webmobai-scenario` silently ignores it, `webmobai-suite` exits 2 with "Unknown option".

#### B5. Preflight in CI

Run the doctor before the suite so a stale session fails fast with a clear message instead of as twelve mystery assertion timeouts:

```bash
webmobai-doctor --storage-state ./auth.json
webmobai-suite ./suites/e2e.json --storage-state ./auth.json --reporter both --out ./webmobai-out
```

`webmobai-doctor` exits 1 only on hard errors; optional warnings still exit 0.

#### B6. Hand off

The session is live for the whole browser session. Do not close the browser — move straight into the downstream skill (see Handing Off).

### Detecting a login wall mid-run

Any skill can trip over this. The signals, in order of how often you will see them:

| Signal | How you notice it | What it means |
|---|---|---|
| Redirect to a login path | `webmobai_navigate` returns a final URL of `/login`, `/signin`, `/auth/*`, or `?next=` / `?returnUrl=` | Server-side auth gate |
| Post-login-form page title | `webmobai_get_page_state` shows "Sign in", "Log in" where you expected app content | Same, without a URL change |
| Auth-gated empty state | Page renders the app shell but every data region is blank or shows "Please sign in" | Client-side gate; the URL looks correct and lies |
| 401 / 403 | `webmobai_check_errors` reports network failures on the XHR/fetch calls the page made | API rejected the session; the shell still rendered |
| Assertion fails on a selector that "should be there" | `webmobai_assert_visible` triage lists login-form elements among nearby matches | You are on the login page |

When you hit one: **stop the downstream work immediately.** Do not keep crawling and do not report the login page's a11y/perf/SEO numbers as if they were the app's — that is a false-green audit of the wrong page. Say plainly which URL bounced and to where, then offer Mode A. If a session file already exists, treat this as expiry and go to Re-capture.

### Verifying a session before a long run

Cheap checks, in increasing cost:

1. **`webmobai-doctor --storage-state auth.json`** — no browser needed. Exact semantics:
   - File missing → `error` (exit 1), prints the **resolved absolute** path.
   - Unparseable JSON → `error` (exit 1).
   - There is at least one cookie with a numeric `expires > 0` **and every one of them** is in the past → `warn`: `every dated cookie in <path> has expired — the session is likely stale; re-save it`.
   - Otherwise → `ok`: `<n> cookie(s) loaded from <path>` (counting **all** cookies, session cookies included).

   This heuristic is weak on purpose and you must say so: a single long-lived refresh cookie alongside an expired access cookie reports `ok`. Session cookies and localStorage JWT `exp` claims are **never** examined. `ok` means "plausible", not "valid".

2. **A one-step scenario or a Mode B assert** — the only real proof. Launch with the session, navigate to an authenticated page, `webmobai_assert_visible` on the proof selector. Do this before kicking off a 30-minute suite.

Nothing checks expiry **at runtime**. `launch()` only verifies the file exists. A stale session produces ordinary step failures with no distinct diagnostic — which is exactly why step 2 is worth the 10 seconds.

### Re-capture when the session has expired

1. Confirm it is expiry, not a broken selector: `webmobai-doctor --storage-state auth.json`, then a Mode B assert. A redirect to `/login` on a page that worked yesterday is expiry.
2. `webmobai_close_browser` if a browser is open.
3. Re-run **Mode A** end to end, writing to the **same path**. `webmobai_save_storage_state` overwrites; there is no versioning and no backup.
4. In CI, this means refreshing the stored secret — a re-captured file must be pushed back to the secret store, not committed.
5. If the session expires faster than the suite runs, say so rather than papering over it. There is **no refresh loop and no retry-on-401 anywhere in the codebase**; short-TTL sessions are a genuine limitation.

## Tools Used

Primary:
- `mcp__webmobai__webmobai_launch_browser` — `storage_state_path` for Mode B; omit it for Mode A
- `mcp__webmobai__webmobai_save_storage_state` — the capture; `path` required
- `mcp__webmobai__webmobai_navigate`
- `mcp__webmobai__webmobai_get_interactive_elements` — find the real login selectors
- `mcp__webmobai__webmobai_type`
- `mcp__webmobai__webmobai_click`
- `mcp__webmobai__webmobai_wait_for` — `url_contains` on the post-login path
- `mcp__webmobai__webmobai_assert_visible` — the logged-in proof, both modes
- `mcp__webmobai__webmobai_assert_url` — catches a silent bounce to `/login`
- `mcp__webmobai__webmobai_close_browser`

Conditional:
- `mcp__webmobai__webmobai_get_page_state` — confirm a suspected login wall by title/content
- `mcp__webmobai__webmobai_check_errors` — surfaces the 401/403 network failures behind a blank authenticated page
- `mcp__webmobai__webmobai_describe_selector` — when the proof selector matches 0 elements
- `mcp__webmobai__webmobai_screenshot` — evidence of the logged-in state; never screenshot a filled password field

CLIs:
- `webmobai-doctor --storage-state <file>` — preflight and expiry heuristic
- `webmobai-scenario <file> [--storage-state <f>] [--save-storage-state <f>]`
- `webmobai-suite <file> [--storage-state <f>]`

## Output

Mode A ends with a path and a warning, never contents:

```
Session captured — https://app.example.com
  Logged in as:      qa@example.com (MFA completed manually)
  Verified:          assert_url /dashboard  ✓
                     assert_visible [data-testid=user-menu]  ✓
  Saved to:          auth.json
  Doctor:            ✓ Auth storageState: 7 cookie(s) loaded from auth.json
  Reuse:             storage_state_path: "auth.json"  (MCP)
                     --storage-state auth.json        (webmobai-scenario / -suite)
  ⚠ auth.json holds live session tokens. Already gitignored. Do not commit, print, or share it.
```

Mode B leads with the session check, then gets out of the way:

```
Authenticated run — https://app.example.com/dashboard
  Session:  auth.json applied at launch  ✓
  Verified: assert_visible [data-testid=user-menu]  ✓
            assert_url contains /dashboard  ✓
  → handing off to auditing-web-accessibility on the authenticated dashboard
```

A detected login wall:

```
BLOCKED — login wall at https://app.example.com/dashboard
  Navigated to /dashboard, landed on /login?returnUrl=%2Fdashboard
  The crawl stopped here — auditing the login page would report the wrong page's numbers.
  Options: capture a session (Mode A, needs credentials + a headed window),
           or point me at the public pages instead.
```

## Tips & Gotchas

- **`pauseForManual` is a no-op in every shipped CLI entry point.** Both callers of the scenario runner — `webmobai-scenario` and the suite runner — hardcode `headless: true`, and neither CLI has a `--headed` flag. In headless mode the step logs a warning to stderr, **records as pass**, and continues immediately. So the "capture a session with a `pauseForManual` + `saveStorageState` scenario" pattern **cannot work through the CLI**: the run goes green while writing a pre-MFA, unauthenticated `auth.json`. This is the single biggest trap in the feature. **Always capture over MCP (Mode A).**
- **Even headed, `pauseForManual` is a blind timer.** It is `page.waitForTimeout(ms)` — it does not read stdin, does not detect that the human finished, always burns the full window, and is clamped to 300 000 ms (5 min). Default is 30 000 ms. An SSO consent flow longer than five minutes cannot be waited out in one step. The MCP flow has no such limit because it just waits for the user's next message.
- **The launch response never echoes the path, but the save response does.** `webmobai_save_storage_state` returns `Saved the current session to <path>`, and `webmobai-scenario --save-storage-state` prints the path to stdout. Only the *contents* are protected. Do not tell the user "the path is never printed" — that is true of launch only.
- **Relative paths are cwd-sensitive and resolve inconsistently.** `browser-manager` calls `existsSync(storageStatePath)` with no `resolve()`; the suite loader resolves scenario `path` entries against the suite file's directory but copies `storageState` through as a bare string; `webmobai-doctor` **does** resolve. So `webmobai-doctor --storage-state auth.json` and a suite run launched from another directory can be talking about two different files. **Use absolute paths in CI.**
- **sessionStorage and IndexedDB are not captured.** This is Playwright's limitation and WebMobAI adds nothing on top. An app that keeps its token in either **cannot be replayed with this feature at all**. Cookies (context-wide, all domains) and localStorage do round-trip.
- **`origins[]` is per-origin and only covers origins the context actually visited during capture.** If the app reads its token from an origin you never loaded, replay will not be authenticated. Visit the authenticated page during Mode A, not just the login page.
- **SSO to a third-party IdP is partial.** No SSO-specific handling exists anywhere in the codebase. The redirect chain works during capture because cookies are context-wide, but IdP-side localStorage is only captured for origins you visited, and any flow requiring re-consent or an interactive device-code step on every login cannot be replayed at all.
- **Headless replay of a headed capture can be rejected.** Sites that fingerprint headless browsers may accept the capture and refuse the replay. WebMobAI mitigates partially — a spoofed desktop Chrome UA for chromium-without-device and `--disable-blink-features=AutomationControlled` — but this is not a guarantee. If replay fails only in CI, suspect this.
- **Traces and video capture the authenticated session and are not redacted.** Tracing runs with `screenshots + snapshots + sources` and writes `<sessionDir>/trace.zip`; the trace path **is** printed by `webmobai_close_browser` and by `webmobai-scenario`. MCP launch defaults `record_video: true`. A CI job that archives the session dir publishes credential-equivalent material. Set `record_video: false` during capture, and do not archive traces from authenticated runs unless the user wants that tradeoff.
- **There is no environment variable for the session.** No `WEBMOBAI_STORAGE_STATE` exists — the only env vars the whole codebase reads are `WEBMOBAI_ANTHROPIC_API_KEY`, `WEBMOBAI_AI_MODEL`, and `WEBMOBAI_AI_MAX_TOKENS`. CI **must** materialize the JSON to a file on disk from a secret before invoking any CLI.
- **`webmobai-codegen` cannot record behind a login.** It launches its own `chromium.launch({ headless: false })` with `newContext()` and no options — no storageState in, none out. It also redacts password inputs to the literal string `<REDACTED — password field>`, so a recorded login is not replayable without hand-editing.
- **AI scenario generation cannot emit auth steps.** `webmobai_generate_scenario_from_prompt` validates the model's output against a schema that omits `saveStorageState`, `pauseForManual`, and the top-level `storageState`; `webmobai_generate_scenario` never emits them either. Auth scenarios are hand-written.
- **One browser at a time.** `webmobai_launch_browser` refuses if one is running. Switching from a clean profile to an authenticated one means `webmobai_close_browser` first, then relaunch with `storage_state_path`.
- **Never gate CI on `webmobai-test`'s exit code**, and note it has no storageState support at all — it only has a legacy best-effort credentials auto-login heuristic on the landing page. For authenticated CI use `webmobai-suite`.

### Never Do This

- **Never put a password in a scenario file.** Scenario JSON gets committed. A `{"type": "type", "text": "hunter2"}` step is a credential in version control forever. Capture the session over MCP instead and commit only `storageState: "auth.json"` — a path, not a secret.
- **Never commit the session file.** It is a live credential; anyone holding it is logged in as that user until it expires. The repo already ignores `auth.json`, `*.auth.json`, and `*storage-state*.json`. Those patterns are **name-based and incomplete** — `session.json`, `state.json`, `.auth/creds.json`, and `ci-auth-prod.json` match none of them. If the user names the file something else, add the pattern to `.gitignore` before saving.
- **Never print, cat, echo, or paste the file's contents.** Not into chat, not into a report, not into a log, not "just the cookie names". The tools are built to avoid this — do not undo that by reading the file yourself.
- **Never invent or guess credentials.** Ask. If the user won't share a password, run headed and let them type it.
- **Never hand the session file to CI as a committed file.** It belongs in the CI secret store, written to disk by the job at runtime and never uploaded as a build artifact.
- **Never reuse a production admin session for destructive tests.** An authenticated session carries the full privileges of that account. Delete/disable/purge flows against a real admin session do real damage. Use a scoped test account on staging, and confirm the environment before capturing.
- **Never report an audit of the login page as an audit of the app.** If you hit a login wall, say you were blocked. A green a11y report on `/login` when the user asked about `/dashboard` is worse than no report.

## Handing Off

Authentication is never the goal. Once Mode B has verified the session, **keep the browser open** and continue into the skill the user actually wanted — the session persists for the whole browser session, so no re-launch and no re-login is needed:

| The user actually wants | Skill | Note |
|---|---|---|
| Exercise a form/flow inside the app | `testing-web-forms` | Their login form is *its* subject; yours is everything past it |
| a11y of authenticated pages | `auditing-web-accessibility` | Audit the real app, not the login page |
| Full QA pass on the logged-in app | `testing-web-app` | The master orchestration; it will crawl authenticated pages once seeded |
| Map what exists behind the login | `exploring-web-app` | Skip logout/delete URLs during the crawl |
| Pass/fail acceptance on an authenticated flow | `verifying-web-flows` | Lead with the session-proof assertion |
| Web Vitals on authenticated pages | `auditing-web-performance` | Relaunch with `record_video: false` if you captured with video on |
| Visual diffs of authenticated pages | `regression-web-visual` | Both baseline and current must use the same session |
| Cookie flags on the real session | `auditing-web-security` | Session cookies only exist post-login, so this genuinely needs Mode B |
| Turn the authenticated flow into replayable JSON | `authoring-web-scenarios` | Add `storageState` by hand — the generators cannot emit it |
| Track authenticated runs over time | `monitoring-web-regressions` | Note the session will expire between scheduled runs |
| Run the authenticated suite as a CI gate | `running-web-ci-suites` | Pass the file via `--storage-state`; store it as a CI secret, never a committed file |
| The session file itself is being rejected | `troubleshooting-webmobai-setup` | `webmobai-doctor` first — it distinguishes missing / malformed / expired |

Say which skill you are moving to and why, so the user can redirect.

## Example Invocations

User: *"Audit the accessibility of our dashboard at https://app.example.com/dashboard — it's behind a login."*
→ Explain the two-step shape first. Ask for credentials, the MFA situation, and a logged-in proof selector. Mode A headed: navigate to `/login`, `webmobai_type` the creds, pause for MFA if needed, `webmobai_assert_visible` the user menu, `webmobai_save_storage_state` to `auth.json`, close. Then Mode B: relaunch with `storage_state_path`, navigate to `/dashboard`, assert the session, hand off to `auditing-web-accessibility` in the same browser.

User: *"Save my login so I don't have to do this every time."*
→ Pure Mode A. Headed launch with `record_video: false`, drive or let them drive the login, verify with an assertion, `webmobai_save_storage_state`. Report the path, run `webmobai-doctor --storage-state` to confirm the cookie count, and show both reuse forms (`storage_state_path` and `--storage-state`). State that it is a credential and already gitignored.

User: *"Run the e2e suite in GitHub Actions against the logged-in app."*
→ Mode B, CI shape. Materialize the session from a secret to a file in the job, `webmobai-doctor --storage-state ./auth.json` as a preflight, then `webmobai-suite ./suites/e2e.json --storage-state ./auth.json --reporter both --out ./webmobai-out`. Warn about the `??=` precedence — if the scenario files hardcode `storageState`, the flag is ignored — and that traces live in `$TMPDIR`, not `--out`, and contain the session.

User: *"The crawl keeps landing on /login."*
→ Login-wall detection. Report the exact bounce (`/dashboard` → `/login?returnUrl=…`) and that you stopped rather than audit the wrong page. If no session file exists, offer Mode A. If one does, run `webmobai-doctor --storage-state` plus a Mode B assert to distinguish expiry from a wrong path, then re-capture to the same path.

User: *"We use Okta SSO with a hardware key — can you still test the app?"*
→ Be honest about the boundary. Mode A can work **once, headed, with the human present**: you drive to the IdP, they complete the key tap, you assert the logged-in state and save. It cannot be automated and cannot be re-done unattended in CI, so the session file has to be refreshed by hand whenever it expires. Warn that IdP-side localStorage is only captured for origins visited during capture, and that if the app stores its token in sessionStorage or IndexedDB this will not replay at all.
