# webmobai-mcp

MCP server + CLI binaries for autonomous and AI-driven web QA. Drives a real Chromium / Firefox / WebKit browser through 43 tools that cover navigation, assertions, request mocking, accessibility (axe-core), Web Vitals (including INP), visual regression (pixelmatch), security / SEO / PWA audits, run history, regression detection, and self-healing selectors.

📘 Full user manual: [USER_MANUAL.md](https://github.com/celikgo/webmobai/blob/main/USER_MANUAL.md) &nbsp;·&nbsp; capabilities + roadmap: [FEATURES.md](https://github.com/celikgo/webmobai/blob/main/FEATURES.md)

## Install

```bash
npm install -g webmobai-mcp
```

Chromium auto-downloads on first run (~170MB). Firefox + WebKit only when you launch them.

## Five binaries

| Binary | What it does |
|---|---|
| `webmobai-mcp` | stdio MCP server — exposes all 43 tools to Claude Desktop / Claude Code |
| `webmobai-test <url>` | One-shot full audit; emits HTML + JUnit + trace |
| `webmobai-scenario <file>` | Run a single JSON scenario |
| `webmobai-suite <file>` | Parallel suite runner with sharding + tag filters |
| `webmobai-codegen <url>` | Interactive recording → scenario JSON |

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

Or via CLI:
```bash
claude mcp add webmobai npx -y webmobai-mcp
```

Restart Claude, then prompt:

> *"Launch the browser, navigate to https://example.com/signup, fill the signup form with test@example.com and Password123!, submit, verify the welcome page, then check a11y and performance."*

## Available tools (43)

### Browser control (8)
| Tool | Description |
|------|-------------|
| `webmobai_launch_browser` | Launch isolated Chromium / Firefox / WebKit (visible or headless). Accepts `device` for Playwright mobile presets. |
| `webmobai_navigate` | Navigate to a URL |
| `webmobai_click` | Click by selector (records snapshot for self-healing) |
| `webmobai_type` | Fill an input (records snapshot for self-healing) |
| `webmobai_scroll` | Scroll up/down by pixels |
| `webmobai_screenshot` | Viewport or full-page screenshot |
| `webmobai_set_viewport` | Resize viewport |
| `webmobai_close_browser` | Close browser; saves video + trace |

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
| `webmobai_set_network_throttle` | slow-3g / fast-3g / slow-4g / offline |
| `webmobai_set_cpu_throttle` | Slowdown multiplier (4 = Lighthouse mobile) |

### Reporting (4)
| Tool | Description |
|------|-------------|
| `webmobai_test_responsive` | Multi-breakpoint sweep with screenshots |
| `webmobai_add_test_result` | Append a per-step result to the session report |
| `webmobai_generate_report` | Emit final HTML + JUnit + raw JSON |
| `webmobai_visual_snapshot` | Pixel-perfect visual regression (pixelmatch). First call creates baseline; subsequent calls diff. |

### Audits (4)
| Tool | Description |
|------|-------------|
| `webmobai_security_audit` | CSP, mixed content, cookie attributes |
| `webmobai_seo_audit` | Title, meta description, OG, Twitter, canonical, JSON-LD, robots.txt, sitemap.xml |
| `webmobai_check_broken_links` | HEAD-test same-origin links (capped) |
| `webmobai_pwa_audit` | Manifest, service worker, offline fallback |

### Run history (2) — don't require a launched browser
| Tool | Description |
|------|-------------|
| `webmobai_get_run_history` | List recent runs (filter by URL) from ~/.webmobai/history.json |
| `webmobai_check_regressions` | Compare current metrics to median-of-last-N for the same URL |

### Scenario authoring (1)
| Tool | Description |
|------|-------------|
| `webmobai_generate_scenario` | Inspect the current page and emit a starter Scenario JSON Claude can refine |

### Debugging (1)
| Tool | Description |
|------|-------------|
| `webmobai_describe_selector` | Inspect what a selector matches with zero-match hints |

## How it works

1. Claude (or any MCP client) calls `webmobai_launch_browser` — a visible Chromium window opens
2. Claude navigates, clicks, types, asserts, mocks requests — you watch it happen live
3. Claude runs audits (accessibility, performance, responsive, security, SEO, PWA)
4. Claude records results and generates an HTML report + JUnit XML + Playwright trace
5. Every session uses a fresh browser profile — no cookies, cache, extensions

The Playwright trace (auto-captured to `<sessionDir>/trace.zip`) opens at https://trace.playwright.dev for time-travel debugging.

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
```

## Requirements

- Node.js 18+
- macOS, Linux, or Windows

## License

MIT
