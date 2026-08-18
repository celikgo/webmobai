---
name: troubleshooting-webmobai-setup
description: Use when WebMobAI itself is broken rather than the site under test — the MCP tools don't appear in Claude, a tool says the browser is not launched, Playwright has no engine installed, Lighthouse or the AI tools report themselves disabled, a storageState file is rejected, or macOS calls the desktop app damaged. Driven by webmobai-doctor plus targeted checks. Triggers on "webmobai isn't working", "tools not showing up", "MCP server not connecting", "browser is not launched", "browser already running", "executable doesn't exist", "playwright install", "lighthouse not installed", "AI features are disabled", "app is damaged", "where are the reports".
---

# Troubleshooting a WebMobAI Setup

## Overview

This skill fixes **WebMobAI**, not the website. Everything else in the skills tree assumes the browser launches, the 51 `webmobai_*` tools are reachable, and artifacts land somewhere findable. When that assumption breaks, start here.

The workflow is a decision tree with one entry point: **run `webmobai-doctor` first**, then branch on what it reports. Doctor covers six things (seven with a flag) and nothing else — it does **not** check MCP wiring, macOS quarantine, disk space, or whether a browser can actually launch. Those get targeted checks further down.

Be precise about which layer is broken. "It doesn't work" splits three ways:
- **Environment** — Node, Playwright engines, optional deps, env vars. → `webmobai-doctor`.
- **Wiring** — the MCP server isn't reachable from Claude at all, so no `webmobai_*` tool exists. → config check.
- **Session state** — the tools exist but the browser isn't launched, or one is already running. → lifecycle check.

## When to Use

Trigger keywords: not working, tools missing, MCP server not connecting, "Browser is not launched", "Browser is already running", executable doesn't exist, playwright install, Node version, lighthouse not installed, AI features disabled, storageState invalid, app is damaged, quarantine, where are my reports.

Do **not** use this for a failing test on a working setup — a selector that stopped matching is `debugging-web-selectors`, and a genuinely broken page is `running-web-smoke-test`.

## Inputs You Need

1. **The verbatim error text.** The wording distinguishes a dispatcher guard from a getter throw from a Playwright error; guessing loses that signal.
2. **How WebMobAI was installed** — `npm i -g webmobai-mcp`, `npx -y webmobai-mcp`, the macOS `.dmg`, or from source (`mcp-server/` built with `npm run build`).
3. **Which host** — Claude Desktop, Claude Code, or a bare terminal.
4. **What was being attempted** — an MCP tool call, a CLI binary, or the desktop app.

## Workflow

### 1. Run the doctor
```
webmobai-doctor
webmobai-doctor --storage-state ./auth.json     # add the auth check
webmobai-doctor --help                          # usage, exit 0
```

Installed globally it is on `PATH`; otherwise `npx -y webmobai-mcp` installs the package and you can reach it as `npx webmobai-doctor`. It writes nothing to disk and everything to **stdout**.

Output format is `  <icon> <name>: <detail>` with two leading spaces, icons `✓` ok / `!` warn / `✗` error. The browser rows read with a double colon (`Browser: chromium: installed`) — that is correct, not a formatting bug.

```
WebMobAI environment check

  ✓ Node.js: v22.11.0 (>= 18 required)
  ✓ Browser: chromium: installed
  ! Browser: firefox: not installed — run: npx playwright install firefox  (optional engine)
  ! Browser: webkit: not installed — run: npx playwright install webkit  (optional engine)
  ! Lighthouse (optional): not installed — webmobai_lighthouse_audit is unavailable. Add it with: npm install lighthouse chrome-launcher
  ✓ AI features (optional): WEBMOBAI_ANTHROPIC_API_KEY is set
  ✓ Auth storageState: 7 cookie(s) loaded from auth.json

All required checks passed, 3 optional warning(s). You're ready.
```

**Exactly what it checks, in order — do not claim more:**

| # | Check | `ok` when | `warn` when | `error` when |
|---|---|---|---|---|
| 1 | `Node.js` | major ≥ 18 | — | major < 18 |
| 2 | `Browser: chromium` | the Playwright executable path exists | — | missing (**required** — chromium is the default engine) |
| 3 | `Browser: firefox` | executable exists | missing (optional engine) | — |
| 4 | `Browser: webkit` | executable exists | missing (optional engine) | — |
| 5 | `Lighthouse (optional)` | `require.resolve("lighthouse")` succeeds | not resolvable | — |
| 6 | `AI features (optional)` | `WEBMOBAI_ANTHROPIC_API_KEY` is set and non-blank | unset or whitespace-only | — |
| 7 | `Auth storageState` *(only with `--storage-state`)* | the file parses and has cookies | ≥1 dated cookie and **all** dated cookies expired | file missing, or not valid JSON |

**Exit codes:** `1` if any check is `error` (prints `N problem(s) must be fixed before WebMobAI will run. M warning(s).`), otherwise `0` — **warnings never fail it**. There is no exit 2; unknown arguments are silently ignored, and `--storage-state` with no following value silently skips check 7.

Now branch.

### 2. Branch — `✗ Node.js`
`v<x> is too old — WebMobAI requires Node 18+.` The package declares `"engines": {"node": ">=18.0.0"}`. Install a current Node (this repo's CI runs Node 22), then re-run doctor. If the desktop app reports the same thing, it spawns the runner via `node` from your PATH — restart the app after upgrading so it picks up the new one.

### 3. Branch — `✗ Browser: chromium`
```
npx playwright install chromium
```
On a CI runner or a fresh Linux box, add the system libraries too: `npx playwright install --with-deps chromium`.

Worth knowing so you can tell "broken" from "slow": `BrowserManager.launch()` calls `ensureBrowserInstalled()` first and **self-installs the requested engine on first use**, logging `First run — downloading the <engine> browser (one-time, ~1–3 min).` to stderr. So a first launch that appears to hang for a couple of minutes is usually the download, not a failure. It has a 10-minute hard timeout. If Playwright's own CLI can't be located you get `Cannot locate the Playwright CLI to install <engine>. Install it manually with: npx playwright install <engine>` — do exactly that.

Pre-installing is still the right move in CI, where an untimed download inside the job is a liability (see `running-web-ci-suites`).

### 4. Branch — `! Browser: firefox` / `! Browser: webkit`
Optional. They only matter if a scenario sets `"browser": "firefox"`, a suite sets `defaults.browser`, or the user asked for cross-engine coverage. Install just the one they need: `npx playwright install webkit`. Two Chromium-only capabilities to mention if they switch engines: `webmobai_get_accessibility_tree` (CDP `Accessibility.getFullAXTree`) returns `Accessibility tree not available (CDP not supported on this browser)`, and the bandwidth presets on `webmobai_set_network_throttle` plus all of `webmobai_set_cpu_throttle` are silently ignored off Chromium (`offline` still works everywhere).

### 5. Branch — `! Lighthouse (optional)`
`lighthouse` and `chrome-launcher` are declared under `optionalDependencies` and imported dynamically at first use. When absent, **`webmobai_lighthouse_audit` does not crash** — it returns this as a normal tool response:

```
Lighthouse is not installed (or failed to load). Install with:
  npm install lighthouse chrome-launcher
Then retry.
```

Relay that verbatim and never estimate scores. Nothing else degrades — all 50 other tools are unaffected. Install from the `mcp-server/` directory (or wherever the package lives), then retry. Any other Lighthouse failure surfaces as `Lighthouse audit failed: <msg>`, which is a different problem — usually Chrome failing to launch.

### 6. Branch — `! AI features (optional)`
`WEBMOBAI_ANTHROPIC_API_KEY` gates exactly **three** tools: `webmobai_summarize_audit`, `webmobai_explain_visual_diff`, `webmobai_generate_scenario_from_prompt`. With it unset (or whitespace-only, which counts as unset) each returns, as a normal successful response — no throw, no MCP error, no network call:

```
AI features are disabled. Set WEBMOBAI_ANTHROPIC_API_KEY (and optionally WEBMOBAI_AI_MODEL) to enable.
```

The check runs before the browser check, so this message wins even with no browser launched. Everything else — every audit, assertion, and report — works without a key.

Set it in the MCP host's env block, not just your shell, or the server process won't see it:

```json
{
  "mcpServers": {
    "webmobai": {
      "command": "npx",
      "args": ["-y", "webmobai-mcp"],
      "env": { "WEBMOBAI_ANTHROPIC_API_KEY": "sk-ant-..." }
    }
  }
}
```

Two companion variables, neither a gate: `WEBMOBAI_AI_MODEL` (default `claude-opus-4-8`; an empty value falls back to the default) and `WEBMOBAI_AI_MAX_TOKENS` (default `2048`; non-numeric or ≤ 0 falls back to 2048). Those three are the **only** environment variables WebMobAI reads — there is no headless switch, no output-directory override, no history-path override, and no env var for the auth session.

### 7. Branch — `✗` / `!` on `Auth storageState`
- **`file not found: <abs> — create it by logging in and saving the session`** → the path doesn't exist. Doctor resolves it against the **current working directory** and prints the absolute path; `BrowserManager` does *not* resolve it, so a relative path can mean different files from different cwds. Prefer absolute paths when diagnosing.
- **`<abs> is not valid storageState JSON`** → the file isn't parseable. Common cause: a CI secret written with a trailing newline mangled, or an empty file.
- **`every dated cookie in <path> has expired — the session is likely stale; re-save it`** → re-capture it.
- **`ok` is weak evidence.** The heuristic warns only when there is ≥1 dated cookie **and every** dated cookie is expired. One long-lived refresh cookie alongside an expired access cookie still reports `ok`. Session cookies (no `expires`, or `-1`) are excluded from the expiry test entirely, and `origins[]` / localStorage is **never inspected** — so a JWT in localStorage that expired yesterday reports `ok` with a healthy cookie count.

At runtime, `launch` only checks that the file **exists**; nothing validates expiry. A stale session shows up as ordinary failures — redirects to `/login`, `assertVisible` timeouts — with no distinct diagnostic. Capture and replay live in `testing-web-authenticated-sessions`.

### 8. Doctor is clean but tools still fail — check session state
Doctor never launches a browser, so a green report says nothing about the live session. Match the error text:

- **`Browser is not launched. Call webmobai_launch_browser first.`** — the dispatcher's pre-check. Most tool groups declare `requiresBrowser: true`, so the handler is never entered. Fix: call `webmobai_launch_browser`.
- **`Error executing <tool>: Browser not launched. Call launch() first.`** — the raw getter throw from an unguarded tool (`webmobai_navigate`, `webmobai_click`, `webmobai_type`, `webmobai_scroll`, `webmobai_screenshot`, `webmobai_set_viewport`). Different wording, same cause and same fix; it is a cosmetic inconsistency, not a crash.
- **The browser disappeared mid-session.** If `idle_timeout_ms` was passed to `webmobai_launch_browser`, a Node timer auto-closes the browser after that much inactivity, logging `Closing browser after <ms>ms idle (no tool calls).` Every successful tool call resets the countdown. Relaunch, and either raise or omit `idle_timeout_ms`.
- **Eight tools genuinely need no browser** and will work while everything else complains: `webmobai_launch_browser`, `webmobai_close_browser`, `webmobai_get_run_history`, `webmobai_check_regressions`, `webmobai_visual_baseline_list_versions`, `webmobai_visual_baseline_restore_version`, `webmobai_lighthouse_audit` (it spawns its own Chrome), and `webmobai_explain_visual_diff` (reads PNGs from disk). If those work and nothing else does, it's session state, not installation.

### 9. Branch — `Browser is already running. Close it first to relaunch.`
The MCP server holds **one** `BrowserManager` for the whole process, so there is exactly one browser per server session. `webmobai_launch_browser` refuses rather than leaking the old one. Call `webmobai_close_browser`, then launch again — that is also how you change viewport engine, device emulation, `record_video`, or `storage_state_path`, since all of them are launch-time options.

`webmobai_close_browser` is safe to call even when nothing is running (the teardown is null-safe), so it is a fine blind first move when the state is unclear. It stops tracing, closes context and browser, resets any `webmobai_route` mocks, and prints the video and `trace.zip` paths.

### 10. Branch — the MCP server doesn't appear in Claude at all
Symptom: no `webmobai_*` tool exists, so *every* call fails with "unknown tool" rather than a WebMobAI message. This is wiring, and doctor cannot see it.

1. **Check the config file for the host.**
   - Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows).
   - Claude Code: `.mcp.json` in the project root.

   Both take the same block:
   ```json
   {
     "mcpServers": {
       "webmobai": { "command": "npx", "args": ["-y", "webmobai-mcp"] }
     }
   }
   ```
   For a from-source checkout, point at the built entry directly — and note it must be **built**, since `bin` maps to `dist/`:
   ```json
   {
     "mcpServers": {
       "webmobai": { "command": "node", "args": ["/abs/path/to/mcp-server/dist/index.js"] }
     }
   }
   ```
   Claude Code can also do it in one line: `claude mcp add webmobai npx -y webmobai-mcp`.

2. **Validate the JSON.** A trailing comma or a duplicate `mcpServers` key makes the host skip the file silently.

3. **Use an absolute `command` if `npx`/`node` isn't on the host's PATH.** GUI apps often don't inherit a shell PATH; `"command": "/opt/homebrew/bin/node"` with an absolute script path is the reliable form.

4. **`dist/index.js` must exist.** From source: `cd mcp-server && npm install && npm run build`.

5. **Restart the host.** Config is read at startup; the 51 tools appear only after a restart.

6. **Run the server by hand to see why it dies:**
   ```
   npx -y webmobai-mcp
   ```
   A healthy server prints two stderr lines and then sits waiting on stdin:
   ```
   [hh:mm:ss.mmm] [INFO] Starting WebMobAI MCP Server v1.2.0
   [hh:mm:ss.mmm] [INFO] WebMobAI MCP Server running on stdio transport
   ```
   The `v1.2.0` in that banner is a **stale hardcoded string** — the package and the server's advertised MCP version are both `1.4.0`. Don't chase it. If the process exits instead, the error printed there is the real cause.

### 11. Branch — macOS says the desktop app is damaged
`"WebMobAI is damaged and can't be opened. You should move it to the Trash."` Current releases are **not signed or notarized**, so Gatekeeper quarantines them. The download is fine; strip the quarantine attribute once:

```bash
# after installing
xattr -cr /Applications/WebMobAI.app

# or on the DMG before installing
xattr -cr ~/Downloads/WebMobAI_*.dmg
```

Verify with `xattr -l /Applications/WebMobAI.app` — `com.apple.quarantine` should be gone. This affects only the `.dmg` desktop app; the npm package and the CLI binaries are never quarantined. Signed/notarized releases are the durable fix and are tracked in `CONTRIBUTING.md`.

### 12. Point them at logs and artifacts
- **Logs go to stderr, always, and are never written to a file.** Every logger level uses `console.error` — deliberately, because stdout is the MCP stdio protocol channel and anything printed there would corrupt it. That means MCP-mode logs are wherever your host captures the server's stderr; the reliable way to read them is to run the server by hand (step 10.6). CLI binaries print their logs to your terminal's stderr directly.
- **Session artifacts** land in `<os.tmpdir()>/webmobai-<Date.now()>-<rand6>/` — `/tmp/webmobai-…` on Linux, `/var/folders/…/webmobai-…` on macOS (`echo $TMPDIR`). Inside: `screenshots/`, `recordings/`, `trace.zip`, plus `report-<ts>.html` and `junit-<ts>.xml` for the runs that generate them. `webmobai_generate_report` writes into that session dir on purpose, not into your cwd — so "the report isn't in my project" is expected; use the path the tool prints.
- **`webmobai-suite` aggregate reports** are the exception: they go to `--out` (default cwd).
- **Run history** is `~/.webmobai/history.json`, capped at 200 entries, oldest dropped. It is per-machine — CI runs and your laptop keep separate histories.
- Temp directories are subject to OS cleanup. Copy anything you need to keep before the machine reaps it.

## Tools Used

- **`webmobai-doctor [--storage-state <auth.json>]`** — the entry point; the six/seven checks above.
- **`npx playwright install [--with-deps] <engine>`** — the fix for a missing engine.
- `mcp__webmobai__webmobai_launch_browser` / `mcp__webmobai__webmobai_close_browser` — to reproduce and clear a session-state problem.
- `mcp__webmobai__webmobai_get_run_history` — a browser-free tool; if it works and browser tools don't, the server is fine and only the session is broken.
- `xattr -cr` — macOS quarantine only.

No page-level tool belongs in this skill. If the setup is healthy, hand off to whichever skill matches the actual testing goal.

## Output

```
WEBMOBAI SETUP CHECK

Doctor:
  ✓ Node.js: v22.11.0 (>= 18 required)
  ✗ Browser: chromium: not installed — run: npx playwright install chromium  (required: chromium is the default engine)
  ! Browser: firefox: not installed  (optional engine)
  ! Browser: webkit: not installed  (optional engine)
  ! Lighthouse (optional): not installed
  ! AI features (optional): WEBMOBAI_ANTHROPIC_API_KEY not set
  → exit 1

Diagnosis: one hard failure — no Chromium engine. That is why
webmobai_launch_browser hangs and then errors.

Fix:
  npx playwright install chromium

Not a problem right now:
  - firefox/webkit: only needed if a scenario names them.
  - Lighthouse: only webmobai_lighthouse_audit is affected; it returns install
    instructions instead of scores, nothing crashes.
  - AI key: only summarize_audit, explain_visual_diff, and
    generate_scenario_from_prompt are affected; they return a
    "AI features are disabled" message. The other 48 tools are unaffected.

Re-run webmobai-doctor after the install — expect exit 0 with 3 warnings.
```

## Tips & Gotchas

- **Warnings are not failures.** Doctor exits 0 with every optional check warning. Only Node < 18, a missing chromium, or a broken `--storage-state` file produce exit 1. Don't let a wall of `!` icons send someone installing things they don't need.
- **Doctor never launches a browser.** `✓ Browser: chromium: installed` means the executable file is on disk, nothing more. A sandbox, a missing shared library, or a corrupt download still fails at launch. If doctor is green and launch still fails, read the Playwright error verbatim — that is the real diagnostic.
- **Never print to stdout from an MCP server.** If someone patched in a `console.log` while debugging, the protocol breaks and the host drops the connection with no useful error. All WebMobAI logging is `console.error` for exactly this reason.
- **`npx -y webmobai-mcp` re-resolves the package each start.** Convenient, and it means a stale global install is not your problem — but it also means a network hiccup at startup looks like a broken server. `npm i -g webmobai-mcp` plus an absolute command path is the stable form.
- **Two different "not launched" messages exist.** The friendly one comes from the dispatcher; the raw `Browser not launched. Call launch() first.` comes from six unguarded browser-control tools. Same cause; don't treat them as separate bugs.
- **One browser per server process.** There is no multi-context or multi-tab mode. "Open a second tab" is not supported — close and relaunch.
- **Relative paths are cwd-sensitive and inconsistent.** Doctor resolves `--storage-state` against cwd; `BrowserManager` does not resolve it at all; suite scenario `path` entries resolve against the suite file's directory but `storageState` does not. When a path is in question, make it absolute.
- **The `v1.2.0` startup banner is a stale string, not a stale install.** The package version, the `bin` set, and the server's advertised MCP version are all `1.4.0`.
- **Gatekeeper affects only the `.dmg`.** If the CLI works but the app won't open, it's quarantine, not installation.

## Example Invocations

User: *"WebMobAI stopped working — none of the tools show up in Claude Code."*
→ No `webmobai_*` tool existing at all is wiring, not environment. Walk `.mcp.json`: valid JSON, a `command` that resolves (absolute path if `npx` isn't on the host's PATH), `dist/index.js` built if it's a source checkout, then restart Claude Code. If it still doesn't connect, run `npx -y webmobai-mcp` in a terminal and read the stderr.

User: *"It says 'Browser is not launched' but I definitely launched it."*
→ Check for `idle_timeout_ms` on the launch call — the idle timer auto-closes the browser after that much inactivity and every tool call resets it. Also confirm the earlier launch actually succeeded rather than returning `Browser is already running.` Recover with `webmobai_close_browser` (safe with nothing running) then `webmobai_launch_browser`.

User: *"I get 'AI features are disabled' — is my install broken?"*
→ No. That's the gate on three tools only (`webmobai_summarize_audit`, `webmobai_explain_visual_diff`, `webmobai_generate_scenario_from_prompt`) and it returns as normal text, never an error. Set `WEBMOBAI_ANTHROPIC_API_KEY` in the MCP host's `env` block — a shell export won't reach the server process — and restart the host. Everything else already works.

User: *"Fresh laptop, first run just hangs then errors out."*
→ Run `webmobai-doctor`. Almost always `✗ Browser: chromium`. The runner does self-install on first launch (~1–3 min, logged to stderr), so a hang can be that download — but pre-install with `npx playwright install chromium` and re-run doctor to be sure. Also confirm Node ≥ 18 while you're there.
