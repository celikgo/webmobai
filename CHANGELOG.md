# Changelog

All notable changes to WebMobAI will be documented in this file.

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
