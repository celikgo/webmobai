# Authenticated Sessions

Most of a real application lives behind a login. WebMobAI's answer is
Playwright's **storageState**: log in once, write the resulting session to a
JSON file, and start every later run from that file so the browser is already
authenticated.

This document is the deep reference. For the short version see
[`USER_MANUAL.md` §4](../USER_MANUAL.md) and the
`testing-web-authenticated-sessions` skill.

Canonical sources of truth for everything below:

- [`mcp-server/src/playwright/browser-manager.ts`](../mcp-server/src/playwright/browser-manager.ts) — `launch({ storageStatePath })`, `saveStorageState()`
- [`mcp-server/src/tools/browser-tools.ts`](../mcp-server/src/tools/browser-tools.ts) — `webmobai_launch_browser`, `webmobai_save_storage_state`
- [`mcp-server/src/scenario/types.ts`](../mcp-server/src/scenario/types.ts) — `Scenario.storageState`, the `saveStorageState` and `pauseForManual` steps
- [`mcp-server/src/suite/types.ts`](../mcp-server/src/suite/types.ts) — `SuiteDefaults.storageState`
- [`mcp-server/src/doctor-cli.ts`](../mcp-server/src/doctor-cli.ts) — the `Auth storageState` preflight check

If anything here disagrees with those files, the source wins.

---

## 1. The model

A storageState file is a plain JSON document Playwright writes from a browser
context. Its shape:

```jsonc
{
  "cookies": [
    { "name": "sid", "value": "…", "domain": "app.example.com", "path": "/",
      "expires": 1789000000, "httpOnly": true, "secure": true, "sameSite": "Lax" }
  ],
  "origins": [
    { "origin": "https://app.example.com",
      "localStorage": [ { "name": "token", "value": "eyJhbGciOi…" } ] }
  ]
}
```

`BrowserManager.saveStorageState(path)` is a thin wrapper over
`context.storageState({ path })`. `BrowserManager.launch({ storageStatePath })`
passes the path straight to `browser.newContext({ storageState })`. WebMobAI
adds an existence check and secret-safe logging on top; it does not transform,
encrypt, or filter the contents.

### What is captured

| Captured | Scope | Notes |
|---|---|---|
| **Cookies** | Context-wide, **all domains** | Includes cookies set by a separate SSO/IdP domain during the login redirect chain. |
| **localStorage** | **Per origin**, only origins the context actually visited | A JWT or bearer token in `localStorage` is written into the file in plaintext. |

### What is *not* captured

| Not captured | Consequence |
|---|---|
| **sessionStorage** | An app that keeps its token in `sessionStorage` cannot be replayed with this feature at all. |
| **IndexedDB** | Same — no replay path. |
| **Origins never visited during capture** | `origins[]` only holds origins the capture context loaded. If your app reads a token from an origin you never opened, replay lands unauthenticated. |
| **`Authorization` headers set by JS at runtime** | Recomputed by the app on load, or not at all. |
| **Service-worker state, HTTP-only request headers** | Not part of Playwright's storageState. |

These are Playwright's documented limits. WebMobAI does not work around them.

---

## 2. Supplying a saved session — four surfaces

### 2.1 MCP — `webmobai_launch_browser` `storage_state_path`

```json
{ "storage_state_path": "auth.json" }
```

Optional string, no default. The launch response deliberately **never echoes
the path** — with a session it ends with
`The browser started from a saved authenticated session (already logged in).`,
without it `The browser has a clean profile — no cookies, cache, or extensions.`

`webmobai_launch_browser` refuses when a browser is already running
(`Browser is already running. Close it first to relaunch.`), so call
`webmobai_close_browser` before relaunching authenticated.

### 2.2 Scenario field — `storageState`

```jsonc
{
  "name": "Checkout as a logged-in user",
  "url": "https://app.example.com/cart",
  "storageState": "auth.json",
  "steps": [ /* … */ ]
}
```

### 2.3 Suite default — `defaults.storageState`

```jsonc
{
  "name": "Pre-deploy E2E",
  "defaults": { "storageState": "auth.json" },
  "scenarios": [
    { "path": "./scenarios/checkout.json", "tags": ["e2e", "auth"] }
  ]
}
```

Applied by the loader as `scenario.storageState ?? defaults.storageState` — a
scenario that sets its own field keeps it.

### 2.4 CLI flag — `--storage-state <file>`

```bash
webmobai-scenario checkout.json --storage-state auth.json
webmobai-suite    pre-deploy.json --storage-state auth.json
webmobai-doctor   --storage-state auth.json
```

Space-separated value only. **There is no `=` form** — `--storage-state=auth.json`
is an unknown token: silently ignored by `webmobai-scenario`, a hard exit 2
(`Unknown option`) by `webmobai-suite`.

**There is no environment variable.** No `WEBMOBAI_STORAGE_STATE` or equivalent
exists anywhere in the codebase. CI must materialize the JSON to a file on disk.

### 2.5 Precedence — and the inconsistency between the two runners

| Runner | Rule | Effective precedence |
|---|---|---|
| `webmobai-scenario` | `opts.storageState ?? scenario.storageState` | **`--storage-state` wins** over the scenario field |
| `webmobai-suite` | `r.scenario.storageState ??= args.storageState` after the loader merged suite defaults | **`--storage-state` loses** to the scenario field, and to `defaults.storageState` |

This is a real inconsistency, not a typo. A scenario that hardcodes
`"storageState": "dev-auth.json"` will silently ignore
`--storage-state ci-auth.json` when run inside a suite. If you rely on the flag
in CI, leave `storageState` out of the scenario files and out of
`defaults`.

### 2.6 Path resolution is cwd-sensitive

Resolution is not uniform:

- `BrowserManager.launch()` calls `existsSync(storageStatePath)` with **no `resolve()`** — a relative path resolves against `process.cwd()`.
- `webmobai-scenario` resolves the *scenario file* path but passes `storageStatePath` through unresolved.
- The suite loader resolves scenario `path` entries relative to the **suite file's directory**, but copies `storageState` through as a bare string — so a suite-relative `"./auth.json"` is looked up relative to the invoking cwd, not the suite dir.
- `webmobai-doctor` **does** `resolve()` the path.

Net effect: `webmobai-doctor --storage-state auth.json` and a suite run started
from a different directory can be talking about different files. **Use absolute
paths in CI.**

### 2.7 Binaries with no auth support

| Binary | Status |
|---|---|
| `webmobai-codegen` | No storageState at all — accepts only `<url>` and `-o/--out`, and calls `browser.newContext()` with no options. It cannot record behind a login. |
| `webmobai-test` | No storageState. It has a separate, older best-effort landing-page auto-login heuristic driven by `RunConfig.credentials` (`{username, password}` in the config JSON), which fills the first email/user-ish input plus a password input and presses Enter. |
| `webmobai-monitor` | No storageState — it spawns `webmobai-test` and inherits only the credentials path. |

There is also **no MCP tool that runs a scenario file**; scenarios are a CLI-only
surface.

---

## 3. Creating a session — three surfaces

### 3.1 Interactive MCP capture (the flow that works for MFA)

This is the recommended path, and the only one where a human can complete an
interactive challenge. Tool calls in order:

1. `webmobai_launch_browser` with `{ "headless": false }` (already the default).
   Do **not** pass `storage_state_path`.
2. `webmobai_navigate` to the login URL.
3. `webmobai_type` / `webmobai_click` to drive the credential form.
4. The human completes MFA / CAPTCHA / SSO consent in the visible window. **No
   tool call is needed for this** — the browser simply sits there between calls.
5. `webmobai_save_storage_state`:

   ```json
   { "path": "auth.json" }
   ```

6. `webmobai_close_browser`.

`path` is required. Response on success, verbatim:

```
Saved the current session to auth.json.
Reuse it on a later launch via storage_state_path (or --storage-state) to start already logged in.
⚠️ This file contains session tokens — add it to .gitignore and never commit or share it.
```

Guards: with no browser launched it returns
`Cannot save storage state: no browser is launched. Launch a browser and log in first, then call this tool.`
With no `path` it returns `` `path` is required — where to write the storageState JSON. ``

### 3.2 Scenario step — `saveStorageState`

```json
{ "type": "saveStorageState", "path": "auth.json", "description": "Persist the logged-in session" }
```

`path` is required, `description` optional. Report label when no description is
given: `Save authenticated session (storageState)`.

Use this for a **non-interactive** login (username + password, no MFA) that you
want captured as part of a replayable scenario. For anything interactive, see
§4 — the pause verb does not do what the name suggests under the CLI.

### 3.3 CLI flag — `--save-storage-state <file>`

```bash
webmobai-scenario capture-auth.json --save-storage-state auth.json
```

The save happens **after** `runScenario` returns and **before** the browser
closes, so it still runs when earlier steps failed and later steps were skipped.
Prints:

```
Saved session storageState to auth.json (keep it out of version control).
```

Both flags are legal together — replay from one file, refresh into another:

```bash
webmobai-scenario flow.json --storage-state old.json --save-storage-state refreshed.json
```

`--save-storage-state` exists **only** on `webmobai-scenario`. There is no
equivalent on `webmobai-suite`, `webmobai-test`, or `webmobai-monitor`.

---

## 4. Manual MFA and the `pauseForManual` verb

```json
{ "type": "pauseForManual", "prompt": "Enter the MFA code in the browser window", "timeoutMs": 120000 }
```

All fields optional. Default `prompt`:
`Complete the manual step (MFA / CAPTCHA / SSO), then wait.`
Default `timeoutMs` **30 000**, clamped to `[0, 300000]` — a hard 5-minute
ceiling.

### The critical caveat: it is a no-op in every shipped CLI

`runScenario` is invoked from exactly two places — `webmobai-scenario` and the
suite runner — and **both hardcode `headless: true`**. `webmobai-scenario` has no
`--headed` flag (its parser recognizes only `--storage-state`,
`--save-storage-state`, and one positional; unknown flags are silently
discarded), and there is no MCP tool that runs a scenario file.

So `pauseForManual` always takes its headless branch: it logs a warning to
stderr, records the step as **pass**, and continues immediately.

The consequence is a false green. A capture scenario shaped like this:

```jsonc
[
  { "type": "type",  "selector": "#email",    "text": "qa@example.com" },
  { "type": "type",  "selector": "#password", "text": "…" },
  { "type": "click", "selector": "[data-testid=submit]" },
  { "type": "pauseForManual", "prompt": "Enter the MFA code", "timeoutMs": 120000 },
  { "type": "saveStorageState", "path": "auth.json" }
]
```

run through `webmobai-scenario` will skip the pause, reach `saveStorageState`
before MFA completes, write a **pre-MFA, unauthenticated `auth.json`**, and
report every step green.

**Use the MCP capture flow (§3.1) for anything interactive.** `pauseForManual`
is only useful to a programmatic caller that constructs its own
`BrowserManager` with `headless: false` and calls `runScenario` directly.

Even then it is a blind `page.waitForTimeout(waitMs)` — it does not detect
completion, does not read stdin, cannot be shortened by finishing early, and
cannot exceed 300 000 ms. An SSO consent flow longer than five minutes cannot be
waited out in one step.

---

## 5. Validating a session — `webmobai-doctor`

```bash
webmobai-doctor --storage-state auth.json
```

Adds a seventh check, `Auth storageState`, after the Node / browser / Lighthouse
/ API-key checks:

| Condition | Status | Detail |
|---|---|---|
| File missing | `error` | `file not found: <abs> — create it by logging in and saving the session` |
| `JSON.parse` throws | `error` | `<abs> is not valid storageState JSON` |
| ≥1 dated cookie **and every** dated cookie expired | `warn` | `every dated cookie in <path> has expired — the session is likely stale; re-save it` |
| Otherwise | `ok` | `<n> cookie(s) loaded from <path>` — `n` counts **all** cookies |

Details worth knowing before you trust the check:

- Expiry is compared in **seconds** (`Date.now() / 1000`).
- **A single non-expired dated cookie makes the whole check `ok`.** A long-lived refresh cookie sitting next to an expired access cookie reports green.
- Session cookies (`expires` absent or `-1`) are excluded from the expiry evaluation entirely.
- `origins[]` / localStorage is **never inspected** — a file whose only credential is an expired JWT in localStorage reports `ok`.
- The `error` branches print the resolved absolute path; the `ok` / `warn` branches print the path **as typed**.

Exit codes: `0` when there are zero `error` checks (warnings do not fail), `1`
when any check errors. Passing `--storage-state` with no following value sets it
`undefined` and the check is silently skipped. Everything goes to stdout.

### Nothing checks expiry at runtime

`launch()` only checks that the file exists. A stale session produces ordinary
step failures — a redirect to `/login`, an `assertVisible` timeout — with no
distinct diagnostic. There is no refresh loop and no retry-on-401 anywhere in
the codebase.

### Re-capture

Re-capture is the only remedy. Repeat §3.1 (or re-run the capture scenario with
`--save-storage-state`) and overwrite the file. In practice:

- Run `webmobai-doctor --storage-state <file>` as a preflight step so a stale session fails the job with a clear message instead of a cryptic mid-run failure.
- Re-capture on a cadence shorter than your shortest session TTL.
- After a re-capture, re-upload the secret (§6) — the file on the CI runner is a copy, not a reference.

---

## 6. CI handling

There is no env-var input, so a CI job must write the JSON to disk before
invoking any WebMobAI binary.

```yaml
- name: Materialize the saved session
  run: |
    printf '%s' "$WEBMOBAI_AUTH_JSON" > "$RUNNER_TEMP/auth.json"
  env:
    WEBMOBAI_AUTH_JSON: ${{ secrets.WEBMOBAI_AUTH_JSON }}

- name: Preflight
  run: webmobai-doctor --storage-state "$RUNNER_TEMP/auth.json"

- name: Run the suite authenticated
  run: |
    webmobai-suite ./suites/e2e.json \
      --storage-state "$RUNNER_TEMP/auth.json" \
      --reporter both --out ./webmobai-out
```

Rules:

1. **Store the file contents as an encrypted secret**, not in the repo. It is credential-equivalent.
2. **Write it under a temp dir the runner destroys** (`$RUNNER_TEMP` on GitHub Actions, `$CI_BUILDS_DIR` scratch on GitLab) and use the **absolute path** — see §2.6.
3. **Never `cat` it, never echo it into logs**, and never write it under a path that an artifact-upload glob will pick up.
4. **Remember the flag loses to scenario fields in a suite** (§2.5). Keep `storageState` out of the committed scenario JSON so the CI flag is the single source.
5. **Playwright traces and videos contain the authenticated session** — see §7.

See [`CI.md`](CI.md) for the rest of the CI story: sharding, exit codes, JUnit
wiring, and artifact upload.

---

## 7. Secret hygiene

### Enforced in code

| Rule | Where |
|---|---|
| The launch response never echoes the storageState path — a fixed sentence is substituted | `tools/browser-tools.ts` |
| Session **contents** never appear in any tool response | `tools/browser-tools.ts`; asserted by `test/storage-state.test.ts` |
| The missing-file error message deliberately omits the path | `playwright/browser-manager.ts` |
| Both storageState log lines are path-free and content-free (`Loading a saved authenticated session (storageState).` / `Saved the current session's storageState.`) | `playwright/browser-manager.ts` |
| All logger output goes to **stderr**, never stdout, never a file | `utils/logger.ts` |
| `webmobai-codegen` redacts password inputs — the emitted step's `text` is the literal string `<REDACTED — password field>` | `codegen-cli.ts` |
| `.gitignore` patterns for the conventional filenames | [`.gitignore`](../.gitignore) — `auth.json`, `*.auth.json`, `*storage-state*.json` |

### Convention only — not enforced

- **The save path *is* printed.** `webmobai_save_storage_state` returns `Saved the current session to <path>`, and `webmobai-scenario` prints `Saved session storageState to <path> …` to stdout. Only *contents* are protected. Do not claim "the path is never printed" — that is true of launch only.
- **No file-permission hardening.** Nothing chmods to `0600`, encrypts, or sets an expiry. The write is a bare `context.storageState({ path })`.
- **No parent-directory creation.** WebMobAI does not `mkdir` before the write.
- **`.gitignore` coverage is name-based and incomplete.** A session written to `session.json`, `state.json`, `.auth/creds.json`, or `ci-auth-prod.json` matches none of the three patterns. Either use a covered name or extend `.gitignore`.
- **Traces and videos capture the authenticated session and are not redacted.** Tracing runs with `{ screenshots: true, snapshots: true, sources: true }` and is written to `<sessionDir>/trace.zip`; the trace path **is** printed by `webmobai_close_browser` and by `webmobai-scenario`. MCP `webmobai_launch_browser` defaults `record_video: true`, so a headed login is recorded on video by default. (`webmobai-scenario` and the suite runner both pass `recordVideo: false`.) The session dir is `<os.tmpdir()>/webmobai-<ts>-<rand>` — a CI job that archives it publishes credential-equivalent material.
- **`webmobai-codegen` only redacts `input[type="password"]`.** Email, a TOTP code typed into an `input[type=text]`, an API key, a card number — all are written verbatim into the emitted scenario.

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `storageState file not found. Create one by logging in once and saving the session (…)` | Relative path resolved against the wrong cwd, or the file was never written. The message deliberately omits the path. | Use an absolute path; confirm with `webmobai-doctor --storage-state <abs>`. |
| `Cannot save storage state: no browser is launched.` | `webmobai_save_storage_state` called before `webmobai_launch_browser`, or after `webmobai_close_browser`. | Launch, log in, save, *then* close. |
| `` `path` is required — where to write the storageState JSON. `` | `webmobai_save_storage_state` called with no `path`. | Pass `{"path": "auth.json"}`. |
| `Browser is already running. Close it first to relaunch.` | Trying to relaunch with `storage_state_path` while a clean-profile browser is open. | `webmobai_close_browser` first. |
| Run lands on `/login`; assertions time out; no auth-specific error | Session expired, or the app stores its token in `sessionStorage`/IndexedDB (not captured). | `webmobai-doctor --storage-state <file>`; if it says `ok`, suspect §1 "not captured" and check where the app keeps its token. |
| `webmobai-doctor` says `ok` but the run is still unauthenticated | The check is weak — one live dated cookie is enough for `ok`, and localStorage is never inspected. | Re-capture (§3.1) and retry. |
| Suite ignores `--storage-state` | A scenario file or `defaults.storageState` already sets the field; suite uses `??=`. | Remove `storageState` from the scenario/defaults, or pass the right value there. |
| `--storage-state=auth.json` does nothing (`webmobai-scenario`) or exits 2 (`webmobai-suite`) | No `=` form exists. | Use a space: `--storage-state auth.json`. |
| Capture scenario passes every step but writes an unauthenticated file | `pauseForManual` no-oped under headless — see §4. | Capture over MCP (§3.1). |
| Login works headed, fails headless | The site fingerprints headless browsers. WebMobAI mitigates only partially (spoofed desktop Chrome UA for chromium-without-device, `--disable-blink-features=AutomationControlled`). | No general fix. Try a `device` preset, or run the flow through a surface that is headed. |
| `webmobai-codegen` output has `<REDACTED — password field>` | By design — the recorder never emits password values. | Hand-edit the scenario, or don't record logins; capture a session instead. |

---

## 9. Limitations

Stated plainly, because each one has bitten someone:

1. **`pauseForManual` never pauses under any shipped CLI.** Headless is hardcoded in both entry points and there is no `--headed` flag. It records a pass and continues. (§4)
2. **`--storage-state` precedence is inconsistent** between `webmobai-scenario` (flag wins) and `webmobai-suite` (flag loses). (§2.5)
3. **Path resolution is inconsistent and cwd-sensitive** across `launch()`, the two CLIs, the suite loader, and `webmobai-doctor`. (§2.6)
4. **sessionStorage and IndexedDB are never captured.** Apps that store their token there cannot use this feature at all. (§1)
5. **`origins[]` only covers origins the capture context visited.** (§1)
6. **Nothing validates expiry at runtime**, and the `webmobai-doctor` heuristic is weak — one live dated cookie is enough for `ok`, localStorage `exp` claims are never read. (§5)
7. **No refresh, no re-auth loop, no retry-on-401** anywhere in the codebase. Re-capture is the only remedy.
8. **No SSO-specific handling exists.** An IdP redirect chain works during capture because cookies are context-wide, but IdP-side localStorage is only captured for origins visited, and a flow requiring interactive re-consent or a device-code step on every login cannot be replayed.
9. **No environment-variable input.** CI must write the file to disk. (§2.4)
10. **AI scenario generation cannot produce auth steps.** The prompt vocabulary and the schema validating the model's output both omit `saveStorageState`, `pauseForManual`, and the top-level `storageState`, so `webmobai_generate_scenario_from_prompt` will never emit them and would reject them if the model tried. `webmobai_generate_scenario` (the deterministic scaffolder) likewise never emits auth fields.
11. **`webmobai-codegen` cannot record behind a login**, and a recorded login is not replayable without hand-editing the redacted password. (§2.7)
12. **Trace and video are not redacted** and are printed/discoverable by path. (§7)
13. **Test coverage is partial.** `test/storage-state.test.ts` covers the save→replay round-trip, the missing-file error, the save-without-browser guard, the no-secret-leak response assertion, and the headless `pauseForManual` no-op. Not covered anywhere: the `SuiteDefaults.storageState` cascade, either CLI flag, the `saveStorageState` scenario step, headed `pauseForManual`, or the `webmobai-doctor` expired-cookie warn branch.
