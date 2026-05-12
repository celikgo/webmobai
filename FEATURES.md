# Features

WebMobAI is an **AI-leveraged end-to-end web testing framework** with an autonomous-auditor front. It opens a real browser (Chromium, Firefox, or WebKit), drives it through scenarios you author or AI-generate, and produces reports the way a CI system expects them. You can use it as a script-free auditor (point and click), as a YAML/JSON-driven test runner (scenario + suite), or as an MCP tool surface that AI agents call directly.

This file is the contract: **what's shipped today**, **what's intentionally out of scope**, and **what's left on the roadmap**. The "Should include" gap analysis from the original v1.1.0 audit is now largely closed — see §4 for the version history.

---

## 1. Positioning

Three consumer paths share one engine:

1. **Standalone desktop app** — user enters a URL, clicks Test, watches results stream in. Powered by the `webmobai-test` CLI.
2. **AI-driven via MCP** — Claude (or any MCP-compatible agent) calls **43 MCP tools** to explore, interact, audit, assert, mock, and report.
3. **Script-driven** — Author JSON scenarios and suites; run them with `webmobai-scenario`, `webmobai-suite`, or record them interactively with `webmobai-codegen`.

The shared engine is built on **Playwright** (Chromium / Firefox / WebKit) wrapped by a thin TypeScript server (`mcp-server/`).

The project's distinctive feature is **AI-leveraged self-healing**: every selector failure returns a structured diagnostic — prior fingerprint, ranked candidate replacements, page-state triage — so an AI client can retry intelligently rather than just giving up.

**Distributed as five CLI binaries** (npm package `webmobai-mcp`):

| Binary | What it does |
|---|---|
| `webmobai-mcp` | MCP server (stdio) — exposes all 43 tools to Claude Desktop, Claude Code, etc. |
| `webmobai-test <url>` | Standalone auto-test — explores a URL and produces a full audit report |
| `webmobai-scenario <file>` | Run a single JSON scenario, emit HTML + JUnit + trace.zip |
| `webmobai-suite <file>` | Run a collection of scenarios with parallelism, sharding, tag filters |
| `webmobai-codegen <url>` | Record a session interactively, emit a starter Scenario JSON |

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
| Session video recording | Auto-enabled at launch | Disabled for perf runs and long crawls. |

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

First call against a name saves the baseline. Subsequent calls compare; on mismatch the tool writes `<name>.actual.png` and `<name>.diff.png` (red-highlighted differences) next to the baseline. Options: `threshold` (per-pixel color sensitivity), `max_diff_pixels` (absolute), `max_diff_pixel_ratio` (proportional, default 1%), `selector` (snapshot one element), `full_page`, `update_baseline` (force-overwrite after intentional UI changes), `baseline_dir` (point at a repo path so baselines version with the code).

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

**Scenario format** (`src/scenario/types.ts`): JSON with `{name, url, steps[]}`. 13 step verbs: `navigate`, `click`, `type`, `select`, `press`, `scroll`, `wait`, `screenshot`, `route`, plus the five assertions and `visualSnapshot`. `continueOnFailure: true` for tolerant runs.

**Suite format** (`src/suite/types.ts`): JSON with `{name, defaults, scenarios[]}`. Each scenario is either path-based (`{path, tags}` — resolved relative to the suite file) or inline (`{scenario, tags}`). Defaults (browser, viewport, device, continueOnFailure) cascade onto scenarios that don't override them.

**CLIs**:
- `webmobai-scenario <file>` runs one scenario; emits HTML + JUnit + trace.zip.
- `webmobai-suite <file>` runs a suite with bounded concurrency. Flags: `--workers N`, `--shard k/n` (deterministic striping — shard 1/4 takes items 0/4/8…), `--tag T` (repeatable, OR), `--exclude-tag T` (repeatable; exclude wins), `--reporter html|junit|both|none`, `--out DIR`. Exit 0 / 1 / 2.

**Scaffolding**: `webmobai_generate_scenario` MCP tool inspects the current page (H1, forms with sample-value typing, nav links, CTAs) and emits a starter Scenario JSON Claude can refine conversationally.

### 2.15 Reporting

| Format | Where |
|---|---|
| HTML report | Per session via `webmobai_generate_report` and the CLIs |
| JUnit XML | Same path, alongside HTML — `<failure>` for fails, `<skipped>` for warnings (so CI doesn't break on warnings) |
| Playwright trace.zip | Auto-captured per session; open at https://trace.playwright.dev for time-travel debugging |
| Real-time action log | Streamed via stdout JSON to the desktop app |
| Per-scenario JSON | `webmobai-suite` writes a raw result file for downstream tooling |

All artifacts go to a per-session temp dir (`<os.tmpdir()>/webmobai-<id>/`) so concurrent runs don't collide.

### 2.16 Debugging tools

| Capability | Tool / CLI | Notes |
|---|---|---|
| Inspect what a selector matches | `webmobai_describe_selector` | Match count, per-element summary (tag, role, aria-label, testid, id, class, position, visible). On zero matches: targeted hints when the selector mentions an id or testid that doesn't exist anywhere on the page. |
| Record interactions → scenario | `webmobai-codegen <url> [-o file]` | Headed Chromium; listens to click/change/navigate; emits stable selectors (testid > id > aria-label > role+text). Passwords redacted. Output is a Scenario JSON. |

### 2.17 Autonomous standalone runner

`webmobai-test <url> [config-json]` opens a browser, navigates, screenshots, runs error/a11y/perf/responsive audits, optionally auto-logs in (if `credentials` is in the config), crawls up to `maxPages` internal links, and emits HTML + JUnit + trace + history append. All `SessionConfig` fields from the desktop app are honored (viewport, breakpoints, feature toggles, credentials).

### 2.18 Skills (Claude Code integration)

`.claude/skills/` documents 8 named workflows that teach Claude how to drive the tools cohesively:

- `testing-web-app` — full audit
- `running-web-smoke-test` — fast pass/fail
- `auditing-web-accessibility` — deep a11y pass
- `auditing-web-performance` — Web Vitals
- `testing-web-responsive` — breakpoint sweep
- `testing-web-forms` — form happy-path + validation matrix
- `exploring-web-app` — site map / discovery
- `regression-web-visual` — baseline-vs-current screenshots

### 2.19 Desktop app & distribution

- **Tauri 2.0 shell** — React 19 + Vite 6 + Tailwind v4 + Zustand
- Single-click testing, real-time action log, screenshot gallery (via `convertFileSrc` + asset protocol scoped to `$TEMP/webmobai-*/**`), dark/light/system theme
- macOS `.dmg` via GitHub Releases; MCP server published as `webmobai-mcp` on npm
- CI: GitHub Actions builds for `aarch64-apple-darwin` and `x86_64-apple-darwin`, installs Chromium + Firefox + WebKit, runs the full test suite on every push/PR

### 2.20 Test coverage

**158 tests** across 20 test files in `mcp-server/test/`:

| Suite | Cases | What it covers |
|---|---|---|
| `page-analyzer.test.ts` | 5 | A11y audit rules, axe-core integration, accessibility tree |
| `browser-manager.test.ts` | 4 | Network error tracking, TTI/Web Vitals shape |
| `run-config.test.ts` | 7 | SessionConfig parsing, defaults, feature toggles |
| `assertion-tools.test.ts` | 12 | All 5 assertion verbs incl. auto-wait |
| `route-tools.test.ts` | 5 | Fulfill/abort/continue, unroute |
| `multi-browser.test.ts` | 8 | Chromium + Firefox launches, iPhone + Pixel emulation |
| `trace-and-junit.test.ts` | 10 | Trace.zip lifecycle, JUnit XML schema |
| `self-healing.test.ts` | 8 | Snapshot capture, similar-element ranking, diagnostic format |
| `run-history.test.ts` | 10 | Persistence, regression detection (median, scoping, thresholds) |
| `scenario.test.ts` | 7 | Scenario runner halt-on-fail vs continueOnFailure, scaffolder |
| `visual-comparator.test.ts` | 9 | Pixel-diff math, tolerance gating |
| `visual-tools.test.ts` | 8 | Baseline creation, compare, update, scenario integration |
| `suite-filter.test.ts` | 12 | Tag include/exclude OR semantics, shard striping |
| `suite-loader.test.ts` | 10 | Path-vs-inline entries, defaults cascade |
| `suite-runner.test.ts` | 6 | Parallel execution, isolation, progress events |
| `perf.test.ts` | 11 | computeStats, throttle apply/clear, multi-run |
| `security.test.ts` | 5 | CSP missing/weak, cookie attributes, HTTPS warning |
| `seo.test.ts` | 6 | Title length, missing meta, multi-H1, invalid JSON-LD |
| `pwa.test.ts` | 7 | Manifest fields, SW registration, offline |
| `debug.test.ts` | 5 | Selector descriptions, zero-match hints |

1 test is skipped locally (WebKit-only), exercised in CI.

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
| Official Lighthouse perf score | Run `lighthouse` CLI directly — we complement, don't replace |
| Browser extension testing | Playwright supports this; no UI for it here |
| i18n translation coverage | translation-check, react-intl-cli |
| Vision-model "what visually changed" explanations | Out of scope — needs a Claude API call from inside the server, which we don't do |

---

## 4. Roadmap / known limitations

Most of the original gap analysis from v1.1.0 is closed. Remaining work:

**Still wanted**:
- **TTI strict definition**. Current implementation uses the end of the last observed long task (or DOM content loaded as fallback). The Lighthouse definition is "first 5s quiet window after FCP" which requires waiting 5s+ past the last long task — we measure earlier than that for speed. Within ~10% on most pages.
- **CLS measurement window**. Layout-shift entries accumulate over the entire session, not just the initial load. Long sessions inflate CLS. Capturing a "load CLS" snapshot at network-idle would be more faithful.
- **getLinks protocol-relative URLs**. Currently filters to `http*` only, missing `//cdn.foo/x`. Low impact.
- **Lighthouse integration**. We complement Lighthouse with our own per-axis tools; could also spawn `lighthouse --output=json` and merge into the report for the official score. Adds a heavy dep.
- **WebKit-specific path coverage**. WebKit-skipped tests run in CI only. Some features (CDP-based throttling, real a11y tree) are Chromium-only by design.

**Won't fix** (already accurate):
- The supplementary a11y "small-text" rule maps to WCAG 1.4.4 (Resize Text), not contrast. That's the corrected mapping — leaving it as-is.

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

Tool count: **25 → 43**. Binaries: **2 → 5**. Tests: **0 → 158**.

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
