# Features

WebMobAI is an **autonomous exploratory web QA tool** — a hybrid between a traditional E2E framework and an AI-driven auditing tool. It opens a real Chromium browser, navigates a target site, and runs a battery of inspections (accessibility, performance, responsive, content) without the user having to write test scripts.

This file is the contract: **what we ship today**, **what a complete end-to-end web testing tool should ship**, and **what's intentionally out of scope**. Use it to scope roadmap work, triage feature requests, and decide whether an external tool (Playwright Test, Lighthouse, Percy, axe DevTools) is the better answer than building it here.

---

## 1. Positioning

Two consumer paths share one engine:

1. **Standalone desktop app** — user enters a URL, clicks Test, watches results stream in.
2. **AI-driven via MCP** — Claude (or any MCP-compatible agent) calls 25 tools to explore, interact, audit, and report.

The shared engine is built on **Playwright (Chromium)** + a thin server (`mcp-server/`) that exposes Playwright actions as MCP tools and as an `auto-test` CLI.

The tool's superpower is **exploration without script authoring**. The tradeoff is that it does **not** replace a script-driven E2E framework when you need deterministic regression suites tied to specific assertions.

---

## 2. Included today

Each subsection lists what's shipped, the relevant code path, and any caveats discovered during implementation that users should know about.

### 2.1 Browser automation

| Capability | Tool / API | Notes |
|---|---|---|
| Launch isolated Chromium (fresh profile, no cookies/extensions) | `webmobai_launch_browser` | Headed by default; headless via flag. First run downloads Chromium (~170MB) on demand. |
| Navigation (URL load with `domcontentloaded` + `networkidle`) | `webmobai_navigate` | 30s timeout, soft-fails on network-idle timeout for long-polling sites. |
| Click by selector | `webmobai_click` | Supports CSS and Playwright selectors (`text=…`, `role=…`, `[data-testid=…]`). |
| Type into input (clears first via `page.fill`) | `webmobai_type` | |
| Scroll up/down by pixels | `webmobai_scroll` | Waits 500ms for lazy-loaded content. |
| Hover element | `webmobai_hover` | Tests dropdowns, tooltips. |
| Select dropdown option | `webmobai_select_option` | |
| Press keyboard key | `webmobai_press_key` | Single key per call. |
| Navigate back in history | `webmobai_go_back` | |
| Capture screenshot (viewport or full-page) | `webmobai_screenshot` | Saved to `<tmp>/webmobai-<id>/screenshots/`. |
| Resize viewport | `webmobai_set_viewport` | |
| Wait for selector / URL match / timeout | `webmobai_wait_for` | |
| Run arbitrary JS in page context | `webmobai_evaluate` | Returns serializable values. |
| Close browser (preserves video) | `webmobai_close_browser` | |
| Session video recording (.webm) | Auto-enabled at launch | Disabled for perf-sensitive runs. |

### 2.2 Page analysis

| Capability | Tool / API | Notes |
|---|---|---|
| DOM structure summary (headings, links, forms, buttons, images) | `webmobai_get_page_state` | Returns markdown digest. |
| List interactive elements with selectors + positions | `webmobai_get_interactive_elements` | Filters out 0×0 hidden elements. |
| Enumerate links, internal vs external | `webmobai_get_links` | Skips `mailto:`, `javascript:`. Misses protocol-relative `//cdn.foo/x`. |
| Detect broken images and console errors | `webmobai_check_errors` | Network errors **not** tracked (see §4). |
| Stream of console errors + warnings | `webmobai_get_console_errors` | Captured via `page.on('console')` + `page.on('pageerror')`. |

### 2.3 Accessibility auditing

| Capability | Tool / API | Notes |
|---|---|---|
| Lightweight a11y audit (impact-grouped) | `webmobai_accessibility_audit` | Hand-rolled subset — **not** axe-core. See §4 for the rules covered and their bugs. |
| Accessibility tree dump | `webmobai_get_accessibility_tree` | Currently a DOM walk labeled with role/aria-label, **not** a real screen-reader tree. |

Rules covered (with WCAG mapping where applicable):
- `image-alt` — missing alt attribute (1.1.1 / A)
- `label` — form inputs missing labels (1.3.1, 3.3.2 / A)
- `button-name` — buttons with no accessible name (4.1.2 / A)
- `html-has-lang` — missing `<html lang>` (3.1.1 / A)
- `document-title` — empty `<title>` (2.4.2 / A)
- `landmark-one-main` — missing `<main>` (1.3.1 / A)
- `skip-link` — heuristic skip-nav detection (2.4.1 / A) — **buggy, see §4**
- `text-size` — flagged as color-contrast by accident — **incorrect rule mapping**

### 2.4 Performance auditing

| Capability | Tool / API | Notes |
|---|---|---|
| Web Vitals: LCP, FCP, CLS, TTFB | `webmobai_get_performance_metrics` | Read from `PerformanceObserver` + navigation timing. |
| Page load timings: DOM Content Loaded, Page Load Complete | Same tool | |
| Per-metric rating bands (Good / Needs Improvement / Poor) | `rateMetric()` in `reporting-tools.ts` | Standard Google thresholds. |
| **TTI (Time to Interactive)** | Same tool | **Always returns `null`** — long-task observer not implemented. |
| Cross-viewport perf comparison | Manual (combine `webmobai_set_viewport` + `webmobai_get_performance_metrics`) | No CPU/network throttling. |

### 2.5 Responsive testing

| Capability | Tool / API | Notes |
|---|---|---|
| Multi-breakpoint sweep with screenshots | `webmobai_test_responsive` | Default: 375×812, 768×1024, 1280×720. Configurable. |
| Horizontal-overflow detection per breakpoint | Same tool | Checks `documentElement.scrollWidth > clientWidth`. |
| Manual breakpoint testing | `webmobai_set_viewport` + screenshot | |
| CSS-pixel resolution (not device pixel) | All viewport ops | Touch events not emulated. |

### 2.6 Reporting

| Capability | Tool / API | Notes |
|---|---|---|
| HTML test report with all findings | `webmobai_generate_report` | Self-contained, embeds CSS. Written to session dir. |
| Test result accumulation per session | `webmobai_add_test_result` | Categorized: Navigation, Errors, Accessibility, Performance, Responsive, Content. |
| Pass / fail / warning counts + pass rate | Auto-computed in report | |
| Real-time action log in desktop app | Tauri shell streams stdout JSON lines | |
| Screenshot gallery (grid) in desktop app | `ScreenshotGallery.tsx` | Loads via `asset://` protocol. |
| Per-breakpoint screenshot panel | `ResponsivePanel.tsx` | Grouped by configured breakpoints. |
| Accessibility panel grouped by severity | `AccessibilityPanel.tsx` | Critical / Serious / Moderate / Minor. |
| Performance dashboard with Web Vitals + rough score | `PerformancePanel.tsx` | |
| Test report panel with pass/fail/warning summary | `TestReport.tsx` | |

### 2.7 Autonomous exploration

| Capability | Mechanism | Notes |
|---|---|---|
| Standalone auto-test runner (`webmobai-test <url>`) | `mcp-server/src/auto-test.ts` | Launches browser, navigates, audits, crawls 3 internal pages, generates report. |
| Stream actions and screenshots to UI via stdout JSON | Same | Used by desktop app's Test button. |
| Internal link discovery + auto-crawl (up to 3 pages) | Same | Hardcoded cap — `SessionConfig.maxPages` is not wired. |
| AI-driven workflows (when paired with Claude) | MCP server + 25 tools | Claude composes tool calls based on user prompt. |

### 2.8 Skills (Claude Code integration)

`.claude/skills/` contains 8 documented workflows that teach Claude how to drive the tools cohesively:
- `testing-web-app` — full audit
- `running-web-smoke-test` — fast pass/fail
- `auditing-web-accessibility` — deep a11y pass
- `auditing-web-performance` — Web Vitals
- `testing-web-responsive` — breakpoint sweep
- `testing-web-forms` — form happy-path + validation matrix
- `exploring-web-app` — site map / discovery
- `regression-web-visual` — baseline-vs-current screenshots

### 2.9 Desktop app & distribution

- **Tauri 2.0 shell** — React 19 + Vite 6 + Tailwind v4 + Zustand
- **Single-click testing** — URL bar, Test/Stop button, status badge
- **Dark / light / system theme**
- **Per-session bundle**: screenshots, recordings, HTML report, all in `<tmp>/webmobai-<id>/`
- **Distribution**: macOS `.dmg` via GitHub Releases; MCP server published as `webmobai-mcp` on npm
- **CI/CD**: GitHub Actions builds for `aarch64-apple-darwin` and `x86_64-apple-darwin`

---

## 3. Should include (gap analysis)

These are features a "complete" end-to-end web testing tool would normally have. Each entry includes an opinion on whether to **build it here**, **integrate an existing tool**, or **explicitly defer**.

### 3.1 Core E2E primitives (build / high priority)

| Feature | Why it matters | Recommended approach |
|---|---|---|
| **Test authoring API** — assertions like `expect(...)`, `toHaveText`, `toBeVisible` | Today the tool runs canned audits and records pass/fail by heuristic. Real E2E needs user-defined assertions. | Add an `assertions` MCP tool surface (`webmobai_assert_visible`, `webmobai_assert_text`, etc.) so Claude can compose assertions; for standalone, add a YAML/JS scenario file. |
| **Retry policy** for flaky assertions | Networks blip, animations stagger. Auto-retry on transient failures is table stakes. | Wrap Playwright actions with a configurable retry helper (default 3 retries, 250ms backoff). |
| **Auto-wait** beyond fixed timeouts | Playwright provides this for native locators but our `webmobai_click` uses raw selectors with a single timeout. | Switch to Playwright's `locator().click()` style throughout; emit "waiting for X" actions. |
| **Test fixtures / setup-teardown hooks** | E2E suites need a way to seed state, log in, reset DB. | Add a fixtures concept: pre-test / post-test scripts that run before/after the audit. |
| **Login state persistence** | Most real apps need an authenticated user. Today the runner ignores `SessionConfig.credentials`. | Wire `credentials` through to a login flow at session start; store the storage state and reuse. |
| **Per-test timeouts** + global timeout | Right now one stuck navigation can lock the run forever. | Surface a `--timeout` flag on `auto-test` and a global timeout in MCP. |
| **Test parameterization** | Same flow against multiple URLs / locales / accounts. | Accept an array of inputs at the CLI/MCP level; produce one report per parameter set. |

### 3.2 Browser coverage (build / medium priority)

| Feature | Why it matters | Recommended approach |
|---|---|---|
| **Firefox + WebKit** | "Works on Chrome" isn't enough. WebKit catches Safari-specific bugs (date inputs, scroll, sticky positioning). | Already free via Playwright — just expose `browser: 'firefox' \| 'webkit' \| 'chromium'` on launch. Add CI cross-browser job. |
| **Mobile device emulation** | Touch events, mobile UA, devicePixelRatio matter. Today's "responsive" mode only resizes the viewport. | Use Playwright's `devices['iPhone 12']` etc. — emulates touch + UA + DPR in one call. |
| **Headless shell** vs headed | Useful in CI for speed; current default is headed (correct for the desktop app) but no easy headless toggle in standalone mode. | Surface a `--headless` flag on the auto-test CLI. |

### 3.3 Network & request handling (build / high priority)

| Feature | Why it matters | Recommended approach |
|---|---|---|
| **Request interception / mocking** | Test error states without backend changes; freeze API responses for deterministic runs. | Expose `webmobai_route` (pattern → response/abort) wrapping `page.route()`. |
| **Network throttling** (Slow 3G, Fast 3G, Offline) | Web Vitals on a fiber connection lie about mobile reality. | Use Playwright's `client.send('Network.emulateNetworkConditions', …)` or CDP directly. |
| **Network error tracking** | Currently `checkForErrors().networkErrors` is hardcoded `[]`. Real network failures are invisible. | Add `page.on('requestfailed')` to `BrowserManager`. |
| **HAR recording** | Capture all network traffic for post-hoc inspection. | `context.routeFromHAR()` for replay, or `harPath` on context options for capture. |

### 3.4 Accessibility upgrades (build / high priority)

The current a11y audit is honest about being "lightweight" but has bugs that produce wrong findings. Worth fixing before adding scope.

| Feature | Why it matters | Recommended approach |
|---|---|---|
| **Real axe-core integration** | Today's hand-rolled rules miss most WCAG SCs and have several wrong mappings (see §4). | Inject `@axe-core/playwright` per page; treat current rules as a fast-path supplement. |
| **Correct color-contrast computation** | The "color-contrast" rule actually measures font size. WCAG 2.1 1.4.3 requires luminance ratio. | Use axe-core. Don't reimplement. |
| **Real accessibility tree** | Current "accessibility tree" is a DOM walk with `innerText` per node — wrong, noisy, double-counts text. | Use `page.accessibility.snapshot()` which returns the actual Chrome accessibility tree. |
| **Keyboard navigation testing** | Tab-through coverage, focus traps, focus visibility. | Use `page.keyboard.press('Tab')` in a loop; record `document.activeElement`; check `:focus-visible` styles. |
| **Screen-reader announcement testing** | Live region updates, error announcements. | Inspect `aria-live` regions before/after interaction; partial — full SR testing needs VoiceOver/NVDA. |
| **WCAG conformance level reporting** | "Passes WCAG AA" is a real claim users want; current report doesn't make one. | Map axe-core rule levels to WCAG conformance; surface compliance summary. |

### 3.5 Performance upgrades (build / medium priority)

| Feature | Why it matters | Recommended approach |
|---|---|---|
| **TTI computation** | Currently always `null`. | Implement via `PerformanceObserver` watching `longtask` entries; find 5s quiet window after FCP. |
| **INP (Interaction to Next Paint)** | Replaced FID in Core Web Vitals in March 2024. | Use the `event-timing` PerformanceObserver entry type. |
| **Lighthouse integration** | Industry-standard perf score plus actionable recommendations. | Spawn `lighthouse --output=json` as subprocess; merge into report. |
| **CPU/network throttling for perf runs** | Production Web Vitals come from real users on real networks. Unthrottled runs are optimistic by 2–4×. | Same CDP route as §3.3; provide "Mobile Slow 4G" preset. |
| **Multi-run statistics** | Single-run variance is ±20% on LCP. Median/p95 across N runs is what users want. | Run perf N times, aggregate; default N=3 with `--runs` override. |
| **LCP element identification** | "LCP is 3.2s" isn't actionable without knowing which element. | Already feasible — surface `entry.element.outerHTML` from the LCP observer. |

### 3.6 Visual testing (build or integrate / medium priority)

| Feature | Why it matters | Recommended approach |
|---|---|---|
| **Pixel-perfect visual regression with tolerances** | Currently `regression-web-visual` is structural only — colors, fonts, spacing changes don't trigger. | Either (a) integrate Playwright's built-in `toHaveScreenshot()` with `maxDiffPixels`, or (b) integrate Percy/Chromatic. The Playwright option keeps it in-tree. |
| **Cross-browser visual diff** | Same page, three browsers, diff. | Combine §3.2 + Playwright snapshot. |
| **Component-level visual testing** | For component libraries / design systems. | Out of scope — recommend Storybook + Chromatic. |
| **Animation freezing** | Screenshots taken mid-animation are non-deterministic. | Inject CSS to disable `animation`/`transition` before snapshotting. |

### 3.7 Test organization (build / medium priority)

| Feature | Why it matters | Recommended approach |
|---|---|---|
| **Test suites / collections** | Group related tests for the same app. | YAML/JSON suite file referencing scenario scripts. |
| **Parallelization** | A 30-test suite shouldn't run serially. | Spawn N worker processes (Playwright workers pattern). |
| **Sharding** | CI splits tests across machines. | `--shard 1/4` flag. |
| **Test filtering by tag** | `--tag=smoke`, `--tag=critical`. | Tag concept in suite file; CLI filter. |

### 3.8 Output formats (build / low priority but easy)

| Feature | Why it matters | Recommended approach |
|---|---|---|
| **JUnit XML** | Required by most CI systems for native test reporting. | Add JUnit serializer to `report-generator.ts`. |
| **JSON / NDJSON output** | Pipe to other tools. | Already emitted via stdout in standalone mode — formalize the schema. |
| **GitHub Actions step output** | `::error::`, `::warning::` for inline PR annotations. | Detect `GITHUB_ACTIONS` env, emit annotations. |
| **Slack / Teams notifications** | Notify team on failure. | Out of scope — recommend a CI step (`actions-slack`). |

### 3.9 Debugging tools (build / medium priority)

| Feature | Why it matters | Recommended approach |
|---|---|---|
| **Playwright trace files** | Time-travel debugger with DOM snapshots, network, console — gold-standard for debugging E2E flakes. | Already supported by Playwright (`tracing.start()`); just plumb through. |
| **Selector inspector** | Tell users which selector matches without trial-and-error. | Expose Playwright's `selector` inspector or build a "pick element" overlay. |
| **REPL mode** | Pause, poke at the page, resume. | Expose `--pause` flag that drops into Playwright's inspector. |
| **Recording / codegen** | Generate scenarios from a real interaction session. | Wrap Playwright's `codegen` CLI; output a YAML scenario. |

### 3.10 API testing (defer / low priority)

| Feature | Why it matters | Recommended approach |
|---|---|---|
| **Direct HTTP request testing** | Hit endpoints without a browser. | Out of scope. Users have `curl`, `httpie`, Hurl, Postman. If we ever go this way, use Playwright's `APIRequestContext`. |
| **GraphQL / WebSocket testing** | Same. | Defer. |

### 3.11 SEO & content (build / low priority)

| Feature | Why it matters | Recommended approach |
|---|---|---|
| **Meta tag validation** | Title length, description length, OG/Twitter tags, canonical URLs. | Add `webmobai_seo_audit` tool — easy. |
| **Structured data validation** | JSON-LD / microdata correctness. | Parse `<script type=application/ld+json>`; validate against schema.org. |
| **Sitemap.xml / robots.txt sanity** | Catch deploy regressions. | Fetch and parse; flag empties / disallows. |
| **Broken link crawl** | Internal 404s. | Already partially covered — extend to verify each link returns 2xx via HEAD requests. |

### 3.12 Security checks (build / low–medium priority)

| Feature | Why it matters | Recommended approach |
|---|---|---|
| **Content Security Policy validation** | Missing or weak CSP is a real risk. | Inspect response headers; flag `unsafe-inline`, `unsafe-eval`, missing `default-src`. |
| **Mixed content detection** | HTTPS pages loading HTTP resources. | Track network requests; flag scheme downgrades. |
| **Cookie attribute audit** | Missing `Secure`, `HttpOnly`, `SameSite`. | Inspect `Set-Cookie` headers. |
| **Dependency vulnerability scan** | Out of browser scope; defer to Dependabot / Snyk. |  |

### 3.13 PWA / Web App Manifest (build / low priority)

| Feature | Why it matters | Recommended approach |
|---|---|---|
| **Manifest validation** | Required for installability. | Fetch `/manifest.json`; validate fields. |
| **Service worker presence + scope** | Same. | `navigator.serviceWorker.getRegistrations()`. |
| **Offline test** | Page should render usefully offline. | Set network offline; reload; check. |

### 3.14 AI / intelligent features (differentiator)

This is where WebMobAI can beat traditional E2E tools by leaning into the AI integration.

| Feature | Why it matters | Recommended approach |
|---|---|---|
| **Self-healing selectors** | When a button moves or its class changes, the test shouldn't break. | Cache element snapshots; if selector fails, ask Claude to find the new selector by description. |
| **Natural-language scenario authoring** | "Go to the pricing page, click the Pro plan, fill the form…" → working test. | Translate prompts to MCP tool sequences via Claude. |
| **Anomaly detection across runs** | "LCP regressed 30% since last week — investigate". | Store run history; compute baselines; alert on deviation. |
| **Failure triage** | When a test fails, suggest the cause from the screenshot + console + network. | Pipe trace into Claude, ask for diagnosis. |
| **Test-case generation from a site** | Visit a site, generate a smoke-test suite that covers the obvious flows. | Crawl + heuristics → emit YAML scenario file. |
| **Visual diff explanation** | "Hero image changed from blue to green" rather than "47 pixels differ in region X". | Pipe the diff regions into a vision model. |

### 3.15 Cloud / collaboration (defer)

These belong in a hosted offering, not the OSS desktop app.

- Cloud-hosted execution
- Team accounts, run history
- Shared baselines for visual regression
- PR-comment integration
- Test result dashboards

If WebMobAI ever offers a hosted service, these become product features. Until then, they're not on the roadmap.

---

## 4. Known limitations of current features

These are bugs / incorrect behaviors in features that are already shipped. They should be fixed before adding adjacent scope.

| Feature | Issue | Severity | File |
|---|---|---|---|
| `webmobai_get_accessibility_tree` | Returns DOM walk with `innerText` per node, not a real accessibility tree. Each descendant's text repeats in parent's slice. | High | `page-analyzer.ts:8–29` |
| `webmobai_accessibility_audit` — `text-size` rule | Flags text <12px as `color-contrast` issue with a contrast `helpUrl`. Doesn't measure contrast. | High | `page-analyzer.ts:199–212` |
| `webmobai_accessibility_audit` — `skip-link` rule | Only checks the *first* anchor; any `<a href="#…">` registers as a skip link. False positives + negatives. | Medium | `page-analyzer.ts:240–253` |
| `webmobai_accessibility_audit` comment | Claims "Inject axe-core" but the implementation is hand-rolled inline checks. | Low (cosmetic) | `page-analyzer.ts:135` |
| `webmobai_check_errors` | `networkErrors: []` is hardcoded. No `page.on('requestfailed')` listener anywhere. | High | `page-analyzer.ts:331–351` and `browser-manager.ts` |
| `webmobai_get_performance_metrics` — TTI | Always returns `null`. Comment says "Would need long-task observer". | Medium | `page-analyzer.ts:302` |
| `webmobai_get_performance_metrics` — CLS | Accumulates over entire session lifetime, not just initial load. Long sessions inflate the value. | Medium | `page-analyzer.ts:293–296` |
| `webmobai_get_links` | Skips protocol-relative URLs (`//cdn.foo/x`). | Low | `page-analyzer.ts:313–329` |
| Auto-test runner | Hardcodes 3 pages explored regardless of `SessionConfig.maxPages`. | Medium | `auto-test.ts:240` |
| Auto-test runner | Ignores `SessionConfig.credentials` — auth flows can't be tested in standalone mode. | High | `auto-test.ts` (entire flow) |
| Auto-test runner | Hardcodes default breakpoints; ignores `SessionConfig.responsiveBreakpoints`. | Medium | `auto-test.ts:189–193` |
| Auto-test runner | Ignores `enableA11y`, `enablePerformance`, `enableVisualRegression` toggles. | Medium | `auto-test.ts` |
| `ScreenshotGallery` | ExternalLink and Download icon buttons have no `onClick` handlers — pure decoration. | Low | `ScreenshotGallery.tsx:50–55` |
| Sidebar version badge | Hardcoded `v1.0`; project is on `v1.1.0`. | Low | `Sidebar.tsx:98` |
| MCP server version string | Hardcoded `"1.0.0"` in `index.ts:8` and `server.ts:33`. | Low | both files |
| MCP report generation | Writes report to `process.cwd()` — for Claude Desktop spawn context, cwd is unpredictable. (Auto-test path fixed; MCP path not.) | Medium | `reporting-tools.ts:227` |

---

## 5. Out of scope

These will **not** be in WebMobAI. Users wanting them should reach for the recommended tools.

| Want | Use instead |
|---|---|
| Pixel-perfect visual regression as a service with PR comments | Percy, Chromatic, Applitools |
| Hosted cross-browser cloud execution | BrowserStack, Sauce Labs, LambdaTest |
| Native mobile app testing (iOS/Android) | Appium, Maestro, Detox |
| Load / stress testing | k6, Artillery, Locust |
| API contract testing | Pact, Schemathesis |
| Static code analysis | ESLint, SonarQube |
| Unit testing | Vitest, Jest |
| Component testing | Storybook + Chromatic, Cypress Component |
| Lighthouse perf score officially | Run `lighthouse` CLI directly; we can complement it but not replace it |
| Browser extension testing | Playwright supports this; we won't add UI for it |
| Localization translation coverage | i18n-specific tools (translation-check, react-intl-cli) |

---

## 6. Roadmap priorities (suggested)

If the project pursues becoming a more complete E2E tool, this is the order that minimizes regret:

**P0 — fix what's claimed**
1. Fix the §4 a11y rule bugs (skip-link, text-size, accessibility tree).
2. Implement network error tracking (§4 + §3.3).
3. Wire `SessionConfig` into the auto-test runner so the UI controls work (§4).
4. Implement TTI properly (§3.5 + §4).
5. Integrate axe-core (§3.4) — replaces the hand-rolled subset.

**P1 — make it real E2E**
6. Assertions API (§3.1).
7. Login state persistence (§3.1).
8. Request interception / mocking (§3.3).
9. Retry policy + per-test timeouts (§3.1).
10. Firefox + WebKit + mobile emulation (§3.2).
11. Playwright trace files (§3.9).

**P2 — leverage the AI angle**
12. Self-healing selectors (§3.14).
13. Natural-language scenarios (§3.14).
14. Failure triage by Claude (§3.14).
15. Anomaly detection across runs (§3.14).

**P3 — polish**
16. JUnit XML output (§3.8).
17. Lighthouse integration (§3.5).
18. Real visual regression via `toHaveScreenshot()` (§3.6).
19. SEO / structured data audit (§3.11).
20. CSP / mixed content audit (§3.12).

---

## 7. Feature ownership

Use this section to assign maintainers as the project grows.

| Area | Owner |
|---|---|
| Browser engine + MCP tools | _unassigned_ |
| Accessibility | _unassigned_ |
| Performance | _unassigned_ |
| Desktop app (Tauri + React) | _unassigned_ |
| AI / Claude integration | _unassigned_ |
| CI / release | _unassigned_ |
| Documentation | _unassigned_ |
