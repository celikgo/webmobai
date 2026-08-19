---
name: testing-web-responsive
description: Use when the user wants to verify a site renders correctly at multiple viewport sizes — mobile, tablet, desktop, custom breakpoints. Captures per-breakpoint screenshots and flags layout issues like horizontal overflow. Triggers on "responsive test", "mobile test", "breakpoint test", "test on mobile", "tablet view", "does it look right on mobile", "viewport test", "responsive design check", "mobile-first audit".
---

# Testing Web Responsiveness

## Overview

This skill exercises a web page across multiple viewport sizes and reports per-breakpoint findings: screenshots, horizontal overflow flags, and a final report. It uses `webmobai_test_responsive` for the canonical sweep and adds focused interaction checks per breakpoint when the user cares about specific elements (nav, modals, forms) that often break at small widths.

**Scope**: this is a *layout* test, not a *performance* test or a *real-device* test. `webmobai_test_responsive` and `webmobai_set_viewport` resize the viewport and nothing else — no touch events (taps register as mouse clicks), no CPU or network throttling, no User-Agent change, no `devicePixelRatio` change.

If the user actually needs mobile *emulation* rather than a resize, that is a launch-time option, not part of the sweep: relaunch with `webmobai_launch_browser` and a Playwright `device` preset (`"iPhone 13"`, `"Pixel 5"`, `"iPad Pro 11"`), which applies the device's viewport, User-Agent, `isMobile`, and touch support together. The preset's viewport wins over `viewport_width`/`viewport_height`, so one device per launch — you cannot sweep breakpoints inside a device-emulated context. Throttling is separate again: `webmobai_set_network_throttle` / `webmobai_set_cpu_throttle` (Chromium-only for the bandwidth presets and CPU).

For real hardware, route the user to BrowserStack, Sauce, or a physical device.

## When to Use

- "Test responsive layout on …"
- "Does my site look right on mobile/tablet?"
- "Run a breakpoint check"
- "Find layout bugs at small widths"
- After CSS changes, especially ones touching media queries, flex/grid containers, or fixed-width components

Use `testing-web-app` if the user wants responsive *plus* other audits in one report.

## Inputs You Need

1. **URL(s)** — single page or list. Responsive issues are page-specific; pick the pages with the most CSS complexity.
2. **Breakpoints** — default trio:
   - **Mobile**: 375×812 (iPhone X size)
   - **Tablet**: 768×1024 (iPad portrait)
   - **Desktop**: 1280×720
3. **Custom breakpoints** — if the user has a design system with specific breakpoints (e.g., Tailwind's `sm:640`, `md:768`, `lg:1024`, `xl:1280`), use those instead.
4. **Auth** — see "Behind a login?" below.
5. **Interaction depth** — just screenshot each breakpoint, or also exercise nav/modals at each breakpoint? Default: screenshot only; ask if the user wants deeper interaction tests.

### Behind a login?

The pages most likely to break at 375px — dashboards, data tables, settings panels, wizards — are usually the ones behind auth. Detect it the same way as everywhere else: the final URL after `webmobai_navigate` is `/login`, or the page state is a bare login form.

Launch with `storage_state_path: "auth.json"` and run the sweep against the real page. Capture that file once via `testing-web-authenticated-sessions`. Watch for the specific failure mode here: a sweep run against a login screen produces three clean, overflow-free screenshots and a green result — the login page is trivially responsive. Confirm the final URL before reporting PASS.

## Workflow

### 1. Launch
`webmobai_launch_browser`, `headless: false` (let the user watch the reflows). Initial viewport doesn't matter — you'll change it per step.

### 2. Navigate
`webmobai_navigate` to the target URL. Wait for the page to stabilize.

### 3. Run the canonical responsive sweep
`webmobai_test_responsive` with the breakpoint list. The tool:
- Sets each viewport
- Waits 500ms for reflow
- Screenshots into the session dir (`screenshots/screenshot-<n>-<ts>.png`), captioned `"<Name> (<W>x<H>)"`
- Checks `document.documentElement.scrollWidth > clientWidth` for horizontal overflow
- Records one session result per breakpoint — `warning` when overflow was found, `pass` otherwise, under category `Responsive`
- Restores the viewport it started with when the sweep finishes

This is the lowest-effort, highest-coverage call. Always run it first. Note it records those results itself — don't duplicate them with your own `webmobai_add_test_result` for the same breakpoints.

### 4. (Optional) Deeper per-breakpoint interaction checks
If the user asked for interaction tests, do this per breakpoint. For each breakpoint:

1. `webmobai_set_viewport` to the breakpoint dimensions
2. `webmobai_wait_for` with a small timeout to let CSS settle
3. **Nav check**: if mobile, look for a hamburger toggle. `webmobai_get_interactive_elements` and find selectors that look like menu toggles. `webmobai_click` to open. Screenshot the open state. `webmobai_click` to close.
4. **Modal check**: open any primary modal (login, signup, contact). Screenshot. Look for overflow inside the modal (modals often break at narrow widths even when the page doesn't).
5. **Form check** (if forms are on the page): tab through the form (`webmobai_press_key` with `Tab`), verify each focused element is visible (`webmobai_evaluate` to check `getBoundingClientRect()`).
6. **Image check**: `webmobai_evaluate` to find any `<img>` wider than the viewport:
   ```js
   Array.from(document.images).filter(img => img.getBoundingClientRect().width > window.innerWidth)
        .map(img => ({ src: img.src, width: img.getBoundingClientRect().width }))
   ```

Record a test result per check. Categorize as `Responsive`.

### 5. Restore desktop viewport
`webmobai_set_viewport` to a desktop size (1280×720) before generating the report — screenshots in the report use whatever viewport is set when the screenshot was taken.

### 6. Report
`webmobai_generate_report`. The HTML report includes the responsive screenshots automatically. Surface the report path and the top layout issues.

### 7. Close
`webmobai_close_browser`.

## Default Breakpoints — Rationale

| Name | Width × Height | Why |
|------|----------------|-----|
| Mobile | 375 × 812 | iPhone X / 11 / 12 logical size. Most mobile traffic falls between 360 and 414 wide; 375 is the median. |
| Tablet | 768 × 1024 | iPad portrait. Where most "tablet" designs are validated. |
| Desktop | 1280 × 720 | Conservative desktop minimum. Wider than this is rare-to-find bugs in. |

Common additions to consider when the user has a strict design spec:

| Name | Width × Height | When to add |
|------|----------------|-------------|
| Extra small | 320 × 568 | iPhone SE / older Androids — if the audience skews to low-end devices |
| Mobile large | 414 × 896 | iPhone Pro Max / large Android |
| Tablet landscape | 1024 × 768 | If the design has tablet-landscape-specific layouts |
| Large desktop | 1920 × 1080 | If the user reports issues at FHD |
| Ultrawide | 2560 × 1080 | Niche; only if a designer explicitly asked |

## Tools Used

Primary:
- `mcp__webmobai__webmobai_launch_browser`
- `mcp__webmobai__webmobai_navigate`
- `mcp__webmobai__webmobai_test_responsive`
- `mcp__webmobai__webmobai_screenshot`
- `mcp__webmobai__webmobai_generate_report`
- `mcp__webmobai__webmobai_close_browser`

For deeper interaction checks:
- `mcp__webmobai__webmobai_set_viewport`
- `mcp__webmobai__webmobai_get_interactive_elements`
- `mcp__webmobai__webmobai_click`
- `mcp__webmobai__webmobai_press_key`
- `mcp__webmobai__webmobai_evaluate`
- `mcp__webmobai__webmobai_wait_for`
- `mcp__webmobai__webmobai_add_test_result`

## Output

End-of-turn summary:

```
Responsive test — https://example.com (3 breakpoints)
  Mobile  (375×812):  Overflow flagged (page is 412px wide)
  Tablet  (768×1024): OK
  Desktop (1280×720): OK
  Layout issues found:
   - Mobile: horizontal scroll — hero image fixed at 412px (no max-width: 100%)
   - Mobile: nav links wrap and overlap the logo
  Screenshots: /var/folders/…/webmobai-1747050000000-a1b2c3/screenshots/screenshot-{1,2,3}-<ts>.png
  Report:      /var/folders/…/webmobai-1747050000000-a1b2c3/report-1747050099000.html
```

Use the paths the tools actually returned — `webmobai_test_responsive` prints one screenshot path per breakpoint, and `webmobai_generate_report` prints `report-<ts>.html`. Both live in that run's `<os.tmpdir()>/webmobai-<ts>-<rand>/` session directory. Don't rewrite them into tidier-looking names.

## Common Findings

When you find layout bugs, name the likely root cause when it's obvious from the screenshot/DOM:

- **Horizontal overflow** — almost always a fixed-width element (image, table, code block, embedded iframe) without `max-width: 100%`. Common offenders: hero images, `<pre>` blocks, social embeds.
- **Overlapping nav at mobile** — flex container without `flex-wrap` or insufficient breakpoint coverage in the nav component.
- **Text hugs the edges** — missing horizontal padding on the page container at small widths.
- **Modals taller than viewport with no scroll** — modal container has fixed height instead of `max-height: 100vh` + `overflow: auto`.
- **Form fields overflow modal** — modal has fixed width smaller than the form's input min-width.
- **Sticky headers eat content** — `position: sticky` with no `scroll-padding-top` on the root.

Don't pretend to know the cause when you don't. Show the symptom and let the dev investigate.

## Tips & Gotchas

- **Hardware vs CSS pixels**: a viewport resize uses CSS pixels at `devicePixelRatio` 1. A "375px wide" viewport matches an iPhone's CSS width but not its 3× pixel density — screenshots come out at CSS resolution. A `device` preset launch does set the device's real DPR.
- **Touch vs click**: after a plain resize the page still gets mouse events, so touch-only interactions (long-press, swipe) can't be tested and `@media (hover: hover)` still matches. A `device`-preset launch enables touch, but `webmobai_click` / `webmobai_hover` still drive Playwright's normal input — gestures remain out of reach either way.
- **Behind a login**: a responsive sweep of a login page is a green result about the wrong page. Launch with `storage_state_path` (see "Behind a login?") before sweeping anything gated.
- **`hover` doesn't work on mobile in real life**. If the desktop layout depends on `:hover` to reveal content, that content is unreachable on touch devices. Flag this even though the test browser will happily respect `:hover` at any viewport.
- **CSS animations & transitions**: the 500ms post-resize wait inside `webmobai_test_responsive` is enough for most transitions, but long ones (CSS keyframe animations >500ms) may screenshot mid-animation. Add an extra `webmobai_wait_for` with a timeout if needed.
- **Viewport != screen**: changing viewport doesn't change `window.screen`. Code that reads `screen.width` (rare but exists in old responsive libraries) sees the host machine's screen.
- **Fixed/sticky elements**: a fixed element that's correctly sized at desktop may overflow on mobile. The `documentElement.scrollWidth` check catches this, but only if the element actually extends past the viewport — a fixed element with `transform: translateX(-50%)` may visually overflow without registering in scrollWidth.

## Example Invocations

User: *"Test responsive layout on https://example.com."*
→ Default 3 breakpoints, screenshot-only. Run the standard sweep, surface findings, generate report.

User: *"Does the pricing page look right at iPhone SE, iPhone 12, iPad portrait, and 1440p desktop?"*
→ Custom breakpoint list: 320×568, 390×844, 768×1024, 2560×1440. Same workflow.

User: *"Check the navigation works on mobile — open the hamburger menu, then click 'About'."*
→ This is a focused interaction test, not a sweep. Set viewport to mobile, click hamburger, take screenshot, click 'About', verify navigation. Could also pair with `testing-web-app` if the user wants a broader pass.

User: *"My designer says the modal is broken on tablet."*
→ Set viewport to 768×1024, open the modal, screenshot, run `webmobai_evaluate` to check for inner overflow, report findings. No need for the full sweep.

User: *"Check the account dashboard on mobile — you'll need to be logged in."*
→ Launch with `storage_state_path: "auth.json"` (capture it first via `testing-web-authenticated-sessions` if it doesn't exist), navigate to the dashboard, verify the final URL isn't `/login`, then run the standard sweep. Data tables are the usual overflow culprit here.
