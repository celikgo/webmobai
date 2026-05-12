# WebMobAI

**AI-leveraged end-to-end web testing framework**, powered by Playwright (Chromium / Firefox / WebKit) + Claude AI.

WebMobAI gives you four ways to test the same browser engine:

1. **Desktop app** — enter a URL, click Test, get a report
2. **Standalone CLI** — `webmobai-test`, `webmobai-scenario`, `webmobai-suite`, `webmobai-codegen`
3. **Scripted scenarios** — JSON files with assertions, network mocking, visual snapshots
4. **AI-driven via MCP** — Claude calls 43 tools to compose tests in natural language

The distinctive feature is **self-healing selectors**: when a `[data-testid=submit]` stops matching (because someone renamed the testid), the tool response includes the prior element fingerprint, ranked candidate replacements, and the page-state triage — so an AI client retries with a smarter selector instead of failing the test.

📘 **Full documentation**: [USER_MANUAL.md](./USER_MANUAL.md) &nbsp;·&nbsp; [FEATURES.md](./FEATURES.md) &nbsp;·&nbsp; [CONTRIBUTING.md](./CONTRIBUTING.md)

---

## What's in the box

| Capability | Tool / CLI |
|---|---|
| Run a full audit on a URL | `webmobai-test <url>` |
| Run a JSON test scenario | `webmobai-scenario <file>` |
| Run a parallel suite (sharding, tag filters) | `webmobai-suite <file> --workers 4 --shard 1/4 --tag smoke` |
| Record interactions → scenario | `webmobai-codegen <url> -o test.json` |
| MCP server for Claude | `webmobai-mcp` |
| 5 assertion verbs with auto-wait | `webmobai_assert_visible`, `_text`, `_url`, `_count`, `_hidden` |
| Request interception / mocking | `webmobai_route`, `webmobai_unroute` |
| Pixel-perfect visual regression | `webmobai_visual_snapshot` + scenario step |
| Multi-browser (Chromium / Firefox / WebKit) | `webmobai_launch_browser { browser: "firefox" }` |
| Mobile device emulation | `webmobai_launch_browser { device: "iPhone 13" }` |
| Web Vitals: LCP / FCP / CLS / TTI / **INP** / TTFB | `webmobai_get_performance_metrics`, `webmobai_run_perf_multi` |
| Network + CPU throttling | `webmobai_set_network_throttle`, `_cpu_throttle` |
| A11y audit (axe-core) | `webmobai_accessibility_audit` |
| Security audit (CSP, mixed content, cookies) | `webmobai_security_audit` |
| SEO audit + broken-link crawl | `webmobai_seo_audit`, `_check_broken_links` |
| PWA audit (manifest, SW, offline) | `webmobai_pwa_audit` |
| Run history + regression detection | `webmobai_get_run_history`, `_check_regressions` |
| Playwright traces for time-travel debugging | Auto-captured to `<session>/trace.zip` |
| JUnit XML for CI integration | Auto-emitted alongside HTML |
| Selector inspector | `webmobai_describe_selector` |

**43 MCP tools**, **5 binaries**, **158 tests**, and the test surface stays green on Chromium + Firefox + WebKit via CI.

---

## Quick Start

### Option 1: Desktop App (Easiest)

**Requires** [Node.js 18+](https://nodejs.org) on your PATH (the app spawns the test runner via `node`). The first time you click **Test**, the app downloads Chromium (~170MB, one-time).

1. Download the latest `.dmg` from [Releases](https://github.com/celikgo/webmobai/releases)
2. Open the `.dmg` and drag WebMobAI to Applications
3. Launch WebMobAI
4. Enter a URL (e.g., `https://example.com`) and click **Test**
5. A Chromium browser opens and testing runs automatically

### Option 2: CLI (npm)

```bash
npm install -g webmobai-mcp

webmobai-test https://example.com                  # one-shot full audit
webmobai-scenario ./scenarios/login.json           # run a scripted scenario
webmobai-suite ./suite.json --workers 4 --tag smoke   # parallel CI suite
webmobai-codegen https://example.com -o test.json  # record a flow interactively
```

### Option 3: Claude (AI-Driven via MCP)

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

Restart Claude and ask:

> *"Test the signup flow at https://app.example.com — fill the form with test@example.com and Password123!, submit, verify the welcome page, then check a11y and performance."*

Claude composes the tool calls; WebMobAI executes them in a visible browser.

### Option 4: Build from Source

```bash
git clone https://github.com/celikgo/webmobai.git
cd webmobai

# MCP server + binaries
cd mcp-server && npm install && npm run build && cd ..

# Desktop app (Tauri)
npm install
cargo install tauri-cli --version "^2"  # if you don't have it
cargo tauri dev    # dev mode
cargo tauri build  # production .dmg
```

---

## Example: scripted scenario

`./scenarios/signup.json`:
```json
{
  "name": "Signup happy path",
  "url": "https://app.example.com/signup",
  "steps": [
    { "type": "assertVisible", "selector": "h1" },
    { "type": "type", "selector": "#email", "text": "test@example.com" },
    { "type": "type", "selector": "#password", "text": "TestPass123!" },
    { "type": "click", "selector": "[data-testid=submit]" },
    { "type": "wait", "urlContains": "/welcome" },
    { "type": "assertText", "selector": "h1", "expected": "Welcome" },
    { "type": "visualSnapshot", "name": "welcome", "baselineDir": "./visual-baselines" }
  ]
}
```

```bash
webmobai-scenario ./scenarios/signup.json
```

Produces an HTML report, a JUnit XML, a Playwright trace, and a visual baseline (first run) or diff (subsequent runs).

## Example: parallel CI suite

`./e2e/suite.json`:
```json
{
  "name": "Pre-deploy E2E",
  "defaults": { "browser": "chromium", "viewport": { "width": 1280, "height": 720 } },
  "scenarios": [
    { "path": "./scenarios/login.json", "tags": ["smoke", "auth"] },
    { "path": "./scenarios/signup.json", "tags": ["e2e", "auth"] },
    { "path": "./scenarios/checkout.json", "tags": ["e2e"] }
  ]
}
```

On each CI machine:
```bash
webmobai-suite ./e2e/suite.json --shard $SHARD/4 --workers 2 --tag e2e
```

Suite-level HTML + JUnit reports are written for downstream CI consumption.

---

## Tech stack

| Component | Technology |
|---|---|
| Desktop app | [Tauri 2.0](https://tauri.app) (Rust + WebView) |
| Frontend | React 19, TypeScript, Tailwind CSS v4, Zustand |
| MCP server | [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk) |
| Browser engine | [Playwright](https://playwright.dev) (Chromium / Firefox / WebKit) |
| A11y engine | [axe-core](https://github.com/dequelabs/axe-core) via `@axe-core/playwright` |
| Pixel diff | [pixelmatch](https://github.com/mapbox/pixelmatch) + [pngjs](https://github.com/lukeapage/pngjs) |
| Build / test | Vite 6 (frontend), TypeScript 5.7, Vitest 4 |

## Architecture

```
webmobai/
├── src/                    # React frontend (Tauri webview)
├── src-tauri/              # Tauri Rust backend
├── mcp-server/             # MCP server + CLI binaries (npm: webmobai-mcp)
│   ├── src/
│   │   ├── index.ts                MCP server entrypoint
│   │   ├── auto-test.ts            webmobai-test CLI
│   │   ├── scenario-cli.ts         webmobai-scenario CLI
│   │   ├── suite-cli.ts            webmobai-suite CLI
│   │   ├── codegen-cli.ts          webmobai-codegen CLI
│   │   ├── playwright/             BrowserManager, PageAnalyzer, element snapshots
│   │   ├── tools/                  11 MCP tool files (43 tools)
│   │   ├── scenario/               types, runner, scaffolder
│   │   ├── suite/                  types, loader, filter, runner
│   │   ├── visual/                 comparator, baseline-store
│   │   ├── utils/                  report generators, history, failure triage
│   │   └── run-config.ts           SessionConfig parser
│   └── test/                       158 tests across 20 files
└── .claude/skills/         # Claude Code skills for AI-driven workflows
```

## Requirements

- **macOS** 12+ (other OSes work for the CLI; desktop app currently macOS-only via CI)
- **Node.js** 18+ for the CLI and the desktop app's runner
- Chromium / Firefox / WebKit installed by Playwright automatically on first use

## License

MIT License. See [LICENSE](LICENSE).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, test guidelines, and how to add MCP tools, scenario step types, or skills.
