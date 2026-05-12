# WebMobAI User Manual

WebMobAI is an end-to-end web testing framework. This manual covers everything you need to install, run, and use the project — whether you're driving it interactively, scripting it with scenarios, or asking Claude to compose tests for you.

For an architectural map of what's shipped, see [FEATURES.md](./FEATURES.md). For contributing, see [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Table of contents

1. [Install](#1-install)
2. [The five binaries](#2-the-five-binaries)
3. [Five-minute quick start](#3-five-minute-quick-start)
4. [Workflows by job](#4-workflows-by-job)
5. [Scenario file format](#5-scenario-file-format)
6. [Suite file format](#6-suite-file-format)
7. [MCP tool reference](#7-mcp-tool-reference)
8. [Reports and artifacts](#8-reports-and-artifacts)
9. [Configuration reference](#9-configuration-reference)
10. [CI integration](#10-ci-integration)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Install

### Prerequisites
- **Node.js 18+** on your PATH
- **Chromium** is auto-downloaded on first run (~170MB). Firefox + WebKit only when you launch them.

### Option A — npm (recommended for CLI users)

```bash
npm install -g webmobai-mcp
```

This installs all five binaries: `webmobai-mcp`, `webmobai-test`, `webmobai-scenario`, `webmobai-suite`, `webmobai-codegen`.

### Option B — Desktop app (point-and-click)

Download the latest `.dmg` from [Releases](https://github.com/celikgo/webmobai/releases). Drag to Applications. The app bundles the MCP server, so you only need Node.js installed.

> ⚠️ **First-launch Gatekeeper warning** ("WebMobAI is damaged and can't be opened"). The current releases are not yet signed or notarized, so macOS quarantines them. The app is fine — strip the quarantine flag once:
> ```bash
> xattr -cr /Applications/WebMobAI.app
> ```
> See [Troubleshooting → macOS says the app is damaged](#macos-says-the-app-is-damaged) for details.

### Option C — From source

```bash
git clone https://github.com/celikgo/webmobai.git
cd webmobai/mcp-server
npm install
npm run build
# binaries available as ./node_modules/.bin/webmobai-*
```

### Connecting Claude

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "webmobai": { "command": "npx", "args": ["-y", "webmobai-mcp"] }
  }
}
```

**Claude Code** (`.mcp.json` in your project root):
```json
{
  "mcpServers": {
    "webmobai": { "command": "npx", "args": ["-y", "webmobai-mcp"] }
  }
}
```

Restart Claude; the 43 `webmobai_*` tools will appear.

---

## 2. The five binaries

| Binary | What it does | When to use |
|---|---|---|
| `webmobai-mcp` | stdio MCP server | Connected to Claude Desktop / Claude Code |
| `webmobai-test <url>` | One-shot full audit | "Test this site once and give me a report" |
| `webmobai-scenario <file>` | Run a single JSON scenario | Scripted E2E tests you check into the repo |
| `webmobai-suite <file>` | Run a suite (many scenarios, parallel, sharded) | CI pipelines |
| `webmobai-codegen <url>` | Interactive recording → scenario JSON | "I want to write a test by clicking around" |

All four CLI binaries emit HTML + JUnit reports plus a Playwright trace per run (where applicable). All temp artifacts go under `<os.tmpdir()>/webmobai-<id>/`.

---

## 3. Five-minute quick start

### Audit a website
```bash
webmobai-test https://example.com
```
Opens a Chromium window, navigates, runs error / a11y / perf / responsive audits, crawls a few internal links, writes an HTML report. The path is printed at the end.

### Record a flow → scenario
```bash
webmobai-codegen https://example.com -o my-scenario.json
```
A browser opens. Click around. Close the window. `my-scenario.json` now contains the recorded steps.

### Replay the scenario
```bash
webmobai-scenario my-scenario.json
```

### Group scenarios into a suite, run in parallel
Create `pre-deploy.json`:
```json
{
  "name": "Pre-deploy suite",
  "scenarios": [
    { "path": "./my-scenario.json", "tags": ["smoke"] }
  ]
}
```

```bash
webmobai-suite pre-deploy.json --workers 4 --tag smoke
```

### Ask Claude to compose a test
With the MCP server connected:
> "Open https://example.com/signup, fill the form with test@example.com and Password123!, submit, and verify the welcome page loads."

Claude calls the appropriate `webmobai_*` tools in sequence.

---

## 4. Workflows by job

### Smoke test (60-second pass/fail)
```bash
webmobai-scenario smoke.json
```
With a minimal scenario:
```json
{
  "name": "Site is alive",
  "url": "https://example.com",
  "steps": [
    { "type": "assertVisible", "selector": "h1" },
    { "type": "assertText", "selector": "h1", "expected": "Welcome", "exact": false }
  ]
}
```

### Full audit with report
```bash
webmobai-test https://example.com '{"maxPages":10,"enableA11y":true,"enablePerformance":true}'
```
The second arg is a JSON SessionConfig override. See [§9](#9-configuration-reference) for fields.

### Scripted E2E with assertions
Write a scenario JSON; run with `webmobai-scenario`. The scenario format ([§5](#5-scenario-file-format)) supports clicks, typing, navigation, network mocking, visual snapshots, and five assertion types.

### Parallel CI suite with sharding
On each CI machine:
```bash
# Machine 1
webmobai-suite suite.json --shard 1/4 --workers 4
# Machine 2
webmobai-suite suite.json --shard 2/4 --workers 4
# Machine 3
webmobai-suite suite.json --shard 3/4 --workers 4
# Machine 4
webmobai-suite suite.json --shard 4/4 --workers 4
```
Each machine runs 1/4 of the suite. Use `--reporter junit` to produce JUnit XML for CI test reporting.

### Visual regression with baselines
First run captures baselines:
```bash
webmobai-scenario visual-suite.json
```
With:
```json
{
  "name": "Visual checks",
  "url": "https://example.com",
  "steps": [
    {
      "type": "visualSnapshot",
      "name": "homepage-hero",
      "baselineDir": "./visual-baselines",
      "selector": ".hero"
    }
  ]
}
```

Subsequent runs compare. On mismatch, `.actual.png` and `.diff.png` are written next to the baseline. If the change was intentional:
```json
{ "type": "visualSnapshot", "name": "homepage-hero", "updateBaseline": true }
```

Check the `visual-baselines/` directory into git so baselines version with your code.

### Track regressions across runs
History is automatically appended after each `webmobai-test` run. To check via Claude:
> "Has LCP regressed on https://example.com in the last 5 runs?"

Claude calls `webmobai_check_regressions` with the URL and reports the deltas.

### Realistic mobile performance measurement
Via Claude:
> "Measure performance on https://example.com with a mid-tier Android profile."

Claude composes:
1. `webmobai_launch_browser({ device: "Pixel 5" })`
2. `webmobai_set_network_throttle({ preset: "slow-4g" })`
3. `webmobai_set_cpu_throttle({ slowdown: 4 })`
4. `webmobai_run_perf_multi({ url, runs: 3 })`

Returns a median + p95 table for LCP/FCP/CLS/TTI/INP/TTFB.

### Compose a NL test into a scenario
Via Claude:
> "Generate a starter scenario for https://example.com/signup."

Claude calls `webmobai_generate_scenario`, which inspects the page (H1, forms with sample-value typing, nav links, CTAs) and emits a Scenario JSON. Refine and save.

---

## 5. Scenario file format

A scenario is a JSON file with `{name, url, steps[]}`. Run with `webmobai-scenario <file>`.

### Top-level fields

| Field | Type | Notes |
|---|---|---|
| `name` | string | Human-readable name; appears in reports |
| `description` | string | Optional |
| `url` | string | Starting URL; runner navigates here before step 1 |
| `viewport` | `{width, height}` | Optional; passed to launch |
| `browser` | `"chromium" \| "firefox" \| "webkit"` | Optional, default chromium |
| `device` | string | Optional Playwright device preset (e.g., `"iPhone 13"`); overrides viewport |
| `continueOnFailure` | boolean | Default false: halt on first failed step |
| `steps` | array | See verbs below |

### Step verbs

#### Navigation & interaction
```json
{ "type": "navigate", "url": "https://example.com/pricing" }
{ "type": "click", "selector": "[data-testid=submit]" }
{ "type": "type", "selector": "#email", "text": "test@example.com" }
{ "type": "select", "selector": "#country", "value": "US" }
{ "type": "press", "key": "Enter" }
{ "type": "scroll", "direction": "down", "amount": 500 }
{ "type": "wait", "selector": ".loaded", "timeoutMs": 5000 }
{ "type": "wait", "urlContains": "/welcome", "timeoutMs": 10000 }
{ "type": "screenshot", "description": "post-submit state" }
```

#### Assertions
```json
{ "type": "assertVisible", "selector": "h1", "timeoutMs": 5000 }
{ "type": "assertHidden", "selector": ".loading-spinner" }
{ "type": "assertText", "selector": "h1", "expected": "Welcome", "exact": false }
{ "type": "assertUrl", "contains": "/dashboard" }
{ "type": "assertUrl", "pattern": "^https://app\\.example\\.com/users/\\d+" }
{ "type": "assertCount", "selector": ".product-card", "expected": 12 }
```

#### Network mocking
```json
{
  "type": "route",
  "pattern": "**/api/users/*",
  "action": "fulfill",
  "status": 200,
  "body": "{\"id\":42,\"name\":\"Mocked\"}",
  "contentType": "application/json"
}
{ "type": "route", "pattern": "**/analytics/**", "action": "abort" }
```

#### Visual regression
```json
{
  "type": "visualSnapshot",
  "name": "checkout/cart-empty",
  "baselineDir": "./visual-baselines",
  "selector": ".cart",
  "maxDiffPixelRatio": 0.005
}
```

### Selector tips

- **Stable** (preferred): `[data-testid=…]`, `#id`, `[aria-label=…]`
- **Semantic**: `role=button[name="Sign Up"]`, `text=Sign Up`
- **Last resort**: CSS class selectors, `:nth-of-type`

If a selector fails, the response includes a self-healing diagnostic with ranked alternatives. Use those for retries.

### Example: signup happy path

```json
{
  "name": "Signup happy path",
  "url": "https://example.com/signup",
  "steps": [
    { "type": "assertVisible", "selector": "h1" },
    { "type": "assertText", "selector": "h1", "expected": "Create an account" },
    { "type": "type", "selector": "#email", "text": "test+e2e@example.com" },
    { "type": "type", "selector": "#password", "text": "TestPassword123!" },
    { "type": "click", "selector": "[data-testid=submit]" },
    { "type": "wait", "urlContains": "/welcome", "timeoutMs": 10000 },
    { "type": "assertText", "selector": "h1", "expected": "Welcome" },
    { "type": "visualSnapshot", "name": "welcome-page", "baselineDir": "./visual-baselines" }
  ]
}
```

---

## 6. Suite file format

A suite is a JSON file referencing one or more scenarios. Run with `webmobai-suite <file>`.

### Top-level fields

| Field | Type | Notes |
|---|---|---|
| `name` | string | Suite name; appears in aggregate report |
| `description` | string | Optional |
| `defaults` | object | Per-scenario overrides for browser/viewport/device/continueOnFailure |
| `scenarios` | array | Entries — see below |

### Entry shapes

**Path-based** (most common — load from a separate file):
```json
{ "path": "./scenarios/login.json", "tags": ["smoke", "auth"] }
```
Paths are resolved relative to the suite file's directory.

**Inline**:
```json
{
  "scenario": { "name": "smoke", "url": "https://example.com", "steps": [...] },
  "tags": ["smoke"]
}
```

### CLI flags

| Flag | Default | Notes |
|---|---|---|
| `--workers N` | `min(4, cpus)` | Concurrent scenario count |
| `--shard k/n` | none | 1-based; e.g., `--shard 1/4` |
| `--tag T` | none (repeatable) | Include only scenarios with this tag (OR) |
| `--exclude-tag T` | none (repeatable) | Drop scenarios with this tag; wins over include |
| `--reporter R` | `both` | `html` \| `junit` \| `both` \| `none` |
| `--out DIR` | `cwd` | Where aggregate reports land |

### Example suite

```json
{
  "name": "Pre-deploy E2E",
  "description": "Smoke + regression suite run on every PR",
  "defaults": {
    "browser": "chromium",
    "viewport": { "width": 1280, "height": 720 }
  },
  "scenarios": [
    { "path": "./scenarios/login.json", "tags": ["smoke", "auth"] },
    { "path": "./scenarios/checkout.json", "tags": ["e2e"] },
    { "path": "./scenarios/profile-edit.json", "tags": ["e2e", "slow"] },
    {
      "scenario": {
        "name": "homepage is alive",
        "url": "https://example.com",
        "steps": [
          { "type": "assertVisible", "selector": "h1" }
        ]
      },
      "tags": ["smoke"]
    }
  ]
}
```

Run smoke only on PRs:
```bash
webmobai-suite pre-deploy.json --tag smoke
```

Run full suite nightly across 4 machines:
```bash
# Each machine
webmobai-suite pre-deploy.json --shard ${SHARD}/4 --workers 2 --exclude-tag slow
```

---

## 7. MCP tool reference

43 tools across 12 categories. Each is callable from Claude or any MCP-compatible client. Full schemas are exposed via `tools/list` on the MCP server.

### Browser control (8)
`webmobai_launch_browser`, `webmobai_navigate`, `webmobai_click`, `webmobai_type`, `webmobai_scroll`, `webmobai_screenshot`, `webmobai_set_viewport`, `webmobai_close_browser`

### Page analysis (11)
`webmobai_get_page_state`, `webmobai_get_interactive_elements`, `webmobai_get_links`, `webmobai_check_errors`, `webmobai_get_console_errors`, `webmobai_evaluate`, `webmobai_wait_for`, `webmobai_hover`, `webmobai_select_option`, `webmobai_press_key`, `webmobai_go_back`

### Accessibility (2)
`webmobai_accessibility_audit` — axe-core primary engine; `webmobai_get_accessibility_tree` — real CDP a11y tree

### Reporting (4)
`webmobai_get_performance_metrics`, `webmobai_test_responsive`, `webmobai_add_test_result`, `webmobai_generate_report`

### Assertions (5)
`webmobai_assert_visible`, `webmobai_assert_hidden`, `webmobai_assert_text`, `webmobai_assert_url`, `webmobai_assert_count`

### Request mocking (2)
`webmobai_route`, `webmobai_unroute`

### Run history (2)
`webmobai_get_run_history`, `webmobai_check_regressions`

### Scenarios (1)
`webmobai_generate_scenario` — page-inspection-based scaffold

### Visual regression (1)
`webmobai_visual_snapshot` — pixelmatch-backed pixel diff

### Performance control (3)
`webmobai_set_network_throttle`, `webmobai_set_cpu_throttle`, `webmobai_run_perf_multi`

### Audits (3)
`webmobai_security_audit` (CSP, mixed content, cookies), `webmobai_seo_audit`, `webmobai_check_broken_links`, `webmobai_pwa_audit`

### Debugging (1)
`webmobai_describe_selector` — inspect what a selector matches with zero-match hints

---

## 8. Reports and artifacts

Every CLI run produces a per-session directory under `<os.tmpdir()>/webmobai-<id>/`:

| File | What it is | When |
|---|---|---|
| `report-<ts>.html` | Self-contained HTML report | Every run |
| `junit-<ts>.xml` | JUnit XML (`<failure>`/`<skipped>` mapping) | When `--reporter` includes junit |
| `trace.zip` | Playwright trace | Every run (open at https://trace.playwright.dev) |
| `screenshots/screenshot-*.png` | All captured screenshots | Every run |
| `recordings/*.webm` | Session video | When `enableVideo: true` |
| `visual-baselines/` | Pixel-diff baselines | When you use `webmobai_visual_snapshot` and don't override `baseline_dir` |
| `suite-<ts>.json` | Raw per-scenario suite results | `webmobai-suite` runs only |

The HTML report includes: summary counts + pass rate, per-test results grouped by category, accessibility issues by severity, Web Vitals with ratings, console errors. The Playwright trace is the gold-standard debugger — every action's DOM snapshot, network log, console log, and source location are time-travel-debuggable in the trace viewer.

History (separate from per-session artifacts): `~/.webmobai/history.json` — append-only with a 200-entry cap, used by `webmobai_check_regressions`.

---

## 9. Configuration reference

### SessionConfig (`webmobai-test` and the desktop app)

The second arg to `webmobai-test` is a JSON SessionConfig:

```json
{
  "viewport": { "width": 1280, "height": 720 },
  "credentials": { "username": "test@example.com", "password": "..." },
  "maxPages": 5,
  "enableVideo": true,
  "enableA11y": true,
  "enablePerformance": true,
  "enableVisualRegression": false,
  "responsiveBreakpoints": [
    { "name": "Mobile", "width": 375, "height": 812 },
    { "name": "Tablet", "width": 768, "height": 1024 },
    { "name": "Desktop", "width": 1280, "height": 720 }
  ]
}
```

If `credentials` is present, the runner auto-detects email/password inputs on the landing page and submits before continuing. For login on a separate URL, point `--url` at that page.

### Network presets

| Preset | Latency | Download | Upload |
|---|---|---|---|
| `slow-3g` | 2000ms | 500 Kbps | 500 Kbps |
| `fast-3g` | 562ms | 1.5 Mbps | 750 Kbps |
| `slow-4g` | 400ms | 4 Mbps | 3 Mbps |
| `offline` | — | 0 | 0 |

Numbers match Chrome DevTools' built-in presets. Set via `webmobai_set_network_throttle` from Claude or before measurement in a scenario.

### CPU throttling

`webmobai_set_cpu_throttle({ slowdown: 4 })` — quarter-speed JS execution, mirroring Lighthouse's mobile profile. Chromium-only.

### Visual regression tolerances

| Option | Default | What it controls |
|---|---|---|
| `threshold` | 0.2 | Per-pixel color sensitivity (0 = exact, 1 = any) |
| `max_diff_pixels` | unset | Absolute cap on differing pixels |
| `max_diff_pixel_ratio` | 0.01 | Proportional cap (1% of pixels) |

---

## 10. CI integration

### GitHub Actions

```yaml
name: E2E
on: [push, pull_request]
jobs:
  e2e:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm install -g webmobai-mcp
      - run: npx playwright install --with-deps chromium firefox webkit
      - name: Run E2E suite (shard ${{ matrix.shard }}/4)
        run: webmobai-suite ./e2e/suite.json --shard ${{ matrix.shard }}/4 --workers 2 --out ./reports
      - name: Upload reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: reports-shard-${{ matrix.shard }}
          path: ./reports/
      - name: Publish JUnit results
        if: always()
        uses: dorny/test-reporter@v1
        with:
          name: E2E shard ${{ matrix.shard }}
          path: ./reports/junit-*.xml
          reporter: java-junit
```

The JUnit XML maps `fail → <failure>` and `warning → <skipped>` so warnings don't break CI; the dorny/test-reporter step renders results inline on the PR.

### GitLab CI

```yaml
e2e:
  parallel: 4
  image: mcr.microsoft.com/playwright:v1.52.0
  script:
    - npm install -g webmobai-mcp
    - webmobai-suite ./e2e/suite.json --shard ${CI_NODE_INDEX}/${CI_NODE_TOTAL} --workers 2
  artifacts:
    when: always
    reports:
      junit: ./junit-*.xml
    paths:
      - ./report-*.html
      - ./trace.zip
```

---

## 11. Troubleshooting

### "Browser is not launched. Call webmobai_launch_browser first."
The page-analysis, assertion, audit, and reporting tools require an active browser. Call `webmobai_launch_browser` first. History tools (`webmobai_get_run_history`, `webmobai_check_regressions`) don't need a browser.

### Selectors are matching too many elements
Run `webmobai_describe_selector` to see what's matching and the recommended tightening.

### "Node.js 18+ is required" from the desktop app
Install Node.js from https://nodejs.org and restart the app. The desktop app spawns the runner via `node`.

### macOS says the app is damaged
"WebMobAI is damaged and can't be opened. You should move it to the Trash." The DMG isn't actually damaged — current releases aren't signed or notarized, so Gatekeeper rejects them. Either:

```bash
# Option 1: strip quarantine from the installed app
xattr -cr /Applications/WebMobAI.app

# Option 2: strip from the DMG before installing
xattr -cr ~/Downloads/WebMobAI_*.dmg
```

You can verify the quarantine flag with `xattr -l /Applications/WebMobAI.app` — `com.apple.quarantine` should be absent after the fix.

Signed/notarized releases are the long-term fix; see [CONTRIBUTING.md → Releasing a signed build](./CONTRIBUTING.md#releasing-a-signed-and-notarized-macos-build).

### Visual snapshot fails on a small intentional change
Increase `max_diff_pixel_ratio` (e.g., `0.02` = 2% tolerance) or `threshold` (e.g., `0.3` for less sensitive per-pixel comparison). If the change is intentional, re-run with `update_baseline: true`.

### Tests run serially despite `--workers N`
Each scenario spawns its own browser. If your scenarios share a stateful backend that doesn't tolerate concurrent runs, reduce `--workers`. Each worker is a separate isolated browser context.

### CSP errors in axe-core injection
The a11y audit injects axe-core via Playwright. Sites with strict CSP (`default-src 'self'`) may block the injection. The audit falls back to the hand-rolled supplementary ruleset with a warning in the log.

### Mobile emulation reports 980px width
Pages without `<meta name="viewport" content="width=device-width">` fall back to Chromium's 980px legacy mobile viewport. Page is being emulated correctly; the page itself isn't responsive. Use `page.viewportSize()` (already what Playwright reports internally) to confirm the emulated viewport.

### Self-healing keeps suggesting the same wrong selector
Snapshots are recorded after every successful action. If your initial selector matched the wrong element, the snapshot is of the wrong element too. Clear by restarting the browser (`webmobai_close_browser` + `webmobai_launch_browser`).

### "Tracing failed to start"
Tracing requires browser-context permissions that are usually fine. If it fails (rare), the run continues without a trace; check the log for the reason.

### A test passes locally but fails in CI
Common causes:
1. **Timing**: animations or async loads are slower in CI. Add `webmobai_wait_for` on a stable selector before assertions.
2. **Viewport**: CI's default may differ. Set viewport explicitly in the scenario.
3. **Locale**: CI may default to a different locale than your dev machine. Set explicitly via the launch.
4. **Fonts**: CI may not have the same fonts, affecting visual regression. Allow more tolerance or check baselines into git from a CI-generated source of truth.

### "Chromium not installed" on the desktop app
The auto-test runner installs Chromium on first launch. If it failed, check the console for the install command output. You can also install manually:
```bash
npx playwright install chromium
```

---

## Further reading

- [README.md](./README.md) — project front door, install paths
- [FEATURES.md](./FEATURES.md) — feature inventory, roadmap, version history
- [CONTRIBUTING.md](./CONTRIBUTING.md) — development setup, contributing guidelines
- [Playwright trace viewer](https://trace.playwright.dev) — drop trace.zip to time-travel-debug a run
- [axe-core rules](https://dequeuniversity.com/rules/axe/4.10) — the a11y rule set used in our audits
- [Core Web Vitals](https://web.dev/articles/vitals) — LCP / FCP / CLS / INP / TTFB definitions and thresholds
