# WebMobAI

**AI-leveraged end-to-end web testing framework**, powered by Playwright (Chromium / Firefox / WebKit) + Claude AI.

WebMobAI gives you four ways to test the same browser engine:

1. **Desktop app** — enter a URL, click Test, get a report
2. **Standalone CLI** — `webmobai-test`, `webmobai-scenario`, `webmobai-suite`, `webmobai-codegen`, `webmobai-monitor`, `webmobai-doctor`
3. **Scripted scenarios** — JSON files with assertions, network mocking, visual snapshots
4. **AI-driven via MCP** — Claude calls 51 tools to compose tests in natural language

The distinctive feature is **self-healing selectors**: when a `[data-testid=submit]` stops matching (because someone renamed the testid), the tool response includes the prior element fingerprint, ranked candidate replacements, and the page-state triage — so an AI client retries with a smarter selector instead of failing the test.

That is a deliberate design choice rather than a feature, and it is measured, not asserted: on a corpus of 18 real-world selector breakages the top-ranked suggestion recovers **86.7%** of broken selectors on the first retry (93.3% within the top three), and the eval runs in CI on every push. [**docs/DESIGNED_FOR_AGENTS.md**](./docs/DESIGNED_FOR_AGENTS.md) explains the principle, shows a real failure-and-retry transcript, and is candid about the three cases it still gets wrong.

---

## Documentation

| Document | Read this when |
|---|---|
| [USER_MANUAL.md](./USER_MANUAL.md) | You want the end-to-end walkthrough: install, every binary, every flag, the full MCP tool reference, artifact layout. |
| [USER_MANUAL.md §7](./USER_MANUAL.md#7-mcp-tool-reference) | You need the per-tool reference — all 51 tools, their parameters, defaults, and which ones need a launched browser. |
| [docs/SCENARIO_FORMAT.md](./docs/SCENARIO_FORMAT.md) | You are hand-writing or reviewing a scenario / suite JSON and need the canonical field list and step verbs. |
| [docs/AUTHENTICATION.md](./docs/AUTHENTICATION.md) | The thing you want to test sits behind a login — capturing, replaying, and rotating a `storageState` session. |
| [docs/CI.md](./docs/CI.md) | You are wiring WebMobAI into GitHub Actions / GitLab CI — sharding, workers, JUnit, artifacts, exit codes. |
| [docs/DESIGNED_FOR_AGENTS.md](./docs/DESIGNED_FOR_AGENTS.md) | You want the design principle behind the tool responses — what a selector miss returns, why a ranked candidate list lets a model recover on its own, and the measured recovery rate. |
| [SECURITY.md](./SECURITY.md) | You are testing behind a login and need to know how `storageState` session files are stored, why they must never be committed, and the vulnerability disclosure path. |
| [FEATURES.md](./FEATURES.md) | You want the capability inventory, what is deliberately out of scope, and the sprint-by-sprint history. |
| [ROADMAP.md](./ROADMAP.md) | You want to know what is planned next and what was already delivered. |
| [CHANGELOG.md](./CHANGELOG.md) | You are upgrading and need to know exactly what changed in a release. |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | You are adding an MCP tool, a scenario step type, or a skill — plus the dev setup and release checklist. |
| [.claude/skills/README.md](./.claude/skills/README.md) | You use Claude Code and want the 20 packaged testing workflows and the conventions they share. |
| [mcp-server/README.md](./mcp-server/README.md) | You installed the npm package `webmobai-mcp` and want the package-level quick reference. |
| [docs/README.md](./docs/README.md) | You want the full documentation index — every file in the repo, listed once, with the question it answers. |

---

## What's in the box

| Capability | Tool / CLI |
|---|---|
| Run a full audit on a URL | `webmobai-test <url>` |
| Run a JSON test scenario | `webmobai-scenario <file> [--storage-state auth.json]` |
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
| JUnit XML for CI integration | Always on `webmobai-test` / `webmobai-scenario`; on `webmobai-suite` when `--reporter` is `junit` or `both` (default) |
| Selector inspector | `webmobai_describe_selector` |
| **AI** (opt-in via `WEBMOBAI_ANTHROPIC_API_KEY`): visual-diff narration, executive audit summary, NL → scenario | `webmobai_explain_visual_diff`, `webmobai_summarize_audit`, `webmobai_generate_scenario_from_prompt` |
| **Lighthouse** official scores (opt-dep) | `webmobai_lighthouse_audit` |
| **Visual baseline history** — archive on overwrite, list, restore | `webmobai_visual_baseline_list_versions`, `webmobai_visual_baseline_restore_version` |
| **PDF report** alongside the HTML one | `webmobai-test` runs only; `Open PDF` button in the desktop app |
| **Scheduled / monitor mode** (Sprint 17) | `webmobai-monitor <url> --interval=5m --alert-webhook=<url>` |
| **Trend dashboard** + this-run-vs-historical-median comparison | Desktop **Monitors** tab (inline-SVG sparklines); the comparison is embedded in `webmobai-test` reports once a URL has ≥2 prior runs |
| **Authenticated sessions** (Sprint 18) — test behind a login by replaying a saved session | `webmobai_save_storage_state`; `storage_state_path` on launch; `--storage-state auth.json` on `webmobai-scenario` / `-suite`; `storageState` in a scenario or suite `defaults` |
| **Manual-step pause** for MFA/CAPTCHA — headed runs only | `pauseForManual` scenario step (a no-op in headless, and both scenario CLIs are headless — capture over MCP instead, see below) |
| **Preflight environment check** (Sprint 18) | `webmobai-doctor [--storage-state auth.json]` |
| **20 Claude Code skills** — packaged testing workflows | [`.claude/skills/`](./.claude/skills/README.md) |

**51 MCP tools** across 16 tool files, **7 binaries**, **219 tests** in 27 files, **20 Claude Code skills**. CI installs Chromium + Firefox + WebKit and runs the full suite on every push.

---

## Quick Start

> **If anything misbehaves, run `webmobai-doctor` first.** It checks your Node version, which Playwright engines are installed (and prints the exact install command for the missing ones), whether the optional Lighthouse dependency and the AI key are present, and — with `--storage-state auth.json` — whether a saved login is still valid. Exit 0 means nothing is broken; warnings are optional features, not failures.

### Option 1: Desktop App (Easiest)

**Requires** [Node.js 18+](https://nodejs.org) on your PATH (the app spawns the test runner via `node`). The first time you click **Test**, the app downloads Chromium (~170MB, one-time).

1. Download the latest `.dmg` from [Releases](https://github.com/celikgo/webmobai/releases)
2. Open the `.dmg` and drag WebMobAI to Applications
3. **Remove the quarantine flag** (one-time, see note below), then launch WebMobAI
4. Enter a URL (e.g., `https://example.com`) and click **Test**
5. A Chromium browser opens and testing runs automatically

> ⚠️ **macOS says "WebMobAI is damaged and can't be opened"?**
> The current releases are **not yet code-signed or notarized**, so macOS Gatekeeper blocks them. The app isn't damaged — strip the quarantine attribute once and it opens normally:
> ```bash
> xattr -cr /Applications/WebMobAI.app
> ```
> (or run `xattr -cr ~/Downloads/WebMobAI_*.dmg` before installing). Signed/notarized releases are tracked in [CONTRIBUTING.md → Releasing a signed build](CONTRIBUTING.md#releasing-a-signed-and-notarized-macos-build).

### Option 2: CLI (npm)

```bash
npm install -g webmobai-mcp

webmobai-doctor                                    # preflight — run this first
webmobai-test https://example.com                  # one-shot full audit (headed)
webmobai-scenario ./scenarios/login.json           # run a scripted scenario (headless)
webmobai-suite ./suite.json --workers 4 --tag smoke   # parallel CI suite
webmobai-codegen https://example.com -o test.json  # record a flow interactively
webmobai-monitor https://example.com --interval=5m # recurring runs + regression alerts
```

Exit codes: `0` pass, `1` a scenario/suite step failed or a fatal error, `2` a usage error. `webmobai-test` exits 0 even when checks fail — gate CI on `webmobai-scenario` / `webmobai-suite` instead. See [docs/CI.md](./docs/CI.md).

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

Suite-level HTML + JUnit reports are written into `--out` (default: cwd) for downstream CI consumption. Give every shard the *same* `--tag` flags — filtering happens before sharding, so mismatched filters make shards overlap or skip. A `--tag` that matches zero of a non-empty suite is a hard exit 2, not a silent green; pass `--allow-empty` only when an empty selection is genuinely expected.

## Example: testing behind a login

Capture the session **once** in a visible browser, then replay it everywhere. Capture over MCP, because a human can complete MFA / CAPTCHA / SSO in the window between two tool calls:

```
webmobai_launch_browser      { "headless": false }
webmobai_navigate            { "url": "https://app.example.com/login" }
webmobai_type                { "selector": "#email",    "text": "qa@example.com" }
webmobai_type                { "selector": "#password", "text": "..." }
webmobai_click               { "selector": "[data-testid=submit]" }
   ← finish MFA yourself in the open window
webmobai_save_storage_state  { "path": "auth.json" }
webmobai_close_browser
```

Replay it from anywhere:

```bash
webmobai-doctor --storage-state auth.json                        # still valid?
webmobai-scenario ./scenarios/checkout.json --storage-state auth.json
webmobai-suite ./e2e/suite.json --storage-state auth.json --workers 4
```

…or over MCP with `webmobai_launch_browser { "storage_state_path": "auth.json" }`, or declaratively with `"storageState": "auth.json"` at the top of a scenario / in a suite's `defaults`.

Two things to know. **Precedence differs between the runners:** on `webmobai-scenario` the `--storage-state` flag overrides the scenario's own field; on `webmobai-suite` it only fills in scenarios that set nothing. And **`auth.json` is a credential** — it holds live cookies and localStorage in plaintext. The repo `.gitignore` covers `auth.json`, `*.auth.json`, and `*storage-state*.json`, but nothing else; traces and videos from the authenticated run also contain the session and are not redacted. `sessionStorage` and IndexedDB are not captured at all.

Full guide: [docs/AUTHENTICATION.md](./docs/AUTHENTICATION.md).

## Claude Code skills

[`.claude/skills/`](./.claude/skills/README.md) holds **20 packaged testing workflows** that Claude Code loads on demand — a smoke test, a full QA pass, site exploration, accessibility / performance / security / SEO / PWA / Lighthouse audits, responsive-breakpoint checks, visual regression, form and flow verification, error-state simulation, selector debugging, scenario authoring, regression monitoring, authenticated-session testing, CI suite runs, and WebMobAI setup troubleshooting.

Each skill is a `SKILL.md` describing when to use it, which of the 51 MCP tools it drives, and what it produces. Claude picks one up when your prompt matches its triggers — you don't invoke them by name. See [.claude/skills/README.md](./.claude/skills/README.md) for the full index and the conventions they share.

---

## Tech stack

| Component | Technology |
|---|---|
| Desktop app | [Tauri 2.0](https://tauri.app) (Rust + WebView) |
| Frontend | React 19, TypeScript, Tailwind CSS v4, Zustand |
| MCP server | [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) |
| Browser engine | [Playwright](https://playwright.dev) (Chromium / Firefox / WebKit) |
| A11y engine | [axe-core](https://github.com/dequelabs/axe-core) via `@axe-core/playwright` |
| Pixel diff | [pixelmatch](https://github.com/mapbox/pixelmatch) + [pngjs](https://github.com/lukeapage/pngjs) |
| Build / test | Vite 6 (frontend), TypeScript 5.7, Vitest 4 |

## Architecture

```
webmobai/
├── src/                    # React frontend (Tauri webview)
├── src-tauri/              # Tauri Rust backend
├── docs/                   # README (index), SCENARIO_FORMAT, AUTHENTICATION, CI
├── .claude/skills/         # 20 Claude Code skills + their shared README
├── mcp-server/             # MCP server + CLI binaries (npm: webmobai-mcp)
│   ├── src/
│   │   ├── index.ts                webmobai-mcp entrypoint (stdio transport)
│   │   ├── server.ts               table-driven tool dispatcher (requiresBrowser per group)
│   │   ├── auto-test.ts            webmobai-test CLI
│   │   ├── scenario-cli.ts         webmobai-scenario CLI
│   │   ├── suite-cli.ts            webmobai-suite CLI
│   │   ├── codegen-cli.ts          webmobai-codegen CLI
│   │   ├── monitor-cli.ts          webmobai-monitor CLI (Sprint 17)
│   │   ├── doctor-cli.ts           webmobai-doctor CLI (Sprint 18)
│   │   ├── run-config.ts           SessionConfig parser
│   │   ├── types.ts                shared result / report types
│   │   ├── tools/                  16 MCP tool files (51 tools)
│   │   ├── playwright/             browser-manager, page-analyzer, element-snapshot
│   │   ├── scenario/               types, runner, scaffolder
│   │   ├── suite/                  types, loader, filter, runner
│   │   ├── visual/                 comparator, baseline-store
│   │   ├── ai/                     client, config, audit-summarizer, visual-narrator,
│   │   │                           scenario-generator (opt-in, needs the API key)
│   │   ├── perf/                   lighthouse.ts (optional dependency)
│   │   └── utils/                  report-generator, junit-generator, run-history,
│   │                               failure-triage, ensure-browsers, logger
│   └── test/                       219 tests across 27 files
└── ...
```

## Requirements

- **macOS** 12+ (other OSes work for the CLI; desktop app currently macOS-only via CI)
- **Node.js** 18+ for the CLI and the desktop app's runner
- Chromium installed by Playwright automatically on first launch; Firefox / WebKit on first use of each
- Optional: `npm install lighthouse chrome-launcher` for `webmobai_lighthouse_audit`
- Optional: `WEBMOBAI_ANTHROPIC_API_KEY` for the three AI tools (`WEBMOBAI_AI_MODEL` defaults to `claude-opus-4-8`)

`webmobai-doctor` checks all of the above in one command.

## License

MIT License. See [LICENSE](LICENSE).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and how to add an MCP tool. Adding a scenario step type means editing `mcp-server/src/scenario/types.ts` + `scenario/runner.ts` + [docs/SCENARIO_FORMAT.md](./docs/SCENARIO_FORMAT.md); adding a Claude Code skill is documented in [.claude/skills/README.md](./.claude/skills/README.md).
