---
name: regression-web-visual
description: Use when the user wants to detect visual changes between two states of a website — baseline vs. current, before vs. after deploy, version A vs. version B. Captures matching screenshots, highlights pages where something visibly changed. Triggers on "visual regression", "screenshot diff", "before and after", "did the design change", "compare visually", "visual diff", "regression test", "pre-deploy compare", "verify nothing visually broke".
---

# Regressing a Web App Visually

## Overview

This skill performs a visual regression check: take screenshots of a site in a *baseline* state, take screenshots of the same site in a *current* state, and surface which pages and breakpoints visually changed. The output is a report with side-by-side screenshots and a list of pages flagged for human review.

**Two comparison modes:**

1. **Structural diff** (this skill's classic mode) — capture matched screenshots at matched viewports for the same URL paths, run heuristics on metadata (title, heading count, body text length, errors), present a side-by-side gallery for human review. Catches content/structure regressions but not pure visual ones.
2. **Pixel-perfect diff** via `webmobai_visual_snapshot` (or the `visualSnapshot` scenario step). Backed by `pixelmatch` (the same library Playwright's `toHaveScreenshot()` uses). First call against a name saves the baseline; subsequent calls produce `.diff.png` highlighting changed pixels. Use this when you care about specific pixel-level diffs (a button moved 4px, a color changed from `#0066CC` to `#0066CD`).

Prefer **pixel-perfect** for individual elements / hero sections where exact visuals matter. Prefer **structural** for cross-page comparison surveys where "did anything notable change" matters more than "did anything visually change."

Two capabilities layer on top of the pixel-diff mode and are covered below:

- **Baseline history** — every baseline overwrite archives the previous PNG, so a wrongly-accepted baseline is one tool call away from a rollback (`webmobai_visual_baseline_list_versions` / `webmobai_visual_baseline_restore_version`). See "Pixel Diff and Baseline Versions".
- **AI narration** — `webmobai_explain_visual_diff` turns a baseline/actual/diff PNG triple into a plain-English change list. Opt-in, costs a Claude API call. See "AI Narration of a Diff".

**Behind a login?** Neither mode can reach a gated page on its own. Capture a `storageState` file once and launch both the baseline and the current pass from it — see `testing-web-authenticated-sessions`. Comparing a logged-in baseline against a logged-out current is the single most common source of "everything changed".

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
- "We accepted a bad baseline last week — roll it back"

Don't use this for:
- Pixel-perfect diffing of individual elements — use `webmobai_visual_snapshot` directly instead (it's faster and more focused than running this whole skill)
- Hosted baseline review with PR-comment integration — that's a real Percy / Chromatic feature; we ship in-tree pixel-diff but not the collaboration layer
- Functional regressions (use `running-web-smoke-test` or `testing-web-app`)
- Comparing two completely different sites (this assumes the *same* paths exist on both URLs)

## Inputs You Need

1. **Baseline URL** (required) — e.g., `https://example.com` (production)
2. **Current URL** (required) — e.g., `https://staging.example.com` (the version under test)
3. **Page paths** — list of paths to check at both URLs. Default: just `/`. If the user has a known list (homepage, pricing, about, product), use that. For unknown sites, run `exploring-web-app` first.
4. **Breakpoints** — same trio as `testing-web-responsive`, or whatever the user specifies.
5. **Auth on either side** — if either URL requires login, you need a saved `storageState` JSON per side (`webmobai_launch_browser` takes `storage_state_path`). Capture it with `testing-web-authenticated-sessions`; never hand-drive a login on one side only.
6. **Element-level focus** — full-page screenshot vs. viewport-only. Default: full-page for visual regression (small below-fold changes matter).
7. **Baseline directory** (pixel-diff mode only) — where baselines live. `webmobai_visual_snapshot` defaults to `<sessionDir>/visual-baselines`, which is a fresh temp dir every session and therefore useless across runs. For anything you want to compare tomorrow, pass an explicit repo-relative `baseline_dir` so the PNGs version alongside the code.

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
- "PASS" means no structural change detected. Pure visual changes (color, spacing, fonts) won't be caught by these heuristics — for those, pair this skill with one or more `webmobai_visual_snapshot` calls on the elements that matter.
- "WARN" / "FAIL" means *something* changed, and the user should look.

## Pixel Diff and Baseline Versions

### Taking a pixel snapshot

`webmobai_visual_snapshot` requires a launched browser and a `name`. Everything else has a default:

```json
{
  "name": "checkout/cart-empty",
  "baseline_dir": "./visual-baselines",
  "selector": "[data-testid=cart]",
  "full_page": false,
  "threshold": 0.2,
  "max_diff_pixel_ratio": 0.01
}
```

- `name` forward slashes nest into subdirectories (`checkout/cart-empty` → `<baseline_dir>/checkout/cart-empty.png`). Names are sanitized: lowercased, and anything outside `[a-zA-Z0-9._-]` collapses to `-`.
- `threshold` is per-pixel color sensitivity (0 exact … 1 insensitive), default **0.2** — same as Playwright.
- Tolerance is `max_diff_pixels` (absolute) and/or `max_diff_pixel_ratio` (default **0.01** = 1%). Both are checked when both are given.
- First call against a name **writes the baseline and returns PASS-shaped text** (`Visual baseline created: <path>`), not a comparison. You need two runs to detect anything.
- On a real mismatch the tool writes `<name>.actual.png` and `<name>.diff.png` next to the baseline and returns `FAIL — … N pixels differ (X%)` with all three paths.
- A dimension mismatch is reported separately (`dimension mismatch`) — usually a viewport that wasn't pinned, not a design change.

### Archive-on-overwrite

Every baseline overwrite archives the outgoing image first. This happens on `update_baseline: true` and on any other write to an existing name — nothing is silently destroyed:

```
<baseline_dir>/checkout/cart-empty.png            ← current baseline
<baseline_dir>/checkout/cart-empty.v1747000000000.png   ← previous, archived
<baseline_dir>/checkout/cart-empty.actual.png     ← last failing capture
<baseline_dir>/checkout/cart-empty.diff.png       ← last pixelmatch overlay
```

The archive suffix is `.v<unix-ms>.png`. **Only the 5 most recent versions per snapshot are kept** — older archives are pruned on the next write. Past five overwrites, history is gone; that's the practical limit on how far back you can roll.

### Listing versions

`webmobai_visual_baseline_list_versions` — **no browser required**. Both `name` and `baseline_dir` are required (unlike `visual_snapshot`, this tool has no default directory, so pass the same path you snapshotted with):

```json
{ "name": "checkout/cart-empty", "baseline_dir": "./visual-baselines" }
```

Returns archived versions newest-first with `timestamp=<unix-ms>`, an ISO date, and the absolute path. An empty result means the baseline has never been overwritten — not that it doesn't exist.

Use it when: the user says the baseline is wrong, before you overwrite anything intentional (so you can quote the rollback timestamp back to them), or when auditing what changed and when.

### Restoring a version

`webmobai_visual_baseline_restore_version` — **no browser required**. Requires `name`, `baseline_dir`, and a numeric `timestamp` from the listing:

```json
{ "name": "checkout/cart-empty", "baseline_dir": "./visual-baselines", "timestamp": 1747000000000 }
```

The currently-active baseline is itself archived before the promotion, so a restore is reversible and can't lose the state you're replacing. Passing a timestamp with no matching archive is an error, not a silent no-op — always list first.

Use it when: someone ran `update_baseline: true` on a page that was actually broken, and the "baseline" now enshrines the bug.

## AI Narration of a Diff

`webmobai_explain_visual_diff` reads PNGs **from disk paths only** — no browser required — and returns a plain-English description of what changed. Pair it with a `visual_snapshot` FAIL, which already gave you all three paths:

```json
{
  "baseline_path": "/abs/visual-baselines/checkout/cart-empty.png",
  "actual_path": "/abs/visual-baselines/checkout/cart-empty.actual.png",
  "diff_path": "/abs/visual-baselines/checkout/cart-empty.diff.png",
  "snapshot_name": "checkout/cart-empty"
}
```

- `baseline_path` and `actual_path` are required; `diff_path` and `snapshot_name` are optional. Passing `diff_path` improves accuracy — it tells the model which regions actually changed.
- **Returns** 2–6 markdown bullets naming concrete changes ("Submit button moved 16px lower and switched from blue to purple"), then a final line: `Severity: cosmetic | content | structural`. Anti-aliasing and animation frames are called out as "likely render noise" rather than treated as regressions.
- **Gated on `WEBMOBAI_ANTHROPIC_API_KEY`.** With no key it returns exactly `AI features are disabled. Set WEBMOBAI_ANTHROPIC_API_KEY (and optionally WEBMOBAI_AI_MODEL) to enable.` — a normal response, not an error. Fall back to relaying the pixel stats and the three file paths.
- **What it costs:** one Claude API call per invocation, billed to the user's own key. It uploads 2–3 full PNGs as base64 image blocks, so a full-page screenshot is the dominant token cost — narrate the handful of diffs that matter, not every snapshot in a 50-page sweep. The response is capped at 1024 output tokens.
- It never re-reads the page. The narration is only as good as the two PNGs you hand it.

## Tools Used

- `mcp__webmobai__webmobai_launch_browser`
- `mcp__webmobai__webmobai_navigate`
- `mcp__webmobai__webmobai_set_viewport`
- `mcp__webmobai__webmobai_wait_for`
- `mcp__webmobai__webmobai_screenshot` (with `full_page: true`)
- `mcp__webmobai__webmobai_evaluate` (metadata extraction)
- `mcp__webmobai__webmobai_check_errors`
- `mcp__webmobai__webmobai_visual_snapshot` *(pixel-diff mode; requires a launched browser)*
- `mcp__webmobai__webmobai_visual_baseline_list_versions` *(no browser; `name` + `baseline_dir` both required)*
- `mcp__webmobai__webmobai_visual_baseline_restore_version` *(no browser; rollback)*
- `mcp__webmobai__webmobai_explain_visual_diff` *(optional; no browser; needs `WEBMOBAI_ANTHROPIC_API_KEY`)*
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
  Screenshots (one session dir, baseline and current interleaved by capture order):
   - /var/folders/xx/…/webmobai-1747000000000-a1b2c3/screenshots/full-1-1747000000123.png
   - /var/folders/xx/…/webmobai-1747000000000-a1b2c3/screenshots/full-2-1747000000456.png
  Report: /var/folders/xx/…/webmobai-1747000000000-a1b2c3/report-1747000000789.html

  Visual changes (color, spacing, fonts) won't be flagged by the heuristics here.
  For pixel-level diffing, layer in `webmobai_visual_snapshot` calls on specific elements.
```

Screenshot paths come back from the tool — relay them verbatim rather than reconstructing them. The session directory is `<os.tmpdir()>/webmobai-<unix-ms>-<random>/`; viewport captures are named `screenshot-<n>-<unix-ms>.png` and `full_page: true` captures are `full-<n>-<unix-ms>.png`, both under `screenshots/`. Because baseline and current share one session dir, the *description* you pass to `webmobai_screenshot` is the only thing distinguishing them — always label the side.

Pixel-diff mode reports different paths: the baseline, `.actual.png`, and `.diff.png` all live under `baseline_dir`, not the session dir.

## Tips & Gotchas

- **Authenticated state on both sides**: if the baseline is logged-in and the current isn't (or vice versa), every page will look different. Launch both sides with the same saved session (`webmobai_launch_browser` → `storage_state_path`), or skip auth-gated pages entirely. Capturing that session is `testing-web-authenticated-sessions`. A stale session degrades into a redirect to `/login`, which reads as "the whole page changed" — check the current URL before believing a wall of diffs.
- **Time-sensitive content**: news sites, dashboards, anything with timestamps or feeds will always differ. Either exclude these paths, or noise-filter (`webmobai_evaluate` to strip dates before measuring text length).
- **A/B tests and feature flags**: baseline and current may differ because the user is bucketed into a different variant, not because of a deploy. Surface this possibility if you see seemingly random differences.
- **Cookie banners**: GDPR/cookie banners that appear on baseline but were dismissed on current (or vice versa) will skew the screenshots. Dismiss them deterministically on both sides, or accept that the top of the page will always differ.
- **Sticky elements**: if a sticky banner / nav changes height between versions, every below-the-fold screenshot will look shifted even if nothing else changed.
- **`full_page: true` is heavy**: full-page screenshots on long pages can produce 10MB+ PNGs. Reasonable for ~20 pages; impractical for 200.
- **Two-tier strategy**: this skill catches *structural* regressions cheaply across many pages; `webmobai_visual_snapshot` catches *pixel-level* regressions on specific elements. Use both. For hosted baseline review across a team (PR comments, shared approval workflows), recommend Percy / Chromatic — we ship the in-tree pixel diff but not the collaboration layer.
- **`update_baseline: true` is the dangerous flag.** It accepts whatever is on screen as the new truth, including a bug. It is survivable — the outgoing image is archived — but only 5 versions deep. Before accepting, say what you're accepting and why; after accepting, mention that `webmobai_visual_baseline_list_versions` can undo it.
- **The default `baseline_dir` cannot detect regressions.** It resolves to `<sessionDir>/visual-baselines` in a fresh temp directory, so every session writes a first-run baseline and reports "created". If a snapshot keeps saying "baseline created" instead of PASS/FAIL, that's the cause — pass an explicit, persistent `baseline_dir`.
- **`.actual.png` and `.diff.png` are overwritten every failing run.** They reflect the most recent failure only. Copy them out before re-running if the user needs to compare two failures.
- **Narration is a summarizer, not a detector.** `webmobai_explain_visual_diff` never decides pass/fail — pixelmatch already did. Don't let a narration reading "cosmetic" override a FAIL the user cares about, and don't spend an API call on a PASS.
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
→ Use `webmobai_visual_snapshot` directly with a small `max_diff_pixel_ratio` (e.g., 0.001) on the elements that matter. That's what the in-tree pixel diff is for. If the user wants pixel-perfect across hundreds of paths with hosted baseline review, recommend Percy / Chromatic on top.

User: *"Take the same screenshots on staging and prod so I can compare manually."*
→ Skip the heuristics and just produce a matched set of screenshots cleanly named. Report the file paths.

User: *"Someone accepted a broken baseline for the cart last sprint — can we get the old one back?"*
→ `webmobai_visual_baseline_list_versions` with the snapshot `name` and the repo's `baseline_dir`, show the archived timestamps with their ISO dates, confirm which one predates the bad accept, then `webmobai_visual_baseline_restore_version` with that timestamp. Note that the bad baseline is itself archived by the restore, so the swap is reversible.

User: *"The diff failed but I can't tell what actually changed — explain it in words."*
→ Take the three paths from the `visual_snapshot` FAIL and call `webmobai_explain_visual_diff` with `baseline_path`, `actual_path`, and `diff_path`. Relay the bullets and the `Severity:` line. If the key isn't set, say AI narration is disabled and describe the diff from the pixel stats and the images instead.
