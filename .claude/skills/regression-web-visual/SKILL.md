---
name: regression-web-visual
description: Use when the user wants to detect visual changes between two states of a website — baseline vs. current, before vs. after deploy, version A vs. version B. Captures matching screenshots, highlights pages where something visibly changed. Triggers on "visual regression", "screenshot diff", "before and after", "did the design change", "compare visually", "visual diff", "regression test", "pre-deploy compare", "verify nothing visually broke".
---

# Regressing a Web App Visually

## Overview

This skill performs a visual regression check: take screenshots of a site in a *baseline* state, take screenshots of the same site in a *current* state, and surface which pages and breakpoints visually changed. The output is a report with side-by-side screenshots and a list of pages flagged for human review.

**Important caveat**: WebMobAI does not provide pixel-diffing out of the box. This skill captures the *evidence* (matched screenshots at matched viewports for the same URL paths) and presents them for a human to compare. If you need automated pixel-diff with tolerance thresholds, route the user to Percy, Chromatic, or Playwright's built-in `toHaveScreenshot()` — and offer to set those up separately.

What this skill *does* well:
- Reliable, deterministic screenshot capture for matched URL+viewport pairs
- A clean before/after gallery the user can scan
- Tagging of likely-changed pages based on heuristics (different DOM heading count, different headline text, errors that weren't there before)
- Flagging structural changes (new pages appeared, old pages 404, layout-relevant metrics shifted)

## When to Use

- "Compare staging vs production"
- "Did the deploy change anything visually?"
- "Visual regression test"
- "Before-and-after screenshots"
- "Verify the redesign didn't break other pages"

Don't use this for:
- Pixel-perfect diffing (use Percy/Chromatic)
- Functional regressions (use `running-web-smoke-test` or `testing-web-app`)
- Comparing two completely different sites (this assumes the *same* paths exist on both URLs)

## Inputs You Need

1. **Baseline URL** (required) — e.g., `https://example.com` (production)
2. **Current URL** (required) — e.g., `https://staging.example.com` (the version under test)
3. **Page paths** — list of paths to check at both URLs. Default: just `/`. If the user has a known list (homepage, pricing, about, product), use that. For unknown sites, run `exploring-web-app` first.
4. **Breakpoints** — same trio as `testing-web-responsive`, or whatever the user specifies.
5. **Auth on either side** — if either URL requires login, get credentials. If both require login, get both.
6. **Element-level focus** — full-page screenshot vs. viewport-only. Default: full-page for visual regression (small below-fold changes matter).

## Workflow

### 1. Launch baseline session
`webmobai_launch_browser`, `headless: false`. Default viewport.

### 2. Capture baseline screenshots
For each path × breakpoint:
1. `webmobai_set_viewport` to the breakpoint
2. `webmobai_navigate` to `<baseline_url><path>`
3. Wait for page to settle (`webmobai_wait_for` on a stable selector if the site is JS-heavy)
4. `webmobai_screenshot` with `full_page: true` and a description like `"baseline /pricing mobile"`
5. Capture lightweight metadata: title, heading count, character length of body text (`webmobai_evaluate` with `{ title: document.title, h: document.querySelectorAll('h1,h2,h3').length, len: document.body.innerText.length }`)
6. `webmobai_check_errors` — note any baseline errors so we don't blame the deploy for them later

Record each baseline result with `webmobai_add_test_result` so the report tracks the baseline pass too (category: `"Baseline"`).

### 3. Close baseline session (or just navigate)
You don't need to close the browser — a clean profile within one session is fine. Just navigate to the current URL next.

### 4. Capture current screenshots
Same loop, against the current URL. Use parallel descriptions: `"current /pricing mobile"`. Capture the same metadata.

### 5. Compare
For each path × breakpoint, compare baseline vs. current on these axes:

- **Title changed**: signal a content change. Not necessarily a regression — sometimes intentional.
- **Heading count differs**: structural change. Highlight.
- **Body text length differs by >10%**: content shifted. Worth a human look.
- **Errors changed**: new console errors / broken images on current that weren't on baseline = regression. Old errors gone = improvement.
- **Performance shifted significantly**: optional — only if the user asked for perf-as-regression-signal. LCP changing by >500ms is meaningful.

Flag pages where any axis shows a change. Don't try to make a final call on "is this a regression?" — that's the human's job. Present the evidence cleanly.

### 6. Generate the side-by-side
The HTML report doesn't natively render before/after pairs, so when you call `webmobai_generate_report`, add one `webmobai_add_test_result` per compared page with:
- `category: "Visual Regression"`
- `status`: `pass` if no flagged axes, `warning` if any axis differs, `fail` if a page is missing on one side
- `title`: e.g., "Visual diff — /pricing (mobile)"
- `description`: which axes changed
- `details`: paths to both screenshot files for manual review

### 7. Report
`webmobai_generate_report`. Surface the report path and a flagged-page list. Make clear in your end-of-turn summary that the user must visually inspect the screenshot pairs — the tool flagged candidates, it didn't decide.

### 8. Close
`webmobai_close_browser`.

## Comparison Heuristics — When to Flag

```
For each (path, breakpoint):
  flag if:
    - page exists on baseline but not on current (or vice versa)  → FAIL (missing page)
    - console errors are different                                → FAIL (likely regression)
    - title differs                                               → WARN
    - heading count differs                                       → WARN
    - body text length differs by > 10%                           → WARN
    - new broken images on current                                → FAIL
  otherwise:
    - structurally similar → PASS, but user should still eyeball the screenshot pair if confident is needed
```

Be honest about confidence levels:
- "PASS" means no structural change detected. Visual changes (color, spacing, fonts) won't be caught by these heuristics — only a real pixel diff or human eye will catch them.
- "WARN" / "FAIL" means *something* changed, and the user should look.

## Tools Used

- `mcp__webmobai__webmobai_launch_browser`
- `mcp__webmobai__webmobai_navigate`
- `mcp__webmobai__webmobai_set_viewport`
- `mcp__webmobai__webmobai_wait_for`
- `mcp__webmobai__webmobai_screenshot` (with `full_page: true`)
- `mcp__webmobai__webmobai_evaluate` (metadata extraction)
- `mcp__webmobai__webmobai_check_errors`
- `mcp__webmobai__webmobai_add_test_result`
- `mcp__webmobai__webmobai_generate_report`
- `mcp__webmobai__webmobai_close_browser`

## Output

End-of-turn summary:

```
Visual regression — baseline=https://example.com vs current=https://staging.example.com
  Pages × breakpoints checked: 5 paths × 3 breakpoints = 15 pairs
  PASS:  10 pairs — no structural change detected
  WARN:  4 pairs — heading count or body text differs
  FAIL:  1 pair  — /pricing (mobile): new console error + broken image
  Flagged for manual review:
   - /pricing (mobile): new console error "ReferenceError: trackEvent" + hero image 404
   - /docs (desktop): body text 23% shorter — content was removed?
   - /signup (mobile): title changed "Sign Up" → "Create Account"
  Screenshots:
   - baseline/: /tmp/webmobai-screenshots/baseline-*.png
   - current/:  /tmp/webmobai-screenshots/current-*.png
  Report: /tmp/webmobai-report-1715534000.html

  Visual changes (color, spacing, fonts) won't be flagged by the heuristics here.
  For pixel-level diffing, set up Percy or Playwright's toHaveScreenshot().
```

## Tips & Gotchas

- **Authenticated state on both sides**: if the baseline is logged-in and the current isn't (or vice versa), every page will look different. Either log into both, or skip auth-gated pages.
- **Time-sensitive content**: news sites, dashboards, anything with timestamps or feeds will always differ. Either exclude these paths, or noise-filter (`webmobai_evaluate` to strip dates before measuring text length).
- **A/B tests and feature flags**: baseline and current may differ because the user is bucketed into a different variant, not because of a deploy. Surface this possibility if you see seemingly random differences.
- **Cookie banners**: GDPR/cookie banners that appear on baseline but were dismissed on current (or vice versa) will skew the screenshots. Dismiss them deterministically on both sides, or accept that the top of the page will always differ.
- **Sticky elements**: if a sticky banner / nav changes height between versions, every below-the-fold screenshot will look shifted even if nothing else changed.
- **`full_page: true` is heavy**: full-page screenshots on long pages can produce 10MB+ PNGs. Reasonable for ~20 pages; impractical for 200.
- **Pixel-diff is the real answer**: this skill catches *structural* regressions. For visual regressions in the strict sense (a button moved 4px, a color changed from `#0066CC` to `#0066CD`), you need real pixel diffing. Be candid with the user — don't pretend this skill replaces Percy.
- **Order matters for caching**: do baseline first, then current — or vice versa, but be consistent. If you alternate, you may be measuring cache effects rather than real differences.
- **Disable animations**: if pages have entrance animations, you may catch them mid-animation. Inject CSS via `webmobai_evaluate` to disable transitions/animations during the regression run:
  ```js
  const style = document.createElement('style');
  style.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
  document.head.appendChild(style);
  ```

## Example Invocations

User: *"Compare staging (https://staging.example.com) vs prod (https://example.com) — homepage, pricing, signup."*
→ 3 paths × 3 breakpoints = 9 pairs. Run the full workflow. Flag changes; surface screenshots side-by-side for manual review.

User: *"We're about to deploy — visually check the top 5 pages."*
→ Confirm the top 5 paths with the user. Capture baseline from production, current from staging. Run heuristics. Flag.

User: *"Pixel-perfect compare — did anything change at all?"*
→ Surface the limitation up front: this skill catches structural changes but not pure visual changes. Offer to set up Playwright's `toHaveScreenshot()` or recommend Percy. Then run the structural check anyway as a fast first pass.

User: *"Take the same screenshots on staging and prod so I can compare manually."*
→ Skip the heuristics and just produce a matched set of screenshots cleanly named. Report the file paths.
