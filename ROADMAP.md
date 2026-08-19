# Roadmap

This document planned the wave of WebMobAI development from **Sprint 14 onward**. It continues
the sprint convention from [FEATURES.md §5](./FEATURES.md).

**Status: Sprints 14–17 all shipped in v1.3.0; Sprint 18 shipped in v1.4.0.** The codebase is
currently at the end of **Sprint 18, v1.4.0**. The sprint sections below are kept as the record
of what was planned and what actually landed — each is marked ✅ **shipped**, with any deviation
from the plan called out. Candidate future work is in [What's next](#whats-next) at the bottom;
it is a list of open items, not a schedule.

Sprints 14–17 were organized into three tracks the team prioritized:

- **Track A — Desktop app polish & UX** (close the visible rough edges)
- **Track B — AI intelligence layer** (lean into the Claude differentiator)
- **Track C — New testing capabilities** (Lighthouse, monitoring, PDF, baseline history)

A cross-cutting **Track D — hardening / tech debt** runs alongside and is folded into each sprint.

---

## Guiding principles

1. **Don't regress the green test surface.** Every sprint ends with `npm test` green on
   Chromium + Firefox + WebKit, and new behavior ships with tests (158 when this was written;
   **214** as of v1.4.0).
2. **AI is opt-in, never required.** All Claude-API features degrade gracefully to "feature
   unavailable, set `WEBMOBAI_ANTHROPIC_API_KEY`" — the tool surface stays fully usable without it.
   This was a deliberate reversal of the then-current "no external API calls from the server" stance
   in [FEATURES.md §3](./FEATURES.md); see Sprint 15 for the rationale. That row is gone from §3 now —
   the AI layer shipped and stayed opt-in.
3. **Keep the three consumer paths in sync.** A capability that makes sense in the MCP tools
   should also surface in the desktop app and (where relevant) the CLIs.
4. **Update the docs in the same PR.** `FEATURES.md`, `CHANGELOG.md`, and `USER_MANUAL.md`
   move with the code.

---

## Sprint 14 — Desktop polish & persistence (Track A + D) — ✅ shipped in v1.3.0

**Goal:** Close every "renders but does nothing" gap in the desktop app and make the app feel
like it remembers you. These are fast, high-visibility wins.

| # | Task | Files | Notes |
|---|---|---|---|
| 14.1 | **State persistence** — persist theme, MCP port, last URL, settings, and last report across restarts | `src/stores/useSettingsStore.ts`, `src/stores/useSessionStore.ts` | Use Zustand `persist` middleware → `localStorage`. Persist settings always; persist last session behind a "restore last run" toggle. |
| 14.2 | **Wire up screenshot actions** — the Download and Open-externally buttons in the gallery are currently stubbed (render, no `onClick`) | `src/components/ScreenshotGallery.tsx`, `src-tauri/` | Download → Tauri `dialog.save` + `fs.copyFile`; Open → `shell.open` on the file path. Needs `tauri-plugin-dialog` + `tauri-plugin-fs` capability entries. |
| 14.3 | **Fullscreen screenshot preview** — lightbox modal with prev/next + keyboard nav | `src/components/ScreenshotGallery.tsx`, new `src/components/ui/dialog.tsx` (Radix Dialog) | |
| 14.4 | **Toast notifications** — run complete, run failed, copy-to-clipboard success | new `src/components/ui/toast.tsx`, `App.tsx` | Radix Toast. Fire from store status transitions. |
| 14.5 | **Keyboard shortcuts** — ⌘↵ run, ⌘. stop, ⌘K command palette (stretch) | `App.tsx`, `src/components/Header.tsx` | |
| 14.6 | **Clickable WCAG links + copy selector** in the a11y panel; "copy selector" on each finding | `src/components/AccessibilityPanel.tsx` | The `helpUrl` field already exists in the type but isn't rendered. |
| 14.7 | **ActionLog filter + export** — filter by status/type, copy/export the log as JSON | `src/components/ActionLog.tsx` | |
| 14.8 | **Remove dead code** — `wsConnected` in the session store is never wired up | `src/stores/useSessionStore.ts` | Delete it, or implement the WS path. Recommend delete. |

**New deps:** `@radix-ui/react-dialog`, `@radix-ui/react-toast`, Tauri `dialog`/`fs`/`shell` plugins.
**Risk:** Low. UI-only, no engine changes.
**Definition of done:** No stubbed buttons remain; app restores theme/port/URL on relaunch;
screenshots are downloadable and openable; toasts fire on run completion.

**As shipped (deviation):** 14.2 landed as **Open in default app** + **Reveal in Finder** via
`tauri-plugin-shell` only — no Download-to-a-chosen-path, and neither `tauri-plugin-dialog` nor
`tauri-plugin-fs` was adopted. The shell capability shipped with an unscoped command allow-list,
which broke every packaged build until the Sprint 18 B1 fix. Everything else landed as planned.

---

## Sprint 15 — AI intelligence layer (Track B) ⭐ flagship — ✅ shipped in v1.3.0

**Goal:** Make "powered by Claude" mean something a raw-Playwright user can't get. Introduce an
**optional** Claude API client and three AI-backed capabilities.

**Design decision (scope reversal):** The server currently makes no external API calls. We add a
single, isolated `src/ai/` module that is the *only* place that talks to the Anthropic API, gated
behind `WEBMOBAI_ANTHROPIC_API_KEY`. If the key is absent, every AI tool returns a clean
"unavailable" response and nothing else changes. This keeps the offline/CI story intact while
unlocking the differentiator. All AI calls use **prompt caching** to control cost.

| # | Task | Files | Notes |
|---|---|---|---|
| 15.1 | **AI client module** — thin wrapper over `@anthropic-ai/sdk` with key detection, model config, prompt caching, and a hard "disabled" path | new `mcp-server/src/ai/client.ts`, `ai/config.ts` | Default model `claude-opus-4-7`; configurable. |
| 15.2 | **AI visual-diff narration** — when `visual_snapshot` finds a diff, send baseline + actual (or just the diff-bounded regions) to Claude and return a plain-English "what changed" summary | new `mcp-server/src/ai/visual-narrator.ts`, `tools/visual-tools.ts` | New tool `webmobai_explain_visual_diff` + auto-attach narration to diff results when AI is enabled. Closes the [FEATURES.md §3](./FEATURES.md) "out of scope" item. |
| 15.3 | **AI audit summary** — roll up a11y + perf + security + SEO findings into a prioritized, plain-English executive summary with suggested fixes | new `mcp-server/src/ai/audit-summarizer.ts`, new tool in `tools/reporting-tools.ts` | Feeds the report generator (15.5). |
| 15.4 | **NL → scenario** — extend scaffolding so Claude can turn "test the login flow with a bad password" into a Scenario JSON, grounded in the live page state | `mcp-server/src/scenario/scaffolder.ts`, `tools/scenario-tools.ts` | Complements existing page-inspection scaffolder. |
| 15.5 | **Surface AI output in the desktop report** — new "AI Summary" section + per-diff narration in the report | `src/components/TestReport.tsx`, `mcp-server/src/utils/report-generator.ts` | |

**New deps:** `@anthropic-ai/sdk` (mcp-server only).
**Risk:** Medium — external API, cost, and the scope reversal. Mitigated by opt-in gating + caching +
graceful degradation tests.
**Definition of done:** With a key set, a visual diff produces a readable narration and a full audit
produces an executive summary; with no key set, all 158+ existing tests still pass and AI tools return
a clean "set WEBMOBAI_ANTHROPIC_API_KEY to enable" message.

**As shipped (deviation):** the default model in 15.1 is now **`claude-opus-4-8`** (bumped from
`claude-opus-4-7` in v1.4.0). 15.4 shipped as a distinct tool, `webmobai_generate_scenario_from_prompt`
in `tools/ai-tools.ts`, alongside the untouched deterministic `webmobai_generate_scenario` scaffolder —
its zod schema does **not** cover the Sprint 18 auth verbs, so generated scenarios can never emit
`storageState` / `saveStorageState` / `pauseForManual`.

---

## Sprint 16 — New testing capabilities (Track C) — ✅ shipped in v1.3.0

**Goal:** Add the most-requested net-new testing features and close the known accuracy gaps from
[FEATURES.md §4](./FEATURES.md).

| # | Task | Files | Notes |
|---|---|---|---|
| 16.1 | **Lighthouse integration** — spawn `lighthouse --output=json --quiet` against the session URL and merge the official Performance/A11y/Best-Practices/SEO scores into the report | new `mcp-server/src/perf/lighthouse.ts`, `tools/perf-tools.ts` | Optional dep, lazy-spawned; Chromium-only. We *complement*, don't replace, our per-axis tools. |
| 16.2 | **PDF report export** — render the HTML report to PDF | `mcp-server/src/utils/report-generator.ts`, desktop "Export PDF" button | Reuse Playwright `page.pdf()` (already a dep) — no new lib. |
| 16.3 | **Visual baseline history** — versioned baselines with metadata (timestamp, commit, viewport) instead of silent overwrite | `mcp-server/src/visual/baseline-store.ts` | Schema upgrade; keep last N baselines, allow "promote/rollback". |
| 16.4 | **Perf accuracy fixes** — strict TTI (5s quiet window after FCP) as an opt-in mode; "load-CLS" snapshot captured at network-idle | `mcp-server/src/playwright/page-analyzer.ts` | Documented gaps in [FEATURES.md §4](./FEATURES.md). Keep fast mode as default. |
| 16.5 | **Protocol-relative link fix** — `getLinks` currently drops `//cdn.foo/x` | `mcp-server/src/tools/testing-tools.ts` | Low-effort correctness fix. |

**New deps:** `lighthouse` (optional / lazy).
**Risk:** Medium — Lighthouse is a heavy dep; keep it optional and spawn out-of-process.
**Definition of done:** A report can include an official Lighthouse score, export to PDF, and visual
baselines retain history; new perf modes covered by tests.

**As shipped (deviation):** 16.1 does **not** spawn the `lighthouse` CLI. It does a dynamic
`import("lighthouse")` in-process plus `chrome-launcher.launch()`, and lives in its own
`tools/lighthouse-tools.ts` group — deliberately kept out of `tools/perf-tools.ts` so the
`lighthouse` + `chrome-launcher` packages stay optional. 16.3 shipped without commit/viewport
metadata: archives are plain `<name>.v<unix-ms>.png` files, exposed by
`webmobai_visual_baseline_list_versions` / `_restore_version`. 16.2's PDF is emitted by
`webmobai-test` runs only.

---

## Sprint 17 — Monitoring & scheduling (Track C cont.) — ✅ shipped in v1.3.0

**Goal:** Turn WebMobAI from a one-shot tester into something that watches a site over time —
building directly on the existing `~/.webmobai/history.json` and regression detection.

| # | Task | Files | Notes |
|---|---|---|---|
| 17.1 | **Scheduled runs** — a `webmobai-monitor` CLI that runs a URL/suite on an interval and appends to history | new `mcp-server/src/monitor-cli.ts`, new bin entry | Cron-expression or simple interval. |
| 17.2 | **Trend dashboard** — new desktop "Monitors" tab charting Web Vitals + error counts over time from history | new `src/components/MonitorPanel.tsx`, `src/components/Sidebar.tsx` | Reuses `get_run_history`. Add a small chart lib (e.g. `recharts`). |
| 17.3 | **Regression alerts** — when a monitored run regresses past threshold, fire a desktop notification (and optional webhook) | `mcp-server/src/utils/run-history.ts`, Tauri notification plugin | Builds on existing `check_regressions`. |
| 17.4 | **Baseline-vs-current report mode** — a single report comparing today's run to the historical median | `mcp-server/src/utils/report-generator.ts` | |

**New deps:** `recharts` (frontend), Tauri `notification` plugin.
**Risk:** Medium — scheduling lifecycle and process management.
**Definition of done:** A user can schedule a recurring run, see trends charted in-app, and get
alerted on regression.

**As shipped (deviation):** **neither planned dependency was adopted.** 17.2's trends are four
inline-SVG sparklines plus error-count and a11y-count sparklines — no `recharts`. 17.3 fires an
in-app toast and an optional `--alert-webhook` POST instead of an OS notification — no Tauri
`notification` plugin. 17.1 shipped as a simple interval (`ms`/`s`/`m`/`h`), not cron expressions,
and monitors a **URL**, not a suite.

---

## Sprint 18 — Authenticated sessions & audit hardening — ✅ shipped in v1.4.0

**Goal:** Get past the login wall — the single biggest reason an audit or scenario could not reach
the pages that matter — and clear the correctness/packaging findings from the first full audit of
the codebase.

| # | Task | Files | Outcome |
|---|---|---|---|
| 18.1 | **storageState capture/replay** — `storage_state_path` on `webmobai_launch_browser`, new `webmobai_save_storage_state` tool | `mcp-server/src/tools/browser-tools.ts`, `playwright/browser-manager.ts` | Shipped. Tool 50 → **51**. `launch()` verifies the file exists up front and throws a directive error naming the three ways to create one. |
| 18.2 | **Scenario + suite surface** — `storageState` top-level field, `saveStorageState` step, `SuiteDefaults.storageState` | `scenario/types.ts`, `scenario/runner.ts`, `suite/types.ts`, `suite/loader.ts`, `suite/runner.ts` | Shipped. Step verbs 15 → **17**. |
| 18.3 | **`pauseForManual` step** — hold a headed run while a human completes MFA / CAPTCHA / SSO | `scenario/types.ts`, `scenario/runner.ts` | Shipped, but **inert in both CLIs** — see the honesty note below. |
| 18.4 | **CLI flags** — `--storage-state` (scenario, suite, doctor) and `--save-storage-state` (scenario) | `scenario-cli.ts`, `suite-cli.ts`, `doctor-cli.ts` | Shipped. Precedence differs between the two runners: the flag wins in `webmobai-scenario`, loses in `webmobai-suite` (`??=`). |
| 18.5 | **`webmobai-doctor`** — preflight for Node, Playwright engines, optional Lighthouse dep, AI key, storageState validity/expiry | new `mcp-server/src/doctor-cli.ts`, new bin entry | Shipped. Binaries 6 → **7**. Exit 0 on warnings, 1 on any hard error. |
| B1 | **Packaged desktop app was non-functional** — the Tauri shell capability had no command scope, so every Test / history / reveal / open action was rejected in a packaged build | `src-tauri/capabilities/default.json`, `src-tauri/tauri.conf.json` | Fixed with a validated allow-list for `node` / `cat` / `open` (not `args: true`), and `shell.open` widened to local `file://` paths. |
| B2 | **Clean-install browser launch** — only `webmobai-test` self-installed Playwright engines; the MCP server and other CLIs crashed with "Executable doesn't exist" | new `mcp-server/src/utils/ensure-browsers.ts`, `browser-manager.ts` | Fixed. First launch downloads the requested engine (~1–3 min, 10-minute timeout). |
| B3–B6 | **False-green reporting** | `scenario/runner.ts`, `suite-cli.ts`, `tools/assertion-tools.ts`, `utils/junit-generator.ts` | Fixed: non-success tool results are step failures; a tag filter matching zero of a non-empty suite exits 2 (`--allow-empty` opts out); `assert_url` with neither `contains` nor `pattern` is rejected instead of passing vacuously; JUnit XML strips ANSI escapes and XML-illegal control chars. |
| D | **Track D** — stale AI default model, drifted doc counts | `ai/config.ts`, README / FEATURES / USER_MANUAL / skills | `claude-opus-4-7` → `claude-opus-4-8`; count corrections. |

**New deps:** none.
**Risk:** Medium — session files are credential-equivalent, and B1/B2 touch packaging and first-run.
Mitigated by never echoing session paths or contents into responses or logs, gitignoring the
conventional filenames, and a `storage-state.test.ts` case that fails if a stored secret leaks into
a tool response.
**Definition of done:** a session captured once replays across MCP, scenario, suite, and CLI; a fresh
`npm install -g` works without a manual `playwright install`; a packaged `.dmg` can actually run a
test; `npm test` green at **214** tests.

**Honesty note — the one thing that did not land as designed:** `pauseForManual` only does anything
in a headed browser, and both shipped entry points (`webmobai-scenario`, `webmobai-suite`) hardcode
`headless: true` with no `--headed` flag. In headless it logs a warning, records the step as **pass**,
and continues immediately — so a CLI "capture" scenario that pauses for MFA and then calls
`saveStorageState` writes a pre-MFA, unauthenticated file and reports all green. The MCP flow
(headed launch → drive the form → human completes MFA between tool calls → `webmobai_save_storage_state`)
is the only reliable capture path today. See [FEATURES.md §2.23](./FEATURES.md).

---

## Track D — hardening / tech debt (folded into every sprint)

These ride along with the sprint they're cheapest to do in. All four are done:

- ✅ **Bound the error buffers** — `consoleErrors` / `networkErrors` arrays in `BrowserManager` grow
  unbounded; cap them with a ring buffer. *(Sprint 14.)*
- ✅ **Refactor `server.ts` dispatch** — ~11 copy-pasted "is the browser launched?" guards (~100 LOC).
  Shipped as a table-driven registry with a `requiresBrowser` flag per tool group; a new group must be
  added to that table or it is never routed. *(Sprint 15.)*
- ✅ **Write `docs/SCENARIO_FORMAT.md`** — referenced by `scenario-cli.ts` output. Written in Sprint 16.
- ✅ **Idle session timeout** — optional `idleTimeoutMs` on `launch()`, reset by the dispatcher after
  every successful tool call. Default disabled. *(Sprint 17.)*

---

## Sequencing & sizing summary

| Sprint | Theme | Risk | Headline deliverable | Status |
|---|---|---|---|---|
| 14 | Desktop polish & persistence | Low | No stubbed buttons; app remembers you | ✅ v1.3.0 |
| 15 | AI intelligence layer ⭐ | Medium | Claude-narrated visual diffs + audit summaries | ✅ v1.3.0 |
| 16 | New testing capabilities | Medium | Lighthouse scores, PDF export, baseline history | ✅ v1.3.0 |
| 17 | Monitoring & scheduling | Medium | Scheduled runs + in-app trend dashboard | ✅ v1.3.0 |
| 18 | Authenticated sessions & audit hardening | Medium | Capture a login once, replay it everywhere; `webmobai-doctor` | ✅ v1.4.0 |

Across the five sprints: MCP tools **44 → 51** (+3 in Sprint 15, +3 in Sprint 16, none in
Sprint 17, +1 in Sprint 18), binaries **5 → 7**, tests **158 → 214**.
Claude Code skills now number **20**.

**Out of scope (unchanged from [FEATURES.md §3](./FEATURES.md)):** hosted cloud execution,
native mobile testing, load/stress testing, API contract testing, credential vaulting. Distribution
(Windows/Linux builds, signing) is still deprioritized — releases remain macOS-only and unsigned.

---

## What's next

No sprint is planned and no dates are committed. This is the open-item list, taken straight from
[FEATURES.md §4](./FEATURES.md), ordered by how much pain each one causes today. Anything picked up
from here should follow the guiding principles above.

**Finish what Sprint 18 started (authenticated sessions):**

1. **Make `pauseForManual` real, or retire it from the CLI story.** Add `--headed` to
   `webmobai-scenario` so the documented capture scenario works, and ideally replace the blind
   `page.waitForTimeout` with something that detects completion (a URL/selector condition) rather
   than always burning the full window and capping at 300 s.
2. **Detect a stale session at launch, not three steps later.** Today `launch()` only checks that
   the file exists; an expired session shows up as an ordinary `assertVisible` timeout. A cheap win:
   run the `webmobai-doctor` expiry heuristic inside `launch()` and warn, and add a distinct
   "redirected to a login page" diagnostic to the failure-triage bundle.
3. **Normalize storageState path resolution.** `webmobai-doctor` resolves against cwd; the browser
   manager, `webmobai-scenario`, and the suite loader do not — and the suite loader resolves scenario
   paths relative to the suite file but not `storageState`. Pick one rule (suite-file-relative for
   suite runs) and apply it everywhere.
4. **Teach scenario generation the auth verbs.** The AI generator's step vocabulary and zod schema
   both omit `storageState`, `saveStorageState`, and `pauseForManual`, and the deterministic
   scaffolder never emits them, so every generated scenario needs hand-editing to run authenticated.
5. **Close the Sprint 18 test gaps** — the `SuiteDefaults.storageState` cascade, both CLI flags, the
   `saveStorageState` step, headed `pauseForManual`, and the doctor's expired-cookie `warn` branch
   are all untested (FEATURES.md §2.20).
6. **Harden the session file** — `chmod 0600` on write, create missing parent directories, and widen
   the `.gitignore` patterns (a session saved as `state.json` or `.auth/creds.json` matches none of
   the three current patterns). Consider warning that `trace.zip` and video capture the authenticated
   session unredacted.

**CI ergonomics:**

7. **Collect per-scenario artifacts into `--out`.** Only the three aggregate files land there;
   traces and screenshots stay in `$TMPDIR` and CI has to read `sessionDir` out of `suite-<ts>.json`
   to archive them.
8. **Cross-shard aggregation.** Each `--shard` writes its own report with no merge step.

**Longer-standing:**

9. **WebKit-specific path coverage** — WebKit-skipped tests run in CI only.
10. **Signed and notarized macOS releases**, and a decision on whether Windows/Linux desktop builds
    are ever in scope (`bundle.targets` says `"all"`; only macOS is actually built).
