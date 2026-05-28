# Roadmap

This document plans the next wave of WebMobAI development: **Sprints 14–17**. It continues
the sprint convention from [FEATURES.md §5](./FEATURES.md) (the codebase is currently at the
end of Sprint 13, v1.2.0).

The work is organized into three tracks the team prioritized:

- **Track A — Desktop app polish & UX** (close the visible rough edges)
- **Track B — AI intelligence layer** (lean into the Claude differentiator)
- **Track C — New testing capabilities** (Lighthouse, monitoring, PDF, baseline history)

A cross-cutting **Track D — hardening / tech debt** runs alongside and is folded into each sprint.

---

## Guiding principles

1. **Don't regress the green test surface.** Every sprint ends with `npm test` green on
   Chromium + Firefox + WebKit, and new behavior ships with tests (the project has 158 today).
2. **AI is opt-in, never required.** All Claude-API features degrade gracefully to "feature
   unavailable, set `WEBMOBAI_ANTHROPIC_API_KEY`" — the tool surface stays fully usable without it.
   This is a deliberate reversal of the current "no external API calls from the server" stance in
   [FEATURES.md §3](./FEATURES.md); see Sprint 15 for the rationale.
3. **Keep the three consumer paths in sync.** A capability that makes sense in the MCP tools
   should also surface in the desktop app and (where relevant) the CLIs.
4. **Update the docs in the same PR.** `FEATURES.md`, `CHANGELOG.md`, and `USER_MANUAL.md`
   move with the code.

---

## Sprint 14 — Desktop polish & persistence (Track A + D)

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

---

## Sprint 15 — AI intelligence layer (Track B) ⭐ flagship

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

---

## Sprint 16 — New testing capabilities (Track C)

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

---

## Sprint 17 — Monitoring & scheduling (Track C cont.)

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

---

## Track D — hardening / tech debt (folded into every sprint)

These ride along with the sprint they're cheapest to do in:

- **Bound the error buffers** — `consoleErrors` / `networkErrors` arrays in `BrowserManager` grow
  unbounded; cap them with a ring buffer. *(Sprint 14 — touch the engine least-disruptively here.)*
- **Refactor `server.ts` dispatch** — ~11 copy-pasted "is the browser launched?" guards (~100 LOC).
  Extract a `requireBrowser()` helper. *(Sprint 15, alongside adding new tools.)*
- **Write `docs/SCENARIO_FORMAT.md`** — referenced by `scenario-cli.ts` output but doesn't exist.
  *(Sprint 16, with the other doc updates.)*
- **Idle session timeout** — `BrowserManager` keeps pages alive indefinitely; add an idle close.
  *(Sprint 17, alongside scheduling.)*

---

## Sequencing & sizing summary

| Sprint | Theme | Risk | Headline deliverable |
|---|---|---|---|
| 14 | Desktop polish & persistence | Low | No stubbed buttons; app remembers you |
| 15 | AI intelligence layer ⭐ | Medium | Claude-narrated visual diffs + audit summaries |
| 16 | New testing capabilities | Medium | Lighthouse scores, PDF export, baseline history |
| 17 | Monitoring & scheduling | Medium | Scheduled runs + in-app trend dashboard |

**Recommended start:** Sprint 14 — it's low-risk, immediately visible, and warms up the desktop
codebase before the heavier AI and capability work. Sprint 15 is the flagship that most directly
answers the "it's just Playwright" feedback.

**Out of scope (unchanged from [FEATURES.md §3](./FEATURES.md)):** hosted cloud execution,
native mobile testing, load/stress testing, API contract testing. Distribution (Windows/Linux
builds, signing) was deprioritized for this wave and can be a later sprint.
