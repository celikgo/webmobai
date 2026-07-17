# Changelog

All notable changes to WebMobAI will be documented in this file.

## [Unreleased]

Sprint 18 — get past the login wall, plus correctness hardening from the first full audit.

- **MCP tools:** 50 → **51** (added `webmobai_save_storage_state`)
- **CLI binaries:** 6 → **7** (added `webmobai-doctor`, a preflight environment check)
- **Tests:** 200 → **214** (+14, covering the fixes and new features)

### Added
- **Authenticated sessions (storageState).** Launch already logged-in by loading a saved Playwright storageState:
  `storage_state_path` on `webmobai_launch_browser`, the new `webmobai_save_storage_state` tool, a `storageState`
  field + `saveStorageState` scenario step, `SuiteDefaults.storageState`, and `--storage-state` /
  `--save-storage-state` CLI flags. Session files are treated as secrets — never echoed into responses/logs, and
  gitignored by default.
- **`pauseForManual` scenario step** — in headed mode, waits for a human to complete MFA/CAPTCHA/SSO, then continues
  (typically before a `saveStorageState`); a clear no-op in headless.
- **`webmobai-doctor`** — preflight check for Node version, Playwright browser install (with the exact
  `npx playwright install` command), the optional Lighthouse dependency, the AI API key, and a storageState file's
  validity/expiry.

### Fixed
- **False-green reporting (audit B3–B6).** The scenario runner now treats any non-success tool result as a step
  failure (a failed `route` install or a `visualSnapshot` capture error no longer passes); `webmobai-suite` exits
  non-zero when a tag filter matches zero scenarios (`--allow-empty` to opt out); `assert_url` with no matcher is
  rejected instead of vacuously passing; JUnit XML strips XML-illegal control chars so one bad byte can't corrupt the
  whole file.
- **Stale AI default model** bumped `claude-opus-4-7` → `claude-opus-4-8`; corrected the prompt-cache comment.
- **Documentation counts** corrected across README/FEATURES/USER_MANUAL/skills (tool and binary counts were drifted).

## [1.3.0] - 2026-05-28

Four sprints (14–17) covering desktop polish, an opt-in Claude API layer,
Lighthouse + PDF + baseline-history, and a monitoring/scheduling story.

- **MCP tools:** 43 → **49** (+6)
- **CLI binaries:** 5 → **6** (added `webmobai-monitor`)
- **Tests:** 158 → **200** (+42)
- **No breaking changes** to existing scenarios, suites, or MCP tool surfaces.

The four sections below preserve the per-sprint breakdown for navigation.

### Sprint 17 — Monitoring & scheduling

Turns WebMobAI from a one-shot tester into something that watches a site over
time. Builds entirely on the existing `~/.webmobai/history.json` substrate
and the existing `detectRegressions` helper — no new on-disk schema, no new
Tauri plugins.

### Added — `webmobai-monitor` CLI (new binary, total 5 → 6)
- `webmobai-monitor <url> [config-json] [flags]` runs the autonomous
  auto-test on a recurring interval, appending each run to history.
- Flags: `--interval=<duration>` (e.g. `30s` / `5m` / `1h`, default 5 m),
  `--once` (single iteration; useful for smoke tests), `--alert-webhook=<url>`
  (POST a JSON regression bundle when this run is worse than the historical
  median), `--config=<json>`.
- Reuses the existing `auto-test.ts` runner via `child_process.spawn` — no
  refactor of the one-shot script needed. Stdout is inherited so each run's
  output streams through.
- Stops cleanly on `SIGINT` / `SIGTERM` between iterations.

### Added — Monitors desktop tab
- New sidebar tab (⌘7), reads `~/.webmobai/history.json` via the already-
  granted `shell:allow-execute` (`cat <home>/.webmobai/history.json`). No new
  Tauri permission needed.
- URL picker (default: most-recently-run URL).
- Four small inline-SVG sparklines (no chart library): LCP, FCP, CLS, TTFB,
  plus console-error and a11y-issue counts. Each shows min / current / max.
- Run table (last 30 runs of the selected URL) with pass-rate badge and
  duration.
- "Refresh" button re-reads the file.

### Added — historical comparison in the report
- `auto-test.ts` now calls `detectRegressions` against the history after
  every run and embeds the result in `TestReportData.historicalComparison`
  whenever 2+ prior runs of this URL exist.
- HTML report renders a "vs historical baseline" table with delta % and a
  colored severity tag per metric.
- Desktop **Test Report** panel mirrors the same comparison with a new
  `HistoricalComparison` component. On mount, if real regressions are
  present, fires a single destructive toast — lightweight alerting without
  pulling in the Tauri notification plugin.

### Changed — hardening (Track D fold-in)
- **Idle session timeout** in `BrowserManager`: optional `idleTimeoutMs`
  closes the browser after that much inactivity. `bumpIdleTimer()` resets
  the countdown; the MCP dispatcher calls it after every successful tool
  call, so long-lived MCP sessions don't keep pages alive forever.
- `webmobai_launch_browser` exposes `idle_timeout_ms` in its tool schema.

### Tests
- Tests: 186 → **200** (+14 in `mcp-server/test/sprint17.test.ts`:
  `parseInterval` accepts ms/s/m/h + decimals, rejects malformed input;
  `parseArgs` requires a URL, supports `--flag=value` and `--flag value`,
  positional config JSON, default 5 m / `--once` off; `runMonitorLoop` with
  `--once` runs exactly once, stops between iterations when `isStopping`
  flips; `BrowserManager.setIdleTimeout` clears properly and clamps
  non-positive values to disabled).

### Sprint 16 — New testing capabilities

Adds the four most-requested net-new testing features and closes the known
accuracy gaps documented in FEATURES.md §4.

### Added — Lighthouse integration
- **`webmobai_lighthouse_audit`** — runs the upstream Google Lighthouse engine
  via a lazy dynamic import of `lighthouse` + `chrome-launcher` (both
  **optionalDependencies**). Returns the four official category scores
  (Performance / Accessibility / Best Practices / SEO) plus the eight
  lowest-scoring audits ranked worst first. New `src/perf/lighthouse.ts` +
  `src/tools/lighthouse-tools.ts`. If the optional deps aren't installed, the
  tool returns a clean `LighthouseUnavailableError` with install instructions
  instead of crashing.
- Lighthouse drives its own headless Chrome via `chrome-launcher`, so the
  caller's `BrowserManager` session is untouched.

### Added — PDF report export
- `generatePdfReport(htmlPath, outDir)` renders the HTML report to PDF via
  Playwright's `page.pdf()` in an isolated headless Chromium. No new library
  — Playwright was already a runtime dep.
- The auto-test runner now emits the PDF alongside the HTML at the end of
  every run. Failures are non-fatal (the HTML is still the source of truth).
- `TestReportData` gains `reportPath` and `pdfPath`; the desktop **Test
  Report** panel renders "Open HTML" and "Open PDF" buttons (opened via the
  already-granted `shell:allow-open`).

### Added — Visual baseline history
- `BaselineStore` now **archives the previous baseline** to
  `<name>.v<unix-ms>.png` whenever a new one is written (first writes have
  nothing to archive). Up to `maxVersions` (default 5) archives are kept per
  snapshot; the oldest are pruned.
- New methods: `listVersions(name)`, `restoreVersion(name, timestamp)`,
  `versionPathFor(name, ts)`.
- Two new MCP tools: **`webmobai_visual_baseline_list_versions`** and
  **`webmobai_visual_baseline_restore_version`**. Neither requires a browser
  — they operate on disk.
- `webmobai_visual_snapshot` with `update_baseline: true` now preserves the
  previous baseline instead of silently overwriting it.

### Added — performance accuracy fixes
- **`clsAtLoad`** — cumulative layout shift frozen 3 s after the `load` event
  (new `BrowserManager` init script). The running `cls` field is unchanged
  but now sits next to a more faithful "did the page jump while loading?"
  number that doesn't keep climbing across session-long shifts. Closes the
  CLS-window gap in FEATURES.md §4.
- **`ttiStrict`** — opt-in strict TTI mode. `getPerformanceMetrics({
  strictTti: true })` waits for an actual 5-second long-task quiet window
  after FCP (Lighthouse's strict definition) before returning, up to 15 s
  total. The MCP tool gains a `strict_tti: boolean` argument. Default fast
  mode is unchanged so existing callers keep their snappy behavior.

### Fixed
- **Protocol-relative links** — `PageAnalyzer.getLinks` previously dropped
  `<a href="//cdn.foo/x">` when the document was loaded via `file://`
  (because the browser resolves `.href` to `file://cdn.foo/x`). Now detects
  the raw `//` form via `getAttribute` and synthesizes an `https://` URL,
  matching real-page behavior for local fixtures and previews. Documented
  fix from FEATURES.md §4.

### Added — documentation (Track D fold-in)
- **`docs/SCENARIO_FORMAT.md`** — the scenario-format reference doc that
  `webmobai-scenario` already pointed users at, but didn't exist.
  Covers every step verb, the top-level shape, the suite format,
  scenario-generation workflows, and a complete worked example.

### Tests
- Tests: 177 → 186 (+9 in `mcp-server/test/sprint16.test.ts`: baseline
  versioning incl. archive-on-overwrite / pruning / nested names / restore /
  unknown-timestamp rejection, plus Lighthouse error class + markdown
  formatter).

### Tools
- MCP tool count: 46 → **49** (+`webmobai_lighthouse_audit`,
  `_visual_baseline_list_versions`, `_visual_baseline_restore_version`).

### Sprint 15 — AI intelligence layer ⭐

Introduces an **opt-in** Claude API layer. All AI features are gated behind
`WEBMOBAI_ANTHROPIC_API_KEY`; when no key is present every existing tool keeps
working unchanged and the new AI tools return a clean "set the key" message.
This is a deliberate reversal of the "no external API calls from the server"
stance previously documented in FEATURES.md §3.

### Added — AI module (`mcp-server/src/ai/`)
- **AI client** (`ai/client.ts`) — thin wrapper over `@anthropic-ai/sdk` with
  key gating, lazy memoization, and **prompt caching** (`cache_control:
  ephemeral` on every system prompt). Returns a typed `CompleteResult` with
  usage stats including cache-hit counters.
- **Config** (`ai/config.ts`) — reads `WEBMOBAI_ANTHROPIC_API_KEY`,
  `WEBMOBAI_AI_MODEL` (default `claude-opus-4-7`), and `WEBMOBAI_AI_MAX_TOKENS`
  (default 2048).
- **Visual-diff narrator** (`ai/visual-narrator.ts`) — sends baseline + actual
  (+ optional diff mask) PNGs to Claude and returns a plain-English 2–6 bullet
  description of what visibly changed, plus a severity tag (cosmetic /
  content / structural). Closes the FEATURES.md §3 "out of scope" item.
- **Audit summarizer** (`ai/audit-summarizer.ts`) — rolls accumulated a11y,
  perf, console errors, and test results into a prioritized markdown summary
  (Headline / Top fixes / What's working) under 350 words.
- **NL → scenario generator** (`ai/scenario-generator.ts`) — converts a
  natural-language description plus a snapshot of the current page state into
  a validated Scenario JSON document. Output is zod-validated before return;
  malformed model output throws loudly instead of producing a broken scenario.

### Added — MCP tools (3 new, total 43 → 46)
- `webmobai_explain_visual_diff` — narration of a visual-regression diff.
  Operates on file paths; no browser required.
- `webmobai_summarize_audit` — executive summary of the current session.
  Browser must be launched (for a fresh axe-core + Web Vitals snapshot).
- `webmobai_generate_scenario_from_prompt` — generate a Scenario JSON from a
  natural-language description grounded in the current live page.

### Added — desktop integration
- **Auto-test integration**: when `WEBMOBAI_ANTHROPIC_API_KEY` is set during
  an autonomous run, the runner asks Claude for an executive summary at the
  end and embeds it in `TestReportData.aiSummary`. Failures in the AI call
  emit a soft warning action and never abort the run.
- **HTML report**: new "Claude summary" section rendered with a tiny safe
  markdown subset (## / -, **, *) and a purple accent.
- **Desktop "Test Report" panel**: matching `AiSummary` React component
  rendered above the test results when present.

### Changed — hardening (Track D fold-in)
- `server.ts` dispatcher refactored from ~11 copy-pasted "is browser
  launched?" guards into a single table-driven router (`ToolGroup[]` +
  `requiresBrowser`). The cleanup saves ~100 lines and makes adding new tool
  groups a one-line change.

### Tests
- Tests: 160 → 177 (+17 AI tests covering config gating, disabled path on all
  three new tools, Scenario JSON validation incl. code-fence stripping and
  unknown-step rejection, and the markdown renderer incl. HTML escaping for
  injection safety).

### Sprint 14 — Desktop polish & persistence

Closes the visible rough edges in the desktop app and makes the app remember
the user across restarts. UI-only / tooling — the engine is unchanged.

### Added
- **State persistence** — settings (theme, MCP port, screenshot dir, video,
  always-on-top, auto-start) and the Configuration-panel values now persist to
  `localStorage` via Zustand `persist` middleware and survive an app relaunch.
- **Fullscreen screenshot preview** — clicking a thumbnail opens a lightbox
  with `←` / `→` keyboard navigation and a position indicator. New
  `src/components/ui/dialog.tsx` (Radix Dialog wrapper).
- **Toast notifications** — Radix Toast wired through a small store; fires on
  test complete / failed, copy-to-clipboard success, and screenshot errors.
  New `src/components/ui/toast.tsx`, `src/components/Toaster.tsx`,
  `src/stores/useToastStore.ts`.
- **Keyboard shortcuts** — `⌘↵` / `Ctrl+Enter` runs a test, `⌘.` / `Ctrl+.`
  stops a run, `⌘1`…`⌘7` switch sidebar tabs (skipping when typing in inputs).
- **Clickable WCAG references** in the Accessibility panel — each finding now
  has a "Learn more" link that opens the rule's `helpUrl` in the OS default
  browser via the shell plugin.
- **Copy-selector buttons** on every accessibility node (clipboard + toast).
- **Action Log filter + export** — status chips (All / Running / Success /
  Errors), full-text filter, and a "Copy" button that copies the filtered log
  as JSON. Auto-scroll suspends when filters are active.
- **Screenshot Open / Reveal in Finder** — the previously-stubbed hover
  buttons now use the already-granted `shell:allow-open` and
  `shell:allow-execute` to open the screenshot in the OS default viewer or
  highlight it in Finder via `open -R`. No new Tauri plugins required.

### Changed — hardening
- **Bounded error buffers** — `BrowserManager.consoleErrors` and
  `.networkErrors` are now capped at 500 entries via a ring-buffer push helper
  (`pushBounded`), preventing unbounded growth on long crawls or monitoring
  sessions. Tests added.

### Removed
- Dead `wsConnected` / `setWsConnected` from the session store — the WS
  streaming path was never implemented (v1.1.0 moved to stdout JSON), so the
  unused field is now gone.

### Tests
- Tests: 158 → 160 (added bounded-buffer coverage in
  `mcp-server/test/browser-manager.test.ts`).

## [1.2.0] - 2026-05-12

The big one: thirteen sprints of additions that move the project from
"autonomous exploratory auditor" to "AI-leveraged end-to-end testing
framework with an auditor front." Tool count: 25 → 43. Binaries: 2 → 5.
Tests: 0 → 158, all green on Chromium / Firefox / WebKit in CI.

### Added — new binaries
- `webmobai-scenario <file>` — run a scripted JSON scenario, emit HTML +
  JUnit + Playwright trace
- `webmobai-suite <file>` — run a collection of scenarios with
  parallelism (`--workers N`), sharding (`--shard k/n`), and tag
  filters (`--tag T`, `--exclude-tag T`)
- `webmobai-codegen <url>` — interactive recording in a headed browser
  that emits a starter Scenario JSON. Passwords redacted.

### Added — real E2E primitives
- **Assertions** (5 tools): `webmobai_assert_visible`, `_hidden`,
  `_text`, `_url`, `_count` with auto-wait (100ms poll, default 5s
  timeout). Failure responses include the self-healing diagnostic +
  failure-triage bundle.
- **Request interception**: `webmobai_route` (fulfill / abort /
  continue with glob patterns) and `webmobai_unroute`.
- **Multi-browser**: `webmobai_launch_browser` accepts `browser`
  (chromium / firefox / webkit) and `device` (Playwright device
  preset name) for proper mobile emulation with touch + DPR.
- **Playwright traces**: auto-captured per session to `trace.zip`.
  Drop into https://trace.playwright.dev for time-travel debugging.
- **JUnit XML** output alongside HTML for CI integration.

### Added — AI-leveraged features
- **Self-healing selectors**: failed selector ops return the prior
  element fingerprint, ranked candidate replacements (testid match
  weighted heaviest), and suggested replacement selectors.
- **Failure triage bundles**: every assertion FAIL response includes
  current URL, last 5 console errors, last 5 network errors, and a
  fresh screenshot path.
- **Run history**: persisted to `~/.webmobai/history.json`
  (200-entry cap). New tools `webmobai_get_run_history` and
  `webmobai_check_regressions` (median-based, configurable threshold,
  same-URL scoped).
- **Scenarios & scaffolding**: JSON scenario format with 13 step verbs.
  `webmobai_generate_scenario` MCP tool inspects the current page
  and emits a starter scenario JSON.

### Added — pixel-perfect visual regression
- `webmobai_visual_snapshot` MCP tool + `visualSnapshot` scenario step.
  Backed by `pixelmatch` + `pngjs` (same engine as Playwright's
  `toHaveScreenshot()`). First call creates baseline; subsequent calls
  diff and write `.actual.png` + `.diff.png` next to the baseline on
  mismatch. Tolerance: `threshold`, `max_diff_pixels`,
  `max_diff_pixel_ratio` (default 1%).

### Added — performance upgrades
- **INP** (Interaction to Next Paint — replaced FID in Core Web Vitals
  March 2024) via PerformanceObserver `type: "event"`.
- **LCP element fingerprint**: tag, src, text, size of the LCP node.
- **Network throttling**: `webmobai_set_network_throttle` with
  `slow-3g`, `fast-3g`, `slow-4g`, `offline` presets matching Chrome
  DevTools.
- **CPU throttling**: `webmobai_set_cpu_throttle` (4x = Lighthouse
  mobile profile).
- **Multi-run statistics**: `webmobai_run_perf_multi` runs N
  measurements (1-10), returns median + p95 + min + max per metric.
  Median, not mean, so outliers don't poison the baseline.

### Added — audit tools
- `webmobai_security_audit` — CSP analysis (missing, weak,
  unsafe-inline/eval), mixed-content detection, cookie attribute audit
  (Secure / HttpOnly / SameSite, with the special-case SameSite=None
  without Secure).
- `webmobai_seo_audit` — title + meta-description length, canonical,
  OpenGraph + Twitter card, H1 count, viewport meta, JSON-LD parse
  validity, robots.txt + sitemap.xml presence.
- `webmobai_check_broken_links` — same-origin HEAD-test capped at 50
  links, reports 4xx/5xx.
- `webmobai_pwa_audit` — manifest fields, service worker registration,
  optional offline-fallback test.

### Added — debugging
- `webmobai_describe_selector` — inspect what a selector matches with
  zero-match hints (tells you "no element with id=foo exists" when the
  selector references a missing id).
- Playwright trace files for every session.

### Added — accessibility upgrades
- **axe-core integration** via `@axe-core/playwright` as the primary
  a11y engine. The hand-rolled rules from v1 remain as a supplementary
  fast path with dedup against axe.
- **Real accessibility tree** via CDP `Accessibility.getFullAXTree`
  with ignored pass-through nodes collapsed. The previous DOM-walk-
  with-innerText approach is gone.

### Added — test infrastructure
- **Vitest** test framework wired up in `mcp-server/`.
- 158 tests across 20 test files covering the page analyzer, browser
  manager, assertions, routing, multi-browser, traces, self-healing,
  visual diff, run history, scenarios + suites, perf, security, SEO,
  PWA, debug tools. CI installs Chromium + Firefox + WebKit and runs
  the full suite on every push/PR.

### Added — documentation
- [USER_MANUAL.md](USER_MANUAL.md) — install, all five CLIs, scenario
  + suite formats with examples, full MCP tool reference, CI
  integration recipes, troubleshooting.
- [FEATURES.md](FEATURES.md) — current shipped state, version history,
  remaining roadmap items.
- `.claude/skills/` — 8 named Claude Code skills for AI-driven
  workflows.

### Fixed
- Skip-link rule: previously only checked the first `<a>` on the page
  and counted any same-page anchor as a skip link. Now requires
  text-content match OR top-3 focusable position, AND target id must
  exist.
- "color-contrast" mislabel: the previous rule actually checked font
  size, not contrast. Renamed to "small-text", impact lowered to
  minor, helpUrl points to WCAG 1.4.4 (Resize Text).
- Accessibility tree: was a DOM walk that double-counted innerText in
  ancestors. Now pulled from Chrome's real a11y tree.
- Network errors: `PageAnalyzer.checkForErrors()` returned a hardcoded
  empty array. Now wired through to BrowserManager's
  `page.on('requestfailed')` and `page.on('response')` (4xx/5xx)
  listeners.
- TTI: was hardcoded `null`. Now computed via long-task observer with
  fallback to DOM-content-loaded or FCP.
- SessionConfig: credentials, maxPages, viewport, breakpoints, and
  feature toggles from the desktop app's Configuration panel are now
  honored by the auto-test runner. Previously all were ignored.
- Screenshots render in the desktop app: image src goes through
  `convertFileSrc` + Tauri asset protocol scoped to `$TEMP/webmobai-*`.
- Desktop app portability: previously hardcoded `/Users/celikgo/...`
  path that broke the .dmg for every other user. Now resolved via
  Tauri `resolveResource`.

## [1.1.0] - 2026-04-12

### Added
- **Standalone auto-test mode** — click "Test" in the desktop app to run a full automated audit without needing Claude
- Auto-test runner (`webmobai-test <url>`) bundled as a CLI
- Real-time streaming of test progress to the desktop app UI
- Auto-crawl: explores up to 3 internal links per test
- New brain logo (replaces plain purple square)

### Changed
- Desktop app "Test" button now spawns the auto-test runner directly via Tauri shell
- Removed WebSocket dependency in favor of stdout JSON streaming
- Removed postinstall playwright auto-install to prevent MCP connection hangs
- Updated README to lead with standalone desktop app mode

### Fixed
- Shell plugin config error on Tauri app startup

## [1.0.0] - 2026-04-12

### Added
- Initial release
- 25 MCP tools for autonomous web testing
- Isolated Chromium browser via Playwright (headed mode)
- Browser control: navigate, click, type, scroll, screenshot, viewport resize
- Page analysis: DOM summary, interactive elements, links, console errors
- Accessibility auditing: alt text, form labels, ARIA, landmarks, skip links
- Performance metrics: LCP, FCP, CLS, TTI, TTFB
- Responsive testing at configurable breakpoints
- HTML test report generation
- Video recording of test sessions
- Tauri 2.0 desktop app with React frontend
- Real-time action log
- Screenshot gallery
- Dark/Light theme support
- Session configuration panel
- npm package for standalone MCP server usage
