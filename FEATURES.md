# Features

WebMobAI is an **AI-leveraged end-to-end web testing framework** with an autonomous-auditor front. It opens a real browser (Chromium, Firefox, or WebKit), drives it through scenarios you author or AI-generate, and produces reports the way a CI system expects them. You can use it as a script-free auditor (point and click), as a YAML/JSON-driven test runner (scenario + suite), or as an MCP tool surface that AI agents call directly.

This file is the contract: **what's shipped today**, **what's intentionally out of scope**, and **what's left on the roadmap**. The "Should include" gap analysis from the original v1.1.0 audit is now largely closed — see §5 for the version history.

---

## 1. Positioning

Three consumer paths share one engine:

1. **Standalone desktop app** — user enters a URL, clicks Test, watches results stream in. Powered by the `webmobai-test` CLI.
2. **AI-driven via MCP** — Claude (or any MCP-compatible agent) calls **51 MCP tools** to explore, interact, audit, assert, mock, and report.
3. **Script-driven** — Author JSON scenarios and suites; run them with `webmobai-scenario`, `webmobai-suite`, or record them interactively with `webmobai-codegen`.

The shared engine is built on **Playwright** (Chromium / Firefox / WebKit) wrapped by a thin TypeScript server (`mcp-server/`). Raw browser driving is not the differentiator — Playwright does that. What WebMobAI adds on top is:

1. **Self-healing failure diagnostics.** Every selector failure returns a structured bundle — prior element fingerprint, up to 5 ranked candidate replacements, page-state triage (URL, recent console/network errors, screenshot) — so an AI client can retry with a better selector instead of stalling (§2.4).
2. **An audit surface, not just an action surface.** Accessibility (axe-core), Web Vitals, security hygiene, SEO, PWA, Lighthouse, visual regression and run-over-run regression detection are first-class tools that emit one HTML + JUnit report (§2.7–§2.15).
3. **Packaged Claude Code skills.** 20 named workflows in `.claude/skills/` that teach an agent which tools to chain for a given QA job (§2.18).
4. **Authenticated replay.** A logged-in session is captured once and replayed by every later run, so audits reach past the login wall (§2.23).

The Claude API layer (§2.21) is strictly **opt-in** — with no key set, every tool except the three AI tools behaves identically.

**Distributed as seven CLI binaries** (npm package `webmobai-mcp`):

| Binary | What it does |
|---|---|
| `webmobai-mcp` | MCP server (stdio) — exposes all 51 tools to Claude Desktop, Claude Code, etc. |
| `webmobai-test <url>` | Standalone auto-test — explores a URL and produces a full audit report |
| `webmobai-scenario <file>` | Run a single JSON scenario, emit HTML + JUnit + trace.zip |
| `webmobai-suite <file>` | Run a collection of scenarios with parallelism, sharding, tag filters |
| `webmobai-codegen <url>` | Record a session interactively, emit a starter Scenario JSON |
| `webmobai-monitor <url>` | Sprint 17. Run `webmobai-test` on a recurring interval; optional `--alert-webhook` POSTs regression bundles. |
| `webmobai-doctor` | Sprint 18. Preflight environment check — Node version, Playwright engines, optional Lighthouse dep, AI key, and (with `--storage-state`) a saved session's validity/expiry. |

---

## 2. Shipped capabilities

### 2.1 Browser automation

| Capability | Tool / API | Notes |
|---|---|---|
| Launch isolated browser (Chromium / Firefox / WebKit) | `webmobai_launch_browser` | Headed by default; `headless`, `browser`, `device` (Playwright preset like "iPhone 13" / "Pixel 5") all supported. First Chromium run downloads it (~170MB) on demand. |
| Mobile device emulation | `webmobai_launch_browser` (`device: …`) | Real touch events, mobile UA, devicePixelRatio. Device viewport overrides explicit viewport. |
| Navigation | `webmobai_navigate` | `domcontentloaded` + `networkidle` with soft-fail on long-polling sites. 30s timeout. |
| Click, type, hover, select, press, scroll | `webmobai_click` / `webmobai_type` / etc. | Click and type record selector snapshots for self-healing (§2.4). |
| Screenshot (viewport or full-page) | `webmobai_screenshot` | Written to `<sessionDir>/screenshots/`. |
| Viewport resize | `webmobai_set_viewport` | |
| Wait for selector / URL / timeout | `webmobai_wait_for` | |
| Run arbitrary JS in page context | `webmobai_evaluate` | Returns serializable values. |
| Go back in history | `webmobai_go_back` | |
| Close browser | `webmobai_close_browser` | Saves video + Playwright trace. |
| Session video recording | `record_video` on `webmobai_launch_browser` (default **true**); `enableVideo` on `webmobai-test` (default **true**) | Forced **off** by `webmobai-scenario` and `webmobai-suite`, which both pass `recordVideo: false`. |

### 2.2 Page analysis

| Capability | Tool / API | Notes |
|---|---|---|
| DOM structure summary | `webmobai_get_page_state` | Markdown digest of headings, links, forms, buttons, images. |
| List interactive elements with selectors | `webmobai_get_interactive_elements` | Hidden 0×0 elements filtered. |
| Enumerate links | `webmobai_get_links` | Internal/external split. |
| Detect broken images + console + network errors | `webmobai_check_errors` | Network failures (4xx/5xx + DNS/aborts) tracked via `page.on('requestfailed')` and `page.on('response')`. |
| Console errors + warnings stream | `webmobai_get_console_errors` | Captured via `page.on('console')` + `page.on('pageerror')`. |

### 2.3 Assertions (real E2E)

| Capability | Tool | Notes |
|---|---|---|
| Element is visible | `webmobai_assert_visible` | Auto-waits up to timeout (default 5s); 100ms poll. |
| Element is hidden / absent | `webmobai_assert_hidden` | |
| Element contains expected text | `webmobai_assert_text` | Substring or exact-match. |
| URL matches substring or regex | `webmobai_assert_url` | |
| Element count matches | `webmobai_assert_count` | |

All assertions emit a `FAIL` response on timeout that includes the **failure-triage bundle** (current URL, last 5 console errors, last 5 network errors, screenshot path) and — for selector-based assertions with a prior snapshot — the **self-healing diagnostic** (§2.4).

### 2.4 Self-healing selectors

When a selector-based action (`click`, `type`, assertion) succeeds, an `ElementSnapshot` is recorded: tag, accessible name, role, `data-testid`, key attributes, position. When that same selector later fails, the response includes:

- The prior snapshot ("last time this worked, it was…")
- Up to 5 candidate replacements scored by similarity (testid match heaviest, then role + accessible name + text + position proximity)
- A suggested-selector string per candidate using the most stable available signal (`[data-testid=…]` > `#id` > `[aria-label=…]` > `role=…[name=…]` > `text=…`)

This is what makes WebMobAI usable as an AI-driven framework: the AI client reads the bundle and retries with a better selector instead of stalling.

Code: `src/playwright/element-snapshot.ts`, `src/utils/failure-triage.ts`.

### 2.5 Request interception (mocking)

| Capability | Tool | Notes |
|---|---|---|
| Intercept matching requests | `webmobai_route` | Actions: `fulfill` (stub response), `abort`, `continue`. Glob patterns. |
| Remove interceptions | `webmobai_unroute` | Pattern-targeted or clear-all. |

Routes are tracked per-session and cleared on `close()` so a relaunched browser starts clean.

### 2.6 Visual regression (pixel-diff)

| Capability | Tool | Notes |
|---|---|---|
| Capture & compare against baseline | `webmobai_visual_snapshot` | Uses `pixelmatch` (same library as Playwright's `toHaveScreenshot()`). |
| List archived baseline versions | `webmobai_visual_baseline_list_versions` | Sprint 16. Lists `<name>.v<unix-ms>.png` archives with ISO dates + paths. `baseline_dir` is **required** here (unlike `visual_snapshot`, which defaults it to `<sessionDir>/visual-baselines`). No browser needed. |
| Roll a baseline back | `webmobai_visual_baseline_restore_version` | Sprint 16. Archives the current baseline first, then promotes the chosen `timestamp`. This is the undo for an accidental `update_baseline: true`. No browser needed. |

First call against a name saves the baseline (archiving the previous one). Subsequent calls compare; on mismatch the tool writes `<name>.actual.png` and `<name>.diff.png` (red-highlighted differences) next to the baseline. Options: `threshold` (per-pixel color sensitivity), `max_diff_pixels` (absolute), `max_diff_pixel_ratio` (proportional, default 1%), `selector` (snapshot one element), `full_page`, `update_baseline` (force-overwrite after intentional UI changes), `baseline_dir` (point at a repo path so baselines version with the code).

Also exposed as a scenario step (`type: "visualSnapshot"`).

### 2.7 Accessibility auditing

| Capability | Tool | Notes |
|---|---|---|
| Full a11y audit | `webmobai_accessibility_audit` | **axe-core via `@axe-core/playwright`** is the primary engine; the hand-rolled rules from v1 remain as a supplementary fast path with dedup against axe. Findings grouped by impact (critical / serious / moderate / minor). |
| Real accessibility tree | `webmobai_get_accessibility_tree` | CDP `Accessibility.getFullAXTree` with ignored pass-through nodes collapsed. Computed roles + accessible names — not a DOM walk. |

### 2.8 Performance metrics (Web Vitals)

| Capability | Tool | Notes |
|---|---|---|
| Single-run Web Vitals | `webmobai_get_performance_metrics` | LCP, FCP, CLS, TTI, **INP** (replaced FID March 2024), TTFB, DOMContentLoaded, LoadComplete. Plus **LCP element fingerprint** (tag, src, text, size). |
| Multi-run statistics | `webmobai_run_perf_multi` | N navigations (1–10), median + p95 + min + max per metric. Median resists single-run variance. |
| Network throttling | `webmobai_set_network_throttle` | Presets: `slow-3g`, `fast-3g`, `slow-4g`, `offline`. Offline via `BrowserContext.setOffline` (cross-engine); bandwidth/latency via CDP (Chromium-only). |
| CPU throttling | `webmobai_set_cpu_throttle` | Slowdown factor (4 = Lighthouse mobile profile). Chromium-only. |

Long-task and event-timing entries are subscribed via a context init script so the metrics observer can read buffered entries on demand.

### 2.9 Responsive testing

| Capability | Tool | Notes |
|---|---|---|
| Multi-breakpoint sweep | `webmobai_test_responsive` | Default: 375×812 / 768×1024 / 1280×720. Configurable. Reports horizontal overflow per breakpoint with a screenshot. |

### 2.10 Security audit

| Capability | Tool | Notes |
|---|---|---|
| CSP / mixed content / cookies | `webmobai_security_audit` | Reads CSP from response header and `<meta http-equiv>`. Flags missing, missing `default-src`/`script-src`, and `unsafe-inline`/`unsafe-eval`. Mixed content from HTTPS pages flagged via the network-error log. Cookies inspected for `Secure` / `HttpOnly` / `SameSite`; severity bumps for session/auth cookies. SameSite=None without Secure called out separately. |

### 2.11 SEO audit

| Capability | Tool | Notes |
|---|---|---|
| Page SEO | `webmobai_seo_audit` | Title (30-60 char range), meta description (70-160), canonical, OG (title + image), Twitter card, H1 count, viewport meta, JSON-LD parse validity + `@type` presence, robots.txt + sitemap.xml fetch. |
| Broken link crawl | `webmobai_check_broken_links` | Same-origin HEAD-test, capped at 50 links by default (configurable to 100). Reports 4xx/5xx. |

### 2.12 PWA audit

| Capability | Tool | Notes |
|---|---|---|
| Manifest + SW + offline | `webmobai_pwa_audit` | Manifest link presence, fetch (via `page.evaluate(fetch)` so it respects routing/CSP), required fields (name/short_name/start_url/display/icons), 192+ icon size, valid display value. Service worker registration via `navigator.serviceWorker.getRegistrations()`. HTTPS prereq check. Optional `test_offline: true` flips offline + reloads to check the cached-shell fallback. |

### 2.13 Run history + regression detection

| Capability | Tool | Notes |
|---|---|---|
| Read run history | `webmobai_get_run_history` | Filter by URL, limit. Reads `~/.webmobai/history.json` (200-entry cap, append-only with trim). |
| Detect regressions | `webmobai_check_regressions` | Compares current Web Vitals + error counts against median of last N runs (default 5) for the same URL. Configurable threshold (default ±10%). Uses median, not mean, so outliers don't poison the baseline. |

Auto-test runner automatically appends to history after each completed run.

### 2.14 Scenarios + suites (script-driven E2E)

**Scenario format** (`src/scenario/types.ts`): JSON with `{name, url, steps[]}` plus optional `viewport`, `browser`, `device`, `continueOnFailure`, and `storageState` (path to a saved session — §2.23). **17 step verbs**: `navigate`, `click`, `type`, `select`, `press`, `scroll`, `wait`, `screenshot`, `route`, `visualSnapshot`, `saveStorageState`, `pauseForManual`, plus the five assertions (`assertVisible`, `assertHidden`, `assertText`, `assertUrl`, `assertCount`). `continueOnFailure: true` for tolerant runs.

**Suite format** (`src/suite/types.ts`): JSON with `{name, defaults, scenarios[]}`. Each scenario is either path-based (`{path, tags}` — resolved relative to the suite file) or inline (`{scenario, tags}`). Defaults (browser, viewport, device, continueOnFailure, storageState) cascade onto scenarios that don't override them. `webmobai-suite` takes a **suite JSON file**, never a directory.

**CLIs**:
- `webmobai-scenario <file>` runs one scenario headless; emits HTML + JUnit + trace.zip. Flags: `--storage-state <auth.json>` (run authenticated — **overrides** the scenario's own `storageState`), `--save-storage-state <auth.json>` (persist the session after the run, even if steps failed). Space-separated values only; no `=` form.
- `webmobai-suite <file>` runs a suite with bounded concurrency. Flags: `--workers N` (default `min(4, cpus)`), `--shard k/n` (deterministic striping — shard 1/4 takes items 0/4/8…), `--tag T` (repeatable, OR), `--exclude-tag T` (repeatable; exclude wins), `--reporter html|junit|both|none` (default `both`), `--out DIR` (default cwd), `--allow-empty`, `--storage-state F`. Exit 0 / 1 / 2.
- Filtering happens **before** sharding, so every shard must be given identical `--tag` / `--exclude-tag` flags or the shards disagree about the index space.
- Precedence differs between the two CLIs: `webmobai-scenario --storage-state` **wins** over the scenario field; `webmobai-suite --storage-state` **loses** to any scenario or suite-default that already sets one (it is applied with `??=`).

**Scaffolding**: `webmobai_generate_scenario` MCP tool inspects the current page (H1, forms with sample-value typing, nav links, CTAs) and emits a starter Scenario JSON Claude can refine conversationally.

### 2.15 Reporting

| Format | Where |
|---|---|
| HTML report (`report-<ts>.html`) | Per session via `webmobai_generate_report` and the CLIs |
| PDF report (`report-<ts>.pdf`) | `webmobai-test` runs only — Playwright `page.pdf()` render of the HTML report, A4 with backgrounds |
| JUnit XML (`junit-<ts>.xml`) | Unconditional on `webmobai-test` / `webmobai-scenario`; on `webmobai-suite` only when `--reporter` is `junit` or `both`. `<failure>` for fails, `<skipped>` for warnings (so CI doesn't break on warnings). Control chars and ANSI escapes stripped before escaping so one bad byte can't corrupt the file. |
| Playwright trace.zip | Auto-captured per session; open at https://trace.playwright.dev for time-travel debugging |
| Real-time action log | Streamed via stdout JSON to the desktop app |
| Raw suite JSON (`suite-<ts>.json`) | `webmobai-suite` writes it **always**, even with `--reporter none` — full per-scenario results including each scenario's `sessionDir` |

Per-session artifacts go to a temp dir (`<os.tmpdir()>/webmobai-<id>/`) so concurrent runs don't collide. `webmobai-suite`'s three aggregate files go to `--out` (default cwd); per-scenario screenshots and `trace.zip` stay in tmp and are **not** copied there — read `sessionDir` out of `suite-<ts>.json` to archive them in CI.

### 2.16 Debugging tools

| Capability | Tool / CLI | Notes |
|---|---|---|
| Inspect what a selector matches | `webmobai_describe_selector` | Match count, per-element summary (tag, role, aria-label, testid, id, class, position, visible). On zero matches: targeted hints when the selector mentions an id or testid that doesn't exist anywhere on the page. |
| Record interactions → scenario | `webmobai-codegen <url> [-o file]` | Headed Chromium; listens to click/change/navigate; emits stable selectors (testid > id > aria-label > role+text). Passwords redacted. Output is a Scenario JSON. |

### 2.17 Autonomous standalone runner

`webmobai-test <url> [config-json]` opens a browser, navigates, screenshots, runs error/a11y/perf/responsive audits, optionally auto-logs in (if `credentials` is in the config), crawls up to `maxPages` internal links, and emits HTML + JUnit + trace + history append. All `SessionConfig` fields from the desktop app are honored (viewport, breakpoints, feature toggles, credentials).

### 2.18 Skills (Claude Code integration)

`.claude/skills/` documents **20 named workflows** that teach Claude how to drive the tools cohesively. Each is a self-contained SKILL.md with triggers, inputs, an ordered workflow naming the exact tools, and honest limitations. `.claude/skills/README.md` is the index and the shared-conventions layer.

**Broad passes**
- `testing-web-app` — the master workflow: explore + a11y + perf + responsive + errors + report
- `running-web-smoke-test` — fast pass/fail "is the site alive", typically post-deploy
- `exploring-web-app` — crawl internal links, build a site map, recommend follow-up skills

**Focused audits**
- `auditing-web-accessibility` — deep WCAG-aligned axe-core pass + CDP a11y tree
- `auditing-web-performance` — Web Vitals, multi-run medians, throttled mobile cross-check
- `auditing-web-lighthouse` — official Google 0-100 category scores (optional dep)
- `testing-web-responsive` — breakpoint sweep, horizontal-overflow detection
- `auditing-web-security` — CSP, mixed content, cookie flags (hygiene, not a pentest)
- `auditing-web-seo` — title/meta/OG/canonical/h1/JSON-LD + same-origin broken links
- `auditing-web-pwa` — manifest, service worker, HTTPS, optional offline reload
- `regression-web-visual` — pixelmatch baseline-vs-current, versioned baselines

**Flows & assertions**
- `verifying-web-flows` — hard pass/fail acceptance testing via the five `assert_*` verbs
- `testing-web-forms` — form happy path, validation matrix, error states, form a11y
- `testing-web-error-states` — forced failures via `route`/`unroute` + network throttling
- `debugging-web-selectors` — diagnose a broken locator, get ranked verified replacements

**Authoring & CI**
- `authoring-web-scenarios` — turn an exploration or a plain-English description into replayable scenario JSON
- `running-web-ci-suites` — suite file, `--workers` / `--shard` / `--tag`, JUnit wiring, exit-code contract
- `testing-web-authenticated-sessions` — capture a login once, replay it on every later run (§2.23)

**Ops & diagnosis**
- `monitoring-web-regressions` — run history, latest-vs-median regression check, scheduled monitoring
- `troubleshooting-webmobai-setup` — WebMobAI itself is broken: missing tools, no Playwright engine, disabled Lighthouse/AI, rejected storageState, Gatekeeper

### 2.19 Desktop app & distribution

- **Tauri 2.0 shell** — React 19 + Vite 6 + Tailwind v4 + Zustand
- Single-click testing, real-time action log, screenshot gallery (via `convertFileSrc` + asset protocol scoped to `$TEMP/webmobai-*/**`), dark/light/system theme
- **Sprint 14 polish**: settings + Configuration persist across restarts (Zustand `persist`); fullscreen screenshot lightbox with ←/→ navigation; Open / Reveal-in-Finder on each screenshot; toast notifications; ⌘↵ / ⌘. / ⌘1–7 shortcuts; clickable WCAG references + copy-selector on a11y findings; Action Log status filter + JSON export
- **Sprint 18 packaging fix (audit B1)**: the Tauri `shell:allow-execute` / `shell:allow-spawn` capability had no command scope, so in a *packaged* build every Test run, Monitors-tab history read, reveal, and open-report action was rejected — the shipped app was non-functional while `npm run tauri dev` worked. Replaced with a scoped allow-list (`node --version`, `node …/auto-test.js <url> <json>`, `cat …history.json`, `open -R <path>`) using argument validators rather than `args: true`, and widened `plugins.shell.open` to accept local `file://` URLs so reports, PDFs, and screenshots open. Only `tauri-plugin-shell` is used; screenshots render through `convertFileSrc` + the asset protocol, not a filesystem plugin.
- macOS `.dmg` via GitHub Releases; MCP server published as `webmobai-mcp` on npm (`release.yml`, tag-triggered; `npm publish` runs after a clean `npm ci && npm run build`, and the desktop bundle is slimmed with `npm ci --omit=dev`)
- **Releases are unsigned and un-notarized** (`bundle.macOS.signingIdentity: null`) — first launch needs `xattr -cr /Applications/WebMobAI.app`. `bundle.targets` is `"all"`, but **only macOS artifacts are actually built**: the CI/release matrix is `aarch64-apple-darwin` + `x86_64-apple-darwin` (the Intel leg is cross-compiled). No Windows or Linux desktop build ships.
- CI: GitHub Actions on every push/PR to `main` — `npm ci` + `npm run build` (tsc) + `npx playwright install --with-deps chromium firefox webkit` + `npm test` on `ubuntu-latest`, frontend `tsc --noEmit` + `vite build`, then the two macOS desktop builds. The release workflow does **not** re-run the tests; the gate is CI on `main` before tagging.

### 2.20 Test coverage

**214 tests** across 26 test files in `mcp-server/test/` (`npx vitest list | wc -l` = 214):

| Suite | Cases | What it covers |
|---|---|---|
| `page-analyzer.test.ts` | 5 | A11y audit rules, axe-core integration, accessibility tree |
| `browser-manager.test.ts` | 6 | Network error tracking, TTI/Web Vitals shape, bounded error buffer |
| `run-config.test.ts` | 8 | SessionConfig parsing, defaults, feature toggles |
| `assertion-tools.test.ts` | 14 | All 5 assertion verbs incl. auto-wait and the no-matcher `assert_url` rejection |
| `route-tools.test.ts` | 5 | Fulfill/abort/continue, unroute |
| `multi-browser.test.ts` | 8 | Chromium + Firefox launches, iPhone + Pixel emulation |
| `trace-and-junit.test.ts` | 12 | Trace.zip lifecycle, JUnit XML schema, control-char stripping |
| `self-healing.test.ts` | 8 | Snapshot capture, similar-element ranking, diagnostic format |
| `run-history.test.ts` | 11 | Persistence, regression detection (median, scoping, thresholds) |
| `scenario.test.ts` | 8 | Scenario runner halt-on-fail vs continueOnFailure, scaffolder |
| `visual-comparator.test.ts` | 9 | Pixel-diff math, tolerance gating |
| `visual-tools.test.ts` | 9 | Baseline creation, compare, update, scenario integration |
| `suite-filter.test.ts` | 13 | Tag include/exclude OR semantics, shard striping |
| `suite-loader.test.ts` | 8 | Path-vs-inline entries, defaults cascade |
| `suite-runner.test.ts` | 6 | Parallel execution, isolation, progress events |
| `perf.test.ts` | 11 | computeStats, throttle apply/clear, multi-run |
| `security.test.ts` | 5 | CSP missing/weak, cookie attributes, HTTPS warning |
| `seo.test.ts` | 6 | Title length, missing meta, multi-H1, invalid JSON-LD |
| `pwa.test.ts` | 7 | Manifest fields, SW registration, offline |
| `debug.test.ts` | 5 | Selector descriptions, zero-match hints |
| `ai.test.ts` | 17 | AI config gating, disabled-path on every AI tool, Scenario JSON validation incl. code-fence stripping and unknown-step rejection, AI-summary markdown renderer incl. injection-safe HTML escaping |
| `sprint16.test.ts` | 9 | BaselineStore archive-on-overwrite, listing, pruning beyond `maxVersions`, restore-with-rearchive, nested-name scoping, restore rejection on unknown timestamp; Lighthouse `LighthouseUnavailableError` + markdown formatter |
| `sprint17.test.ts` | 14 | `monitor-cli` parseInterval (ms/s/m/h, decimals, malformed), parseArgs (URL required, `--flag=value` / `--flag value`, positional config), `runMonitorLoop` with `--once` runs exactly one iteration and stops between iterations on signal, BrowserManager idle-timeout configuration |
| `storage-state.test.ts` | 5 | Save → replay round-trip (cookies + localStorage), missing-file error text, save-without-browser guard, no session contents in the tool response, headless `pauseForManual` no-op |
| `doctor-cli.test.ts` | 3 | Base run exits 0, missing storageState file exits 1, valid `{cookies,origins}` file exits 0 |
| `suite-cli.test.ts` | 2 | Zero-match tag filter exits 2; `--allow-empty` makes the same run exit 0 |

1 test is skipped locally (WebKit-only), exercised in CI.

**Known coverage gaps** (honest list): `SuiteDefaults.storageState` cascade, the `--storage-state` / `--save-storage-state` flags on either CLI, the `saveStorageState` scenario step, headed `pauseForManual`, and `webmobai-doctor`'s expired-cookie `warn` branch are all unexercised.

### 2.21 AI intelligence layer (opt-in, Sprint 15)

A small `src/ai/` module is the single place in the server that calls the
Anthropic API. Every AI feature gates on `WEBMOBAI_ANTHROPIC_API_KEY` — with no
key, the AI tools return a clean "set the key" message and the rest of the
server is unchanged. System prompts are always sent with
`cache_control: ephemeral` so repeat-task calls hit the prompt cache.

| Capability | Tool | Notes |
|---|---|---|
| Visual-diff narration | `webmobai_explain_visual_diff` | Sends baseline + actual (+ optional diff mask) PNGs to Claude. Returns 2–6 short bullets describing what visibly changed and a severity tag (cosmetic / content / structural). No browser required. |
| Executive audit summary | `webmobai_summarize_audit` | Rolls accumulated a11y / perf / console / test results into a prioritized markdown summary (Headline / Top fixes / What's working) under 350 words. Auto-test runner embeds this in `TestReportData.aiSummary` when a key is present; the desktop "Test Report" panel and the HTML report both render it. |
| NL → Scenario | `webmobai_generate_scenario_from_prompt` | Generates a WebMobAI Scenario JSON from a natural-language description plus a snapshot of the current page (title, headings, top interactive elements). Output is **zod-validated** before return — bad model output throws loudly rather than producing a broken scenario. |

Env vars: `WEBMOBAI_ANTHROPIC_API_KEY` (required to enable),
`WEBMOBAI_AI_MODEL` (default `claude-opus-4-8`),
`WEBMOBAI_AI_MAX_TOKENS` (default 2048).
These three are the **only** environment variables the server reads.

### 2.22 Monitoring & scheduling (Sprint 17)

A binary, a desktop tab, and one extra report block — backed entirely by the
existing `~/.webmobai/history.json` substrate and the existing `detectRegressions`
helper.

| Capability | Surface | Notes |
|---|---|---|
| Scheduled recurring runs | `webmobai-monitor <url> [config] [flags]` | Spawns the existing `auto-test.js` runner per iteration. Flags: `--interval=<duration>` (default 5 m), `--once`, `--alert-webhook=<url>` (POST regression bundle), `--config=<json>`. SIGINT-friendly: stops between runs. |
| Webhook alerts | `--alert-webhook=<url>` | After each iteration, the monitor reads history, runs `detectRegressions` on the latest entry for the URL, and if any finding has severity `regression` POSTs `{url, latestRunId, timestamp, baselineRuns, regressions[]}` as JSON. Failures are logged but never crash the loop. |
| Trend dashboard | Desktop **Monitors** tab (⌘7) | Reads history via the existing `shell:allow-execute` (`cat <home>/.webmobai/history.json`). URL picker, four sparklines (LCP / FCP / CLS / TTFB) plus error-count and a11y-count sparklines, and a 30-row run table. Refresh button re-reads the file. |
| Baseline-vs-current report mode | Auto-emitted on every `webmobai-test` run with 2+ prior history entries | `TestReportData.historicalComparison` carries `{url, baselineRuns, findings[]}`. The HTML report renders a "vs historical baseline" table; the desktop **Test Report** panel mounts `<HistoricalComparison />`, which also fires a single destructive toast when real regressions appear. |
| Idle session timeout | `BrowserManager` (Track D fold-in) | Optional `idleTimeoutMs` on `launch()` / `setIdleTimeout()`. The MCP dispatcher calls `bumpIdleTimer()` after every successful tool call. New `idle_timeout_ms` field on `webmobai_launch_browser`. Default disabled. |

### 2.23 Authenticated sessions (Sprint 18)

Most of what WebMobAI audits — dashboards, account pages, checkout — sits behind a login. Sprint 18 makes a logged-in session a **capture-once, replay-everywhere** artifact, using Playwright's `storageState` (cookies + per-origin localStorage) as the on-disk format.

| Surface | Identifier | Notes |
|---|---|---|
| Launch authenticated | `webmobai_launch_browser { storage_state_path }` | Seeds the context from a saved session. `BrowserManager.launch()` checks the file exists up front and throws a directive error naming the three ways to create one. |
| Save the current session | `webmobai_save_storage_state { path }` | Required `path`. Wraps `context.storageState({ path })`. Refuses with a clear message when no browser is launched. |
| Scenario field | `"storageState": "./auth.json"` | Top-level; the runner navigates to `scenario.url` already authenticated. |
| Scenario step | `{ "type": "saveStorageState", "path": "auth.json" }` | Persist mid-scenario. |
| Scenario step | `{ "type": "pauseForManual", "prompt": "…", "timeoutMs": 120000 }` | Headed only — see the limitation below. |
| Suite default | `defaults.storageState` | Cascades onto scenarios that don't set their own. |
| CLI | `webmobai-scenario --storage-state F` / `--save-storage-state F` | Flag **wins** over the scenario field. |
| CLI | `webmobai-suite --storage-state F` | Flag **loses** to a scenario or suite-default value (`??=`). |
| CLI | `webmobai-doctor --storage-state F` | Validates the file before a run — §2.24. |

**The capture flow that actually works for MFA/SSO is the MCP one**, because it is the only headed surface: `webmobai_launch_browser { headless: false }` → `webmobai_navigate` → drive the credential form → the human completes MFA in the visible window between tool calls → `webmobai_save_storage_state { path: "auth.json" }` → `webmobai_close_browser`. Then relaunch with `storage_state_path`.

**Secret hygiene — what the code enforces:**
- The launch response never echoes the storageState path; it substitutes a fixed "started from a saved authenticated session" line.
- Session *contents* never appear in any tool response or log (asserted by a test that fails if a stored secret leaks into the message).
- The missing-file error omits the path; both storageState log lines are path-free and content-free.
- All logger output goes to stderr, never stdout, never a file.
- `webmobai-codegen` redacts `input[type="password"]` values to the literal string `<REDACTED — password field>`.
- `.gitignore` carries `auth.json`, `*.auth.json`, `*storage-state*.json`.

**What it does not do** (see §4 for the full list): no file-permission hardening or encryption, no expiry check at runtime, no refresh/re-auth loop, and the `.gitignore` patterns are name-based — a session saved as `state.json` or `.auth/creds.json` matches none of them. Playwright traces and videos capture the authenticated session unredacted.

**`pauseForManual` is a no-op in every shipped entry point.** Both callers of `runScenario` (`webmobai-scenario`, `webmobai-suite`) hardcode `headless: true`, and neither has a `--headed` flag, so the step logs a warning to stderr, records as **pass**, and continues immediately. A CLI "capture" scenario that pauses for MFA and then calls `saveStorageState` will happily write a pre-MFA, unauthenticated file and report all green. The verb exists for programmatic `BrowserManager` + `runScenario` callers; even there it is a blind `page.waitForTimeout` (default 30 s, hard ceiling 300 s) that cannot be shortened when the human finishes early.

### 2.24 Preflight & diagnostics — `webmobai-doctor` (Sprint 18)

`webmobai-doctor [--storage-state <auth.json>]`. Writes nothing, prints to stdout, exits **0** when no check has `error` status (warnings never fail) and **1** otherwise. There is no exit code 2; unknown arguments are ignored.

| # | Check | Status logic |
|---|---|---|
| 1 | `Node.js` | `error` below major 18, else `ok` |
| 2 | `Browser: chromium` | Required — `error` when the Playwright executable is absent, with the exact `npx playwright install chromium` command |
| 3–4 | `Browser: firefox` / `Browser: webkit` | Optional — `warn` when absent |
| 5 | `Lighthouse (optional)` | `require.resolve("lighthouse")`; `warn` with the `npm install lighthouse chrome-launcher` command |
| 6 | `AI features (optional)` | `warn` when `WEBMOBAI_ANTHROPIC_API_KEY` is unset or whitespace |
| 7 | `Auth storageState` | Only when `--storage-state` is passed: `error` on missing file (path resolved and printed) or unparseable JSON; `warn` when there is ≥1 dated cookie and **every** dated cookie has expired; else `ok` with the cookie count |

The staleness heuristic is deliberately weak and worth knowing: expiry is compared in seconds, session cookies (no `expires`, or `-1`) are excluded entirely, `origins[]` / localStorage is never inspected, and a single non-expired dated cookie makes the whole check `ok`. It catches a plainly dead file, not a subtly stale one.

Run it as the first step of a CI job: it turns "missing browser" or "dead auth file" into a one-line failure instead of a cryptic mid-run Playwright error.

---

## 3. Out of scope (and the recommended alternative)

These will **not** be in WebMobAI. Users wanting them should reach for the recommended tools.

| Want | Use instead |
|---|---|
| Hosted visual-regression with PR comments + shared baselines | Percy, Chromatic, Applitools |
| Hosted cross-browser cloud execution | BrowserStack, Sauce Labs, LambdaTest |
| Native mobile app testing (iOS/Android) | Appium, Maestro, Detox |
| Load / stress testing | k6, Artillery, Locust |
| API contract testing | Pact, Schemathesis |
| Static code analysis | ESLint, SonarQube |
| Unit testing | Vitest, Jest |
| Component testing | Storybook + Chromatic, Cypress Component |
| Hosted/CI-managed Lighthouse score history | Lighthouse CI (LHCI) server, PageSpeed Insights API. `webmobai_lighthouse_audit` gives you the four scores locally (§2.21 predecessor, Sprint 16) but stores no hosted trend. |
| Browser extension testing | Playwright supports this; no UI for it here |
| i18n translation coverage | translation-check, react-intl-cli |
| Credential vaulting / secret management | 1Password CLI, Vault, your CI's secret store. WebMobAI reads a storageState **file** and has no env-var or vault input (§2.23). |

---

## 4. Roadmap / known limitations

Most of the original gap analysis from v1.1.0 is closed. Sprint 16 closed four accuracy items; Sprint 18 closed the login wall plus the B1–B6 audit findings. What remains is listed honestly below.

**Closed in Sprint 16**:
- ✓ **TTI strict definition** — opt-in via `webmobai_get_performance_metrics { strict_tti: true }`. Waits for the 5-second long-task quiet window after FCP (Lighthouse's definition), up to 15 s total. Fast mode is still the default.
- ✓ **CLS measurement window** — added `clsAtLoad`, the cumulative shift frozen 3 s after `load`. Side-by-side with the running `cls` so callers can see both.
- ✓ **getLinks protocol-relative URLs** — `//cdn.foo/x` from a `file://` document is now caught explicitly.
- ✓ **Lighthouse integration** — `webmobai_lighthouse_audit` (optional `lighthouse` + `chrome-launcher` deps). Returns the four official scores plus the lowest-scoring audits. This retires the old §3 "official Lighthouse score is out of scope" line.

**Closed in Sprint 18**:
- ✓ **Testing behind a login** — capture/replay via storageState across MCP, scenario, suite, and CLI (§2.23).
- ✓ **False-green reporting (B3–B6)** — the scenario runner treats any non-success tool result as a step failure; `webmobai-suite` exits 2 when a tag filter matches zero scenarios of a non-empty suite (`--allow-empty` opts out); `assert_url` with neither `contains` nor `pattern` is rejected instead of vacuously passing; JUnit XML strips XML-illegal control characters and ANSI escapes.
- ✓ **Clean-install browser launch (B2)** — `BrowserManager.launch()` self-installs the requested Playwright engine, so the MCP server and every CLI work on a fresh `npm install -g` instead of failing with "Executable doesn't exist".
- ✓ **Packaged desktop app was non-functional (B1)** — the unscoped Tauri shell capability is now a validated allow-list (§2.19).
- ✓ **No preflight** — `webmobai-doctor` (§2.24).

**Still wanted — authenticated sessions**. These are real limitations of the Sprint 18 design, not bugs:
- **No expiry handling at runtime.** `launch()` only checks the file exists. A stale session produces ordinary step failures (redirected to `/login`, `assertVisible` timeout) with no distinct diagnostic. There is no refresh loop and no retry-on-401 anywhere. `webmobai-doctor --storage-state` is the only staleness signal and its heuristic is weak (§2.24).
- **sessionStorage and IndexedDB are not captured.** That is Playwright's boundary and WebMobAI adds nothing on top — an app that stores its token in either cannot be replayed with this feature at all.
- **`origins[]` is per-origin and only covers origins actually visited during capture.** An app that reads its token from an origin never loaded in the capture session will not be authenticated on replay. Cookies, by contrast, are context-wide (including a separate IdP domain).
- **SSO has no special handling.** An IdP redirect chain works during capture, but a flow that requires re-consent or an interactive device-code step on every login cannot be replayed. `pauseForManual`'s 5-minute clamp and headless no-op apply.
- **`pauseForManual` is dead in both shipped CLIs** — no `--headed` flag exists, so the documented "capture with an MFA pause" scenario silently saves an unauthenticated file (§2.23). Either a `--headed` flag on `webmobai-scenario` or removing the verb from the CLI story would fix this; today the MCP flow is the only honest capture path.
- **CI secret handling is the caller's problem.** There is no env-var input, so CI must materialize the JSON to disk before invoking any CLI. The `.gitignore` patterns are name-based and miss anything not called `auth.json` / `*.auth.json` / `*storage-state*.json`. Nothing chmods the file to `0600`. Playwright `trace.zip` and video capture the authenticated session unredacted and land in `$TMPDIR` — a CI job that archives a session dir publishes credential-equivalent material.
- **Path resolution is inconsistent.** `webmobai-doctor` resolves the storageState path against cwd; `BrowserManager`, `webmobai-scenario`, and the suite loader pass it through unresolved, and the suite loader resolves scenario *paths* relative to the suite file but not `storageState`. `webmobai-doctor --storage-state auth.json` and a suite run launched from another directory can be talking about different files.
- **Neither AI nor deterministic scenario generation can emit auth steps.** The generator's step vocabulary and zod schema both omit `storageState`, `saveStorageState`, and `pauseForManual`, so generated scenarios always need hand-editing to run authenticated. `webmobai-codegen` cannot record behind a login at all (it calls `newContext()` with no options and has no storageState flag).

**Still wanted — general**:
- **WebKit-specific path coverage.** WebKit-skipped tests run in CI only. Some features (CDP-based throttling, real a11y tree) are Chromium-only by design.
- **Suite artifact collection.** Per-scenario traces and screenshots stay in `$TMPDIR`; only the three aggregate files reach `--out`. CI has to read `sessionDir` from `suite-<ts>.json` and copy them by hand.
- **No cross-shard aggregation.** Each `--shard` writes its own report; merging is the downstream CI's job.
- **Test-coverage gaps around the Sprint 18 surface** — enumerated at the end of §2.20.

**Won't fix** (already accurate):
- The supplementary a11y "small-text" rule maps to WCAG 1.4.4 (Resize Text), not contrast. That's the corrected mapping — leaving it as-is.
- `webmobai-test` exits 0 even when checks fail; it is an explorer, not a gate. Use `webmobai-scenario` / `webmobai-suite` exit codes (or the JUnit XML) in CI.

---

## 5. Version history

This file evolves alongside the codebase. Major capability waves:

| Sprint | What landed |
|---|---|
| 1 | Test foundation (Vitest), fixed 5 P0 bugs in already-shipped features (a11y tree, skip-link rule, color-contrast mislabel, network errors, TTI) |
| 2 | SessionConfig wired into auto-test runner, axe-core integrated as primary a11y engine |
| 3 | Assertions, retries, request mocking (real E2E primitives) |
| 4 | Firefox + WebKit + mobile device emulation |
| 5 | Playwright traces + JUnit XML output |
| 6 | Self-healing selectors, run history + regressions, scenario runner + scaffolder |
| 7 | Pixel-perfect visual regression (pixelmatch) |
| 8 | Test suites, parallelization, sharding, tag filtering |
| 9 | INP + LCP element, network/CPU throttling, multi-run perf stats |
| 10 | Security audit (CSP, mixed content, cookies) |
| 11 | SEO audit + broken-link crawl |
| 12 | PWA audit (manifest, service worker, offline) |
| 13 | Selector inspector + codegen CLI |
| 14 | Desktop polish & persistence: state persistence (Zustand `persist`), fullscreen screenshot lightbox, toast notifications, keyboard shortcuts (⌘↵ / ⌘. / ⌘1–7), clickable WCAG references + copy-selector, Action Log filter + export, screenshot Open / Reveal-in-Finder. Hardening: bounded `BrowserManager` error buffers. |
| 15 | AI intelligence layer (opt-in via `WEBMOBAI_ANTHROPIC_API_KEY`): Claude visual-diff narration, executive audit summarizer, NL → Scenario JSON generator. 3 new MCP tools, 1 new AI module (`src/ai/`), prompt caching, auto-test runner embeds the summary in the report. Track D: `server.ts` dispatcher table-driven refactor (~100 LOC saved). |
| 16 | New testing capabilities: Lighthouse integration (opt-dep, official scores), PDF report export (Playwright `page.pdf`), versioned visual baselines (archive-on-overwrite + list/restore tools), perf accuracy fixes (load-CLS frozen 3 s past `load`, opt-in strict TTI). Protocol-relative link fix. Track D: `docs/SCENARIO_FORMAT.md` written. |
| 17 | Monitoring & scheduling: new `webmobai-monitor` CLI (scheduled recurring runs, `--once` / `--interval` / `--alert-webhook`), desktop **Monitors** tab with sparkline trends + run table reading from history, this-run-vs-historical-median comparison embedded in every report (HTML + desktop), regression-detected toast. Track D: `BrowserManager` idle-close timer reset by the dispatcher. |
| 18 | Authenticated sessions & audit hardening (v1.4.0): storageState capture/replay across MCP (`storage_state_path`, new `webmobai_save_storage_state`), scenarios (`storageState` field, `saveStorageState` + `pauseForManual` steps), suites (`SuiteDefaults.storageState`), and CLIs (`--storage-state`, `--save-storage-state`); new `webmobai-doctor` preflight binary. Audit fixes B1–B6: scoped Tauri shell capability (packaged app was non-functional), clean-install browser self-download, non-success step results are failures, zero-match tag filter exits non-zero (`--allow-empty`), `assert_url` rejects a call with no matcher, JUnit control-char stripping. AI default model `claude-opus-4-7` → `claude-opus-4-8`. |

Tool count: **25 → 51**. Binaries: **2 → 7**. Tests: **0 → 214**. Claude Code skills today: **20**.

---

## 6. Feature ownership

Use this section to assign maintainers as the project grows.

| Area | Owner |
|---|---|
| Browser engine + MCP tools | _unassigned_ |
| Accessibility | _unassigned_ |
| Performance | _unassigned_ |
| Visual regression | _unassigned_ |
| Scenarios + suites | _unassigned_ |
| Desktop app (Tauri + React) | _unassigned_ |
| AI / Claude integration | _unassigned_ |
| CI / release | _unassigned_ |
| Documentation | _unassigned_ |
