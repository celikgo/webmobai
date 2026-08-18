# webmobai-mcp

MCP server + CLI binaries for autonomous and AI-driven web QA. Drives a real Chromium / Firefox / WebKit browser through 51 tools that cover navigation, assertions, request mocking, **authenticated sessions** (save a login once, replay it everywhere), accessibility (axe-core), Web Vitals (including INP), **official Lighthouse scores**, visual regression (pixelmatch) with baseline history, security / SEO / PWA audits, run history, regression detection, self-healing selectors, and an **opt-in Claude layer** for audit summaries, visual-diff narration, and natural-language → scenario.

📘 [USER_MANUAL.md](https://github.com/celikgo/webmobai/blob/main/USER_MANUAL.md) &nbsp;·&nbsp; [FEATURES.md](https://github.com/celikgo/webmobai/blob/main/FEATURES.md) &nbsp;·&nbsp; [AUTHENTICATION.md](https://github.com/celikgo/webmobai/blob/main/docs/AUTHENTICATION.md) &nbsp;·&nbsp; [SCENARIO_FORMAT.md](https://github.com/celikgo/webmobai/blob/main/docs/SCENARIO_FORMAT.md) &nbsp;·&nbsp; [CI.md](https://github.com/celikgo/webmobai/blob/main/docs/CI.md)

## Install

```bash
npm install -g webmobai-mcp
```

Chromium auto-downloads on first launch (~170MB). Firefox + WebKit only when you launch them.

Verify the machine before you trust a run:

```bash
webmobai-doctor
```

## Seven binaries

| Binary | What it does |
|---|---|
| `webmobai-mcp` | stdio MCP server — exposes all 51 tools to Claude Desktop / Claude Code. No flags. |
| `webmobai-test <url> [config-json]` | One-shot full audit (runs **headed**); emits HTML + PDF + JUnit + trace. Exits 0 even when checks fail — don't gate CI on it. |
| `webmobai-scenario <file>` | Run a single JSON scenario headless. `--storage-state <auth.json>`, `--save-storage-state <auth.json>`. Exit 1 on a failed step. |
| `webmobai-suite <file>` | Parallel suite runner. `--workers N` (default `min(4, cpus)`), `--shard k/n`, `--tag T`, `--exclude-tag T`, `--allow-empty`, `--reporter html\|junit\|both\|none`, `--out DIR` (default cwd), `--storage-state F`. |
| `webmobai-codegen <url> [-o out.json]` | Interactive recording → scenario JSON (headed; password fields are redacted). |
| `webmobai-monitor <url> [config-json]` | Scheduled/interval monitoring. `--interval=5m` / `--interval 5m`, `--once`, `--alert-webhook=<url>`, `--config=<json>`. Regression detection + webhook alerts. |
| `webmobai-doctor` | Preflight environment check: Node version, Playwright engines, optional Lighthouse dep, AI key, and `--storage-state <auth.json>` validity/expiry. Exit 1 on a hard failure. |

Exit codes: `0` pass · `1` a scenario/suite step failed, or a fatal error · `2` usage error (missing/unknown arguments; on `webmobai-suite` also a `--tag` filter that matched 0 of a non-empty suite, unless `--allow-empty`).

## Connect to Claude

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):
```json
{
  "mcpServers": {
    "webmobai": { "command": "npx", "args": ["-y", "webmobai-mcp"] }
  }
}
```

**Claude Code**:
```json
{
  "mcpServers": {
    "webmobai": { "command": "npx", "args": ["-y", "webmobai-mcp"] }
  }
}
```

Or via CLI (the `--` separates the server command from `claude`'s own flags):
```bash
claude mcp add webmobai -- npx -y webmobai-mcp
```

Restart Claude, then prompt:

> *"Launch the browser, navigate to https://example.com/signup, fill the signup form with test@example.com and Password123!, submit, verify the welcome page, then check a11y and performance."*

### Environment variables

Optional, and the only three WebMobAI reads. Without the key, the three AI tools are silent no-ops — everything else works unchanged.

| Variable | Default | Effect |
|---|---|---|
| `WEBMOBAI_ANTHROPIC_API_KEY` | unset | Master switch for `webmobai_summarize_audit`, `webmobai_explain_visual_diff`, `webmobai_generate_scenario_from_prompt`. A whitespace-only value counts as unset. |
| `WEBMOBAI_AI_MODEL` | `claude-opus-4-8` | Model id used for AI calls. |
| `WEBMOBAI_AI_MAX_TOKENS` | `2048` | Max output tokens; a non-positive or unparseable value falls back to 2048. |

## Available tools (51)

### Browser control (9)
| Tool | Description |
|------|-------------|
| `webmobai_launch_browser` | Launch isolated Chromium / Firefox / WebKit (visible or headless). Accepts `device` for mobile presets and `storage_state_path` to start already authenticated. |
| `webmobai_navigate` | Navigate to a URL |
| `webmobai_click` | Click by selector (records snapshot for self-healing) |
| `webmobai_type` | Fill an input (records snapshot for self-healing) |
| `webmobai_scroll` | Scroll up/down by pixels |
| `webmobai_screenshot` | Viewport or full-page screenshot |
| `webmobai_set_viewport` | Resize viewport |
| `webmobai_close_browser` | Close browser; saves video + trace |
| `webmobai_save_storage_state` | Save the logged-in session (cookies + localStorage) to a storageState JSON for authenticated replay |

### Page analysis (11)
| Tool | Description |
|------|-------------|
| `webmobai_get_page_state` | DOM summary: headings, links, forms, buttons, images |
| `webmobai_get_interactive_elements` | List clickable/typeable elements with selectors + positions |
| `webmobai_get_links` | Internal / external links |
| `webmobai_check_errors` | Broken images + console errors + network failures |
| `webmobai_get_console_errors` | Captured console log |
| `webmobai_evaluate` | Run arbitrary JS in page context |
| `webmobai_wait_for` | Wait for selector, URL match, or timeout |
| `webmobai_hover` | Hover for tooltip / dropdown testing |
| `webmobai_select_option` | Select a `<select>` option |
| `webmobai_press_key` | Press a keyboard key |
| `webmobai_go_back` | Navigate back in history |

### Assertions (5) — real E2E with auto-wait
| Tool | Description |
|------|-------------|
| `webmobai_assert_visible` | Element is visible within timeout |
| `webmobai_assert_hidden` | Element absent or display:none |
| `webmobai_assert_text` | Element contains expected text (substring or exact) |
| `webmobai_assert_url` | URL contains substring or matches regex |
| `webmobai_assert_count` | Exact element count for a selector |

Failures include a self-healing diagnostic (prior snapshot + candidate replacements) and a triage bundle (URL, console errors, network errors, screenshot).

### Request mocking (2)
| Tool | Description |
|------|-------------|
| `webmobai_route` | Intercept matching requests; fulfill / abort / continue |
| `webmobai_unroute` | Remove an interception |

### Accessibility (2)
| Tool | Description |
|------|-------------|
| `webmobai_accessibility_audit` | Full audit via @axe-core/playwright (primary) + supplementary fast-path rules |
| `webmobai_get_accessibility_tree` | Real CDP accessibility tree, not a DOM walk |

### Performance (4)
| Tool | Description |
|------|-------------|
| `webmobai_get_performance_metrics` | LCP, FCP, CLS, TTI, **INP**, TTFB + LCP element fingerprint |
| `webmobai_run_perf_multi` | N-run measurement with median + p95 + min + max per metric |
| `webmobai_set_network_throttle` | `slow-3g` / `fast-3g` / `slow-4g` / `offline`; pass `null` to clear. `offline` works on every engine; the bandwidth presets are Chromium-only (CDP) and are silently ignored on Firefox / WebKit. |
| `webmobai_set_cpu_throttle` | Slowdown multiplier (4 = Lighthouse mobile); `1` or `null` clears. Chromium only. |

### Visual regression (3)
| Tool | Description |
|------|-------------|
| `webmobai_visual_snapshot` | Pixel-perfect diff (pixelmatch) of the viewport, an element, or the full page. First call (or `update_baseline: true`) writes the baseline and archives the previous one; later calls diff against `max_diff_pixels` / `max_diff_pixel_ratio` (default 0.01). |
| `webmobai_visual_baseline_list_versions` | List archived baseline versions with ISO dates and paths. Requires `name` + `baseline_dir`. No browser needed. |
| `webmobai_visual_baseline_restore_version` | Promote an archived version back to current (archiving the active one first, so the swap is reversible). Requires `name` + `baseline_dir` + `timestamp`. No browser needed. |

### Reporting (3)
| Tool | Description |
|------|-------------|
| `webmobai_test_responsive` | Multi-breakpoint sweep with screenshots + horizontal-overflow detection |
| `webmobai_add_test_result` | Append a per-step result to the session report |
| `webmobai_generate_report` | Emit final HTML + JUnit XML into the session dir (runs a fresh a11y + perf pass first) |

### Audits (4)
| Tool | Description |
|------|-------------|
| `webmobai_security_audit` | CSP directives, mixed content, cookie Secure/HttpOnly/SameSite |
| `webmobai_seo_audit` | Title, meta description, OG, Twitter, canonical, headings, JSON-LD, robots.txt, sitemap.xml |
| `webmobai_check_broken_links` | HEAD-test same-origin links (`max_links` default 50, max 100) |
| `webmobai_pwa_audit` | Manifest, service worker, HTTPS, installability; `test_offline` for an offline reload |

### Lighthouse (1) — optional dependency
| Tool | Description |
|------|-------------|
| `webmobai_lighthouse_audit` | Official Google Lighthouse Performance / Accessibility / Best Practices / SEO scores (0-100) plus the 8 lowest-scoring audits. Spawns its own headless Chrome, so no browser needs to be launched. Requires the optional `lighthouse` + `chrome-launcher` packages; without them the tool returns install instructions instead of failing. |

### Run history (2) — no browser required
| Tool | Description |
|------|-------------|
| `webmobai_get_run_history` | List recent runs (filter by URL) from `~/.webmobai/history.json` (200-entry cap) |
| `webmobai_check_regressions` | Compare the latest run to the median of the last N for the same URL |

### Scenario authoring (1)
| Tool | Description |
|------|-------------|
| `webmobai_generate_scenario` | Deterministic (non-AI) — inspect the current page and emit a starter Scenario JSON Claude can refine |

### AI (3) — opt-in via `WEBMOBAI_ANTHROPIC_API_KEY`
| Tool | Description |
|------|-------------|
| `webmobai_summarize_audit` | Prioritized executive summary of the session's results + a fresh a11y and perf pass |
| `webmobai_explain_visual_diff` | Plain-English narration of a baseline-vs-actual PNG pair, tagged cosmetic / content / structural. Reads from disk paths — no browser required. |
| `webmobai_generate_scenario_from_prompt` | Natural-language description → validated Scenario JSON, grounded in the current page's real selectors |

Without the key these three return a normal response reading `AI features are disabled. Set WEBMOBAI_ANTHROPIC_API_KEY (and optionally WEBMOBAI_AI_MODEL) to enable.` — no error, no network call.

### Debugging (1)
| Tool | Description |
|------|-------------|
| `webmobai_describe_selector` | Inspect what a selector matches: zero-match hints, or tag / id / testid / role / text / bounding box per match |

**Count check:** 9 + 11 + 5 + 2 + 2 + 4 + 3 + 3 + 4 + 1 + 2 + 1 + 3 + 1 = **51**.

Eight tools work with no browser launched: `webmobai_launch_browser`, `webmobai_close_browser`, `webmobai_get_run_history`, `webmobai_check_regressions`, `webmobai_visual_baseline_list_versions`, `webmobai_visual_baseline_restore_version`, `webmobai_lighthouse_audit`, `webmobai_explain_visual_diff`. Everything else needs a live page.

## How it works

1. Claude (or any MCP client) calls `webmobai_launch_browser` — a visible Chromium window opens
2. Claude navigates, clicks, types, asserts, mocks requests — you watch it happen live
3. Claude runs audits (accessibility, performance, responsive, security, SEO, PWA)
4. Claude records results and generates an HTML report + JUnit XML + Playwright trace
5. Every session uses a fresh browser profile — no cookies, cache, extensions — **unless** you pass `storage_state_path` to `webmobai_launch_browser`, which seeds the context from a saved logged-in session

The Playwright trace (auto-captured to `<sessionDir>/trace.zip`) opens at https://trace.playwright.dev for time-travel debugging. `<sessionDir>` is `<os.tmpdir()>/webmobai-<timestamp>-<rand>` and also holds `screenshots/`, `recordings/`, `report-<ts>.html`, and `junit-<ts>.xml`.

## Testing behind a login

Capture the session once in a visible browser (a human can finish MFA / CAPTCHA / SSO between tool calls), then replay it forever:

```
webmobai_launch_browser  { "headless": false }
webmobai_navigate        { "url": "https://app.example.com/login" }
webmobai_type            { "selector": "#email",    "text": "qa@example.com" }
webmobai_type            { "selector": "#password", "text": "..." }
webmobai_click           { "selector": "[data-testid=submit]" }
   ← complete MFA in the window that is already open
webmobai_save_storage_state { "path": "auth.json" }
webmobai_close_browser
```

Replay over MCP — close any running browser first, then:

```
webmobai_launch_browser  { "storage_state_path": "auth.json" }
```

Replay from the CLI:

```bash
webmobai-scenario ./checkout.json --storage-state auth.json
webmobai-suite    ./e2e/suite.json --storage-state auth.json --workers 4
webmobai-doctor --storage-state auth.json     # is it still valid?
```

A scenario can also carry `"storageState": "auth.json"` at the top level, and a suite can set `defaults.storageState`. Precedence differs between the two runners: on `webmobai-scenario` the `--storage-state` flag **wins** over the scenario field; on `webmobai-suite` it only fills in scenarios that set nothing (scenario field > `defaults.storageState` > flag).

`auth.json` contains live cookies and localStorage in plaintext. Add it to `.gitignore` and never commit it. Note that Playwright traces and videos captured during the authenticated run also contain the session and are not redacted. `sessionStorage` and IndexedDB are **not** captured — an app that keeps its token there cannot be replayed this way.

Full walkthrough: [docs/AUTHENTICATION.md](https://github.com/celikgo/webmobai/blob/main/docs/AUTHENTICATION.md).

## Example prompts

```
"Thoroughly test https://mysite.com — exercise navigation, forms, accessibility,
performance, and security. Generate a report when done."

"Run the login flow at https://app.example.com with test@test.com / demo123.
Verify the dashboard loads, take a pixel-perfect baseline of the welcome banner."

"Check https://shop.example.com for accessibility, SEO, and PWA. Test at
mobile (iPhone 13) and desktop. Compare LCP to the last 5 runs."

"Mock the /api/users endpoint to return a 503, click the user list, and verify
the error UI shows up."

"Generate a starter scenario for https://app.example.com/signup, then run it
across Chromium, Firefox, and WebKit."

"Log me into https://app.example.com — I'll do the MFA myself — then save the
session to auth.json and audit the dashboard for accessibility."
```

## Requirements

- **Node.js 18+** (`"engines": { "node": ">=18.0.0" }`)
- macOS, Linux, or Windows
- Playwright browser engines — Chromium self-installs on first launch; run `npx playwright install firefox webkit` if you need the other two
- Optional: `npm install lighthouse chrome-launcher` to enable `webmobai_lighthouse_audit`
- Optional: `WEBMOBAI_ANTHROPIC_API_KEY` to enable the three AI tools

Run `webmobai-doctor` to check all of the above at once.

## License

MIT
