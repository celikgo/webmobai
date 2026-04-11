# Changelog

All notable changes to WebMobAI will be documented in this file.

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
