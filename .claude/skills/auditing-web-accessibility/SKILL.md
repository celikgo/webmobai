---
name: auditing-web-accessibility
description: Use when the user wants a deep accessibility (a11y) audit of a website — WCAG-aligned findings, severity-grouped issues, accessibility tree inspection, and a structured report. Goes deeper than the smoke or full-app skill. Triggers on "accessibility audit", "a11y check", "WCAG audit", "screen reader review", "ARIA review", "a11y compliance", "axe", "lighthouse a11y", "alt text check", "keyboard navigation test".
---

# Auditing Web Accessibility

## Overview

This skill performs a thorough accessibility audit of a website using WebMobAI's audit tools, organized around the WCAG 2.1 success criteria the underlying tooling covers. The output is a per-page list of issues grouped by **impact** (critical / serious / moderate / minor), a screen-reader-style accessibility tree dump for the most important pages, and a final HTML report.

**Scope of the underlying tool**: `webmobai_accessibility_audit` is a lightweight, deterministic audit. It covers:
- Image alt text
- Form labels and `aria-label` on inputs
- ARIA attributes (validity, required pairings)
- Document landmarks (`<main>`, `<header>`, `<footer>`, `<nav>`)
- Skip links / keyboard-focusable navigation
- Heading hierarchy
- Color contrast (where computable)

It is **not** a substitute for axe-core or Lighthouse, and it does **not** test full keyboard navigation, focus management on SPA route changes, or screen-reader announcement quality. If the user needs that depth, surface the limitation up front and recommend they pair this audit with axe DevTools.

## When to Use

- "Run an a11y audit on …"
- "Check WCAG compliance for …"
- "Review accessibility on the new flow"
- Legal/compliance requests (ADA, EU Accessibility Act, AODA)
- After major UI changes that touched forms, modals, or navigation

Do **not** use this for one-off "is alt text present on the hero image" questions — `webmobai_evaluate` with a one-liner is faster.

## Inputs You Need

1. **URL(s)** — single page or list. Default: just the homepage. Ask if scope is ambiguous.
2. **Authenticated flows** — if pages behind a login should be audited, ask for credentials. Authenticated states often have very different a11y findings (logged-in nav, modals).
3. **WCAG conformance level** — usually AA. If the user says AAA, note that this tool covers only a subset of AAA criteria and flag the gap.
4. **Severity threshold** — what should make it into the headline summary. Default: critical + serious. Moderate/minor go in the appendix.

## Workflow

### 1. Launch
`webmobai_launch_browser`, `headless: false`, default viewport (a11y issues can vary at narrow widths, but desktop is the conventional baseline). Set `record_video: true` so the user can replay if they want to verify a specific finding.

### 2. For each page in scope:

#### 2a. Navigate and let it settle
`webmobai_navigate` to the URL. For SPAs, follow with a `webmobai_wait_for` on a known-stable selector — a11y findings on a half-mounted page are noise.

#### 2b. Page state with a11y tree
`webmobai_get_page_state` with `include_accessibility_tree: true`. This gives both the DOM summary and the screen-reader view in one call. Skim the a11y tree for:
- Buttons with no accessible name (shows as `button "<no name>"`)
- Nested interactive elements (button inside link, etc.)
- Missing landmarks
- Heading order jumps

#### 2c. Full audit
`webmobai_accessibility_audit`. Capture the result. Group findings by impact.

#### 2d. Keyboard-traversal spot check
The tool doesn't test keyboard navigation directly, but you can sample:
1. `webmobai_press_key` with `key: "Tab"` repeatedly (~10 presses)
2. After each, `webmobai_evaluate` with `document.activeElement?.outerHTML?.slice(0, 200)` to see what got focus
3. Flag: focus traps, focus lost (returns to `<body>`), invisible focus indicators

This is a sampling check, not exhaustive — say so in the report.

#### 2e. Modals & dynamic content (if present)
If the page has modals/dialogs, open them and re-run `webmobai_accessibility_audit`. Modals routinely fail focus-trap, `aria-modal`, and `role="dialog"` requirements that don't show up on the host page.

#### 2f. Record results
For each impact bucket on each page, call `webmobai_add_test_result`:
- `category: "Accessibility"`
- `status: "fail"` for critical/serious, `"warning"` for moderate/minor
- `title`: e.g., "3 critical a11y issues on /pricing"
- `details`: the rule names and the first few affected selectors

#### 2g. Screenshot evidence
`webmobai_screenshot` for any page with critical findings — auditors and devs want to see the offending state.

### 3. Cross-page synthesis
After auditing all pages, summarize patterns:
- Recurring rules (e.g., "missing alt text on all 5 product pages")
- Component-level issues (e.g., "every page using `<NavBar>` is missing `<nav>` landmark") — these are higher-leverage fixes than per-page tickets.

### 4. Report
`webmobai_generate_report` with the primary URL. The HTML report includes the a11y issues section automatically. Surface the report path and the top 5 fixes by impact.

### 5. Close
`webmobai_close_browser`.

## WCAG Mapping

When you report issues, include the rough WCAG mapping the underlying tool uses:

| Tool rule (`issue.rule`) | WCAG SC | Level |
|--------------------------|---------|-------|
| `image-alt`              | 1.1.1 Non-text Content | A |
| `label`                  | 1.3.1 Info & Relationships, 3.3.2 Labels or Instructions | A |
| `aria-valid-attr`        | 4.1.2 Name, Role, Value | A |
| `aria-required-children` | 1.3.1 | A |
| `landmark-one-main`      | 1.3.1, 2.4.1 Bypass Blocks | A / A |
| `skip-link`              | 2.4.1 Bypass Blocks | A |
| `heading-order`          | 1.3.1, 2.4.6 Headings and Labels | A / AA |
| `color-contrast`         | 1.4.3 Contrast (Minimum) | AA |

The `issue.helpUrl` field from the tool points to the rule documentation; pass it through to the user verbatim — don't fabricate URLs.

## Tools Used

- `mcp__webmobai__webmobai_launch_browser`
- `mcp__webmobai__webmobai_navigate`
- `mcp__webmobai__webmobai_get_page_state` (with `include_accessibility_tree: true`)
- `mcp__webmobai__webmobai_get_accessibility_tree`
- `mcp__webmobai__webmobai_accessibility_audit`
- `mcp__webmobai__webmobai_press_key` (keyboard traversal)
- `mcp__webmobai__webmobai_evaluate` (active-element inspection)
- `mcp__webmobai__webmobai_click` (opening modals)
- `mcp__webmobai__webmobai_screenshot`
- `mcp__webmobai__webmobai_add_test_result`
- `mcp__webmobai__webmobai_generate_report`
- `mcp__webmobai__webmobai_close_browser`

## Output

The deliverable is the HTML report plus your end-of-turn summary:

```
A11y audit complete — 3 pages, 14 issues
  Critical (4):  3× missing form label, 1× missing main landmark
  Serious  (5):  2× invalid ARIA attr, 3× heading-order jumps
  Moderate (3):  …
  Minor    (2):  …
  Top fixes by leverage:
   1. Add <label> to <input id="email"> in <SignupForm> — used on /, /signup, /pricing (3 pages)
   2. Wrap main content in <main> in <PageShell> — used everywhere
   3. Add aria-label to icon-only buttons in <Toolbar>
  Report: /tmp/webmobai-report-1715534000.html
```

## Severity Definitions

Use the impact level the tool returns. For reference (matches axe-core conventions):

- **Critical** — blocks users with assistive tech from accomplishing core tasks. Fix immediately. Examples: form input with no label, button with no accessible name.
- **Serious** — significant barrier but workaround may exist. Examples: invalid ARIA, missing landmarks, low contrast on key text.
- **Moderate** — usability hit, not a hard block. Examples: heading-order jumps, missing skip link.
- **Minor** — polish-level. Examples: redundant ARIA, non-essential decorative-image alt.

## Tips & Gotchas

- **Run audits after the page is stable**. SPAs may inject content seconds after navigation; an audit run too early reports phantom issues. Use `webmobai_wait_for` on a stable selector first.
- **Modals hide issues until opened**. Always exercise interactive surfaces (open dialogs, hover dropdowns) before declaring a page audited.
- **The tool is conservative**. False negatives are possible — it won't flag every keyboard trap or screen-reader announcement issue. Note this in the report.
- **Color contrast is computed against the rendered style**. If a hover/focus state has worse contrast than the default, you must trigger it (`webmobai_hover`) and re-audit.
- **Don't over-fix during the audit**. Your job is to *find* issues, not patch them. Report findings; let the user prioritize fixes.
- **Compliance language**: avoid telling the user the site "is WCAG AA compliant" based on this tool alone. The tool covers a subset; full compliance requires manual screen-reader testing and additional automated tooling.
- **Authenticated-only issues**: if you log in mid-audit, capture pre- and post-auth findings separately. Many issues only show on the logged-in nav/dashboard.

## Example Invocations

User: *"Run a WCAG audit on https://example.com/pricing."*
→ Single-page audit. Run the full workflow on that URL. Highlight critical + serious in the summary.

User: *"Check the new signup flow for accessibility — start at /signup, go through to /welcome."*
→ Multi-page audit. Navigate the flow step by step, audit each landing state, audit any modals along the way. Report per-page and cross-page.

User: *"We're getting sued — do an ADA audit of the whole site."*
→ Push back politely: this skill is one input, not legal cover. Recommend pairing with axe DevTools, manual screen-reader testing (VoiceOver, NVDA), and legal review. Run the audit anyway as a fast first pass.
