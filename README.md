# WebMobAI

**Autonomous Web QA Desktop Application** powered by Playwright + Claude AI.

WebMobAI automatically explores, tests, and audits any website through a visible browser window. Enter a URL, click **Test**, and watch as it opens an isolated Chromium browser, navigates pages, checks accessibility, measures performance, tests responsive layouts, and generates detailed HTML reports.

Works in two modes:
- **Standalone** — click Test in the desktop app and it runs a full automated audit instantly
- **AI-Driven** — connect Claude via MCP for deeper, intelligent exploratory testing

## How It Works

### Standalone Mode (No AI needed)
```
WebMobAI Desktop App ──click "Test"──> Auto-Test Runner ──Playwright──> Chromium Browser
       │                                                                      │
       └──── Real-time action log, screenshots, report <──────────────────────┘
```

1. Open WebMobAI, enter a URL, click **Test**
2. A visible Chromium browser opens and testing begins automatically
3. The app shows real-time progress: actions, screenshots, accessibility issues, performance metrics
4. An HTML test report is generated when complete

### AI-Driven Mode (Claude MCP)
```
You (Claude Desktop/Code) ──MCP──> WebMobAI MCP Server ──Playwright──> Chromium Browser
                                        │
                                        ▼
                                  Test Reports, Screenshots, Videos
```

1. Connect Claude to the WebMobAI MCP server
2. Ask: *"Launch the browser, test https://example.com, and generate a report"*
3. Claude autonomously explores, fills forms, discovers edge cases, and reports findings

## Features

### Standalone Auto-Test (one-click)
- Page load verification
- Broken image detection
- Console error monitoring
- Accessibility audit (alt text, labels, ARIA, landmarks, skip links)
- Core Web Vitals (LCP, FCP, CLS, TTI, TTFB)
- Responsive testing at mobile (375px), tablet (768px), desktop (1280px)
- Internal link exploration (auto-crawls up to 3 pages)
- HTML test report generation with all findings

### AI-Driven Testing (25 MCP Tools)
- **Browser Control** — launch, navigate, click, type, scroll, screenshot, viewport resize, close
- **Page Analysis** — DOM summary, interactive elements, links, console errors, custom JS evaluation
- **Accessibility Audit** — missing alt text, form labels, ARIA attributes, landmarks, skip links, color contrast
- **Performance Metrics** — LCP, FCP, CLS, TTI, TTFB, DOM Content Loaded, Load Complete
- **Responsive Testing** — automated testing at configurable breakpoints with screenshots
- **Report Generation** — HTML reports with test results, a11y issues, performance scores, screenshots

### Desktop App (Tauri 2.0)
- One-click testing — enter URL, click Test, watch results stream in
- Real-time action log with status indicators
- Screenshot gallery with viewport metadata
- Accessibility issues panel grouped by severity
- Performance metrics dashboard with Web Vitals ratings
- Responsive testing panel organized by breakpoint
- Session configuration (viewport, credentials, breakpoints, max pages)
- Dark/Light theme support

### Isolated Browser
- Every session uses a fresh Chromium profile (no cookies, cache, extensions)
- Never touches your real browser profiles or accounts
- Headed mode — you see the browser window live during testing
- Optional video recording of full sessions

## Quick Start

### Option 1: Desktop App (Easiest)

**Requires** [Node.js 18+](https://nodejs.org) on your PATH (the app spawns the test runner via `node`). The first time you click **Test**, the app downloads Chromium (~170MB, one-time).

1. Download the latest `.dmg` from [Releases](https://github.com/celikgo/webmobai/releases)
2. Open the `.dmg` and drag WebMobAI to Applications
3. Launch WebMobAI
4. Enter a URL (e.g., `https://example.com`) and click **Test**
5. A Chromium browser opens and testing runs automatically
6. Watch real-time results in the action log, screenshots, and report panels

### Option 2: MCP Server + Claude (AI-Driven)

Install the MCP server:

```bash
npm install -g webmobai-mcp
```

Add to your Claude configuration:

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "webmobai": {
      "command": "npx",
      "args": ["-y", "webmobai-mcp"]
    }
  }
}
```

**Claude Code** (`.mcp.json` in your project root):
```json
{
  "mcpServers": {
    "webmobai": {
      "command": "npx",
      "args": ["-y", "webmobai-mcp"]
    }
  }
}
```

Restart Claude and ask: *"Launch the browser, navigate to https://example.com, explore the site, run accessibility and performance audits, and generate a report."*

### Option 3: Build from Source

```bash
# Prerequisites
# - Node.js 18+
# - Rust (install via https://rustup.rs)
# - Tauri CLI: cargo install tauri-cli --version "^2"

git clone https://github.com/celikgo/webmobai.git
cd webmobai

# Install dependencies
npm install
cd mcp-server && npm install && npm run build && cd ..

# Install Playwright Chromium
cd mcp-server && npx playwright install chromium && cd ..

# Run in dev mode
cargo tauri dev

# Build production release
cargo tauri build
```

## MCP Tools Reference

### Browser Control

| Tool | Description |
|------|-------------|
| `webmobai_launch_browser` | Launch isolated Chromium in visible mode |
| `webmobai_navigate` | Navigate to a URL (waits for load) |
| `webmobai_click` | Click an element by CSS/Playwright selector |
| `webmobai_type` | Type text into an input field |
| `webmobai_scroll` | Scroll up or down by pixels |
| `webmobai_screenshot` | Capture viewport or full-page screenshot |
| `webmobai_set_viewport` | Change viewport dimensions |
| `webmobai_close_browser` | Close browser and save video |

### Page Analysis

| Tool | Description |
|------|-------------|
| `webmobai_get_page_state` | DOM summary: headings, links, forms, buttons, images |
| `webmobai_get_interactive_elements` | List all clickable/typeable elements with selectors |
| `webmobai_get_links` | All links (internal/external) on current page |
| `webmobai_check_errors` | Broken images, console errors, network failures |
| `webmobai_get_console_errors` | All captured console errors and warnings |
| `webmobai_evaluate` | Execute arbitrary JavaScript in page context |
| `webmobai_wait_for` | Wait for selector, URL match, or timeout |
| `webmobai_hover` | Hover over an element (test tooltips, dropdowns) |
| `webmobai_select_option` | Select from a dropdown |
| `webmobai_press_key` | Press keyboard key (Enter, Tab, Escape, etc.) |
| `webmobai_go_back` | Navigate back in history |

### Testing & Reporting

| Tool | Description |
|------|-------------|
| `webmobai_accessibility_audit` | Full a11y audit (alt text, labels, ARIA, landmarks) |
| `webmobai_get_accessibility_tree` | Screen-reader view of the page |
| `webmobai_get_performance_metrics` | Web Vitals: LCP, FCP, CLS, TTI, TTFB |
| `webmobai_test_responsive` | Test at multiple breakpoints with screenshots |
| `webmobai_add_test_result` | Record a test result for the report |
| `webmobai_generate_report` | Generate final HTML report with all data |

## Example Prompts

Once connected, try these with Claude:

```
"Launch the browser and test https://example.com — check every page, run accessibility
and performance audits, test responsive layouts, and generate a full report."

"Open https://myapp.com/login, type test@example.com into the email field and
'password123' into the password field, click Sign In, and verify the dashboard loads."

"Navigate to https://mysite.com and find all broken images, console errors, and
missing accessibility labels."

"Test https://shop.example.com at mobile (375x812), tablet (768x1024), and
desktop (1920x1080) and take screenshots at each breakpoint."
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Desktop App | [Tauri 2.0](https://tauri.app) (Rust + WebView) |
| Frontend | React 19, TypeScript, Tailwind CSS v4, Zustand |
| UI Components | shadcn/ui, Radix UI, Lucide Icons |
| MCP Server | [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk) |
| Browser Engine | [Playwright](https://playwright.dev) (Chromium) |
| Build Tool | Vite 6 |

## Architecture

```
webmobai/
├── src/                    # React frontend (Tauri webview)
│   ├── components/         # UI components (shadcn/ui)
│   ├── stores/             # Zustand state management
│   ├── types/              # TypeScript type definitions
│   └── App.tsx             # Main application shell
├── src-tauri/              # Tauri Rust backend
│   ├── src/lib.rs          # IPC commands, app state
│   └── tauri.conf.json     # Tauri configuration
├── mcp-server/             # Standalone MCP server (npm package)
│   ├── src/
│   │   ├── server.ts       # MCP server setup + tool routing
│   │   ├── tools/          # Tool implementations
│   │   │   ├── browser-tools.ts
│   │   │   ├── testing-tools.ts
│   │   │   ├── accessibility-tools.ts
│   │   │   └── reporting-tools.ts
│   │   ├── playwright/     # Browser automation
│   │   │   ├── browser-manager.ts
│   │   │   └── page-analyzer.ts
│   │   └── utils/          # Logging, report generation
│   └── package.json
└── package.json            # Root workspace
```

## Requirements

- **macOS** 12+ / **Windows** 10+ / **Linux** (for desktop app)
- **Node.js** 18+
- **Playwright Chromium** (installed automatically)
- **Claude Desktop** or **Claude Code** (for AI-driven testing)

## License

MIT License. See [LICENSE](LICENSE) for details.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.
