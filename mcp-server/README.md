# webmobai-mcp

MCP server for autonomous web QA testing. Gives Claude AI the ability to launch a visible browser, explore websites, run accessibility audits, measure Web Vitals, test responsive layouts, and generate detailed HTML test reports.

## Install

```bash
npm install -g webmobai-mcp
```

Playwright Chromium is installed automatically on first run.

## Usage with Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

Restart Claude Desktop, then ask:

> "Launch the browser, navigate to https://example.com, explore the site, run accessibility and performance audits, test responsive layouts, and generate a full test report."

## Usage with Claude Code

Add `.mcp.json` to your project root:

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

Or add via CLI:

```bash
claude mcp add webmobai npx -y webmobai-mcp
```

## Available Tools (25)

### Browser Control
| Tool | Description |
|------|-------------|
| `webmobai_launch_browser` | Launch isolated Chromium in visible mode |
| `webmobai_navigate` | Navigate to a URL |
| `webmobai_click` | Click an element |
| `webmobai_type` | Type into an input |
| `webmobai_scroll` | Scroll up/down |
| `webmobai_screenshot` | Capture screenshot |
| `webmobai_set_viewport` | Resize viewport |
| `webmobai_close_browser` | Close browser |

### Page Analysis
| Tool | Description |
|------|-------------|
| `webmobai_get_page_state` | Full DOM summary |
| `webmobai_get_interactive_elements` | All clickable elements |
| `webmobai_get_links` | Internal/external links |
| `webmobai_check_errors` | Broken images, console errors |
| `webmobai_get_console_errors` | Console error log |
| `webmobai_evaluate` | Run JavaScript |
| `webmobai_wait_for` | Wait for element/URL |
| `webmobai_hover` | Hover over element |
| `webmobai_select_option` | Select dropdown option |
| `webmobai_press_key` | Press keyboard key |
| `webmobai_go_back` | Go back in history |

### Testing & Reporting
| Tool | Description |
|------|-------------|
| `webmobai_accessibility_audit` | Full a11y audit |
| `webmobai_get_accessibility_tree` | Screen-reader tree |
| `webmobai_get_performance_metrics` | Web Vitals (LCP, FCP, CLS, TTI, TTFB) |
| `webmobai_test_responsive` | Multi-breakpoint testing |
| `webmobai_add_test_result` | Record test result |
| `webmobai_generate_report` | Generate HTML report |

## How It Works

1. Claude calls `webmobai_launch_browser` — a visible Chromium window opens
2. Claude navigates, clicks, types, scrolls — you watch it happen live
3. Claude runs audits (accessibility, performance, responsive)
4. Claude records results and generates an HTML report
5. The browser uses a fresh profile every session (no cookies, cache, extensions)

## Example Prompts

```
"Launch the browser and thoroughly test https://mysite.com — check navigation,
forms, accessibility, and performance. Generate a report when done."

"Test the login flow at https://app.example.com with email test@test.com
and password demo123. Verify the dashboard loads correctly."

"Check https://shop.example.com for accessibility issues and broken images."

"Test https://blog.example.com at mobile, tablet, and desktop sizes."
```

## Requirements

- Node.js 18+
- macOS, Windows, or Linux

## License

MIT
