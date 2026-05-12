---
name: testing-web-responsive
description: Use when the user wants to verify a site renders correctly at multiple viewport sizes — mobile, tablet, desktop, custom breakpoints. Captures per-breakpoint screenshots and flags layout issues like horizontal overflow. Triggers on "responsive test", "mobile test", "breakpoint test", "test on mobile", "tablet view", "does it look right on mobile", "viewport test", "responsive design check", "mobile-first audit".
---

# Testing Web Responsiveness

## Overview

This skill exercises a web page across multiple viewport sizes and reports per-breakpoint findings: screenshots, horizontal overflow flags, and a final report. It uses `webmobai_test_responsive` for the canonical sweep and adds focused interaction checks per breakpoint when the user cares about specific elements (nav, modals, forms) that often break at small widths.

**Scope**: this is a *layout* test, not a *performance* test or a *device emulation* test. It changes the viewport size but does **not**:
- Emulate touch input (taps register as mouse clicks)
- Throttle CPU or network
- Spoof the User-Agent string to mobile
- Test on real devices

For real mobile testing, route the user to BrowserStack, Sauce, or a physical device.

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
4. **Auth** — same caveat as other skills.
5. **Interaction depth** — just screenshot each breakpoint, or also exercise nav/modals at each breakpoint? Default: screenshot only; ask if the user wants deeper interaction tests.

## Workflow

### 1. Launch
`webmobai_launch_browser`, `headless: false` (let the user watch the reflows). Initial viewport doesn't matter — you'll change it per step.

### 2. Navigate
`webmobai_navigate` to the target URL. Wait for the page to stabilize.

### 3. Run the canonical responsive sweep
`webmobai_test_responsive` with the breakpoint list. The tool:
- Sets each viewport
- Waits 500ms for reflow
- Screenshots
- Checks `documentElement.scrollWidth > clientWidth` for horizontal overflow
- Records a `pass`/`warning` per breakpoint

This is the lowest-effort, highest-coverage call. Always run it first.

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
  Screenshots: /tmp/webmobai-screenshots/responsive-{mobile,tablet,desktop}.png
  Report: /tmp/webmobai-report-1715534000.html
```

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

- **Hardware vs CSS pixels**: WebMobAI uses CSS pixels. A "375px wide" viewport corresponds to an iPhone in portrait at devicePixelRatio 3 — physically 1125 device pixels wide, but CSS-side 375. Screenshots are at CSS resolution, not device resolution.
- **Touch vs click**: the tool dispatches mouse events. Touch-only interactions (long-press, swipe) cannot be tested. Surface this if the user is testing a touch-heavy interface.
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
