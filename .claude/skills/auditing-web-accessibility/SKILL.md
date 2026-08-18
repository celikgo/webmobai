---
name: auditing-web-accessibility
description: Use when the user wants a deep accessibility (a11y) audit of a website — WCAG-aligned findings, severity-grouped issues, accessibility tree inspection, and a structured report. Goes deeper than the smoke or full-app skill. Triggers on "accessibility audit", "a11y check", "WCAG audit", "screen reader review", "ARIA review", "a11y compliance", "axe", "lighthouse a11y", "alt text check", "keyboard navigation test".
---

# Auditing Web Accessibility

## Overview

This skill performs a thorough accessibility audit of a website using WebMobAI's audit tools, organized around the WCAG 2.1 success criteria the underlying tooling covers. The output is a per-page list of issues grouped by **impact** (critical / serious / moderate / minor), a screen-reader-style accessibility tree dump for the most important pages, and a final HTML report.

**Scope of the underlying tool**: `webmobai_accessibility_audit` is a real axe-core run, not a heuristic pass. The **primary engine is `@axe-core/playwright`** (`new AxeBuilder({ page }).analyze()`) — the full axe WCAG 2.x ruleset, including genuine computed color contrast, ARIA validity and required-children, landmark rules, and everything else axe ships. Every axe violation comes through with its own rule id, `description`, `helpUrl`, and affected nodes.

A second, hand-rolled fast path runs after axe and is **merged in, deduped by rule id** — so it only contributes rules axe didn't already report. That supplementary set is small and fixed: `image-alt`, `label`, `button-name`, `html-has-lang`, `document-title`, `skip-link`, `landmark-one-main`, and `small-text` (a WebMobAI-only heuristic, not an axe rule). Treat it as a floor, not the scope.

Two honesty points that matter when you write the report:

- **Silent degradation.** If axe fails to load or throws, the tool logs a warning to stderr and returns **supplementary rules only** — roughly eight coarse checks instead of the full ruleset. The tool response looks identical either way. A suspiciously clean result on a complex page is worth a second run.
- **The tool's own "no issues" message is stale.** When zero issues are found it prints "This is a lightweight audit. For production use, also run full axe-core or Lighthouse audits." Axe *is* the engine; don't repeat that sentence as if the audit were heuristic. The rest of the caveat still holds — see below.

The audit does **not** exhaustively test keyboard navigation, focus management on SPA route changes, or screen-reader announcement quality — for those, surface the limitation and recommend pairing with manual VoiceOver/NVDA testing.

**Want a single 0-100 accessibility number** (for a dashboard, a ticket, or a target to hit)? That's `auditing-web-lighthouse` — `webmobai_lighthouse_audit` returns Lighthouse's official Accessibility score. This skill returns the itemized violations behind such a score; they answer different questions and it's fine to run both.

**Behind a login?** Logged-in surfaces (dashboards, account nav, authenticated modals) routinely carry different — usually worse — findings than the marketing pages. Capture a session once and launch the audit from it with `storage_state_path` rather than hand-driving a login each run: see `testing-web-authenticated-sessions`.

## When to Use

- "Run an a11y audit on …"
- "Check WCAG compliance for …"
- "Review accessibility on the new flow"
- Legal/compliance requests (ADA, EU Accessibility Act, AODA)
- After major UI changes that touched forms, modals, or navigation

Do **not** use this for one-off "is alt text present on the hero image" questions — `webmobai_evaluate` with a one-liner is faster.

## Inputs You Need

1. **URL(s)** — single page or list. Default: just the homepage. Ask if scope is ambiguous.
2. **Authenticated flows** — if pages behind a login should be audited, you need a saved session file, not credentials pasted into the chat. Hand off to `testing-web-authenticated-sessions` to capture one, then launch with `storage_state_path`. Authenticated states often have very different a11y findings (logged-in nav, modals).
3. **WCAG conformance level** — usually AA. If the user says AAA, note that this tool covers only a subset of AAA criteria and flag the gap.
4. **Severity threshold** — what should make it into the headline summary. Default: critical + serious. Moderate/minor go in the appendix.

## Workflow

### 1. Launch
`webmobai_launch_browser`, `headless: false`, default viewport (a11y issues can vary at narrow widths, but desktop is the conventional baseline). Set `record_video: true` so the user can replay if they want to verify a specific finding.

### 2. For each page in scope:

#### 2a. Navigate and let it settle
`webmobai_navigate` to the URL. For SPAs, follow with a `webmobai_wait_for` on a known-stable selector — a11y findings on a half-mounted page are noise.

#### 2b. Page state with a11y tree
`webmobai_get_page_state` with `include_accessibility_tree: true`. This gives both the DOM summary and the screen-reader view in one call. The tree is the **real CDP `Accessibility.getFullAXTree`**, not a DOM walk — which also means it is **Chromium-only**. On Firefox or WebKit it returns `Accessibility tree not available (CDP not supported on this browser)`; report that verbatim rather than substituting a DOM summary. Ignored pass-through nodes are hidden but their children still render, so `[main]` under an ignored `<body>` still shows.

Skim the a11y tree for:
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

`issue.rule` is the **axe-core rule id** for anything axe reported, so the axe rule catalogue is the authoritative mapping and it is far larger than any table here. Common ids you'll see, with the criteria they map to:

| Rule id (`issue.rule`) | WCAG SC | Level |
|--------------------------|---------|-------|
| `image-alt`              | 1.1.1 Non-text Content | A |
| `label`                  | 1.3.1 Info & Relationships, 3.3.2 Labels or Instructions | A |
| `button-name`            | 4.1.2 Name, Role, Value | A |
| `aria-valid-attr`        | 4.1.2 Name, Role, Value | A |
| `aria-required-children` | 1.3.1 | A |
| `html-has-lang`          | 3.1.1 Language of Page | A |
| `document-title`         | 2.4.2 Page Titled | A |
| `landmark-one-main`      | 1.3.1, 2.4.1 Bypass Blocks | A / A |
| `skip-link`              | 2.4.1 Bypass Blocks | A |
| `heading-order`          | 1.3.1, 2.4.6 Headings and Labels | A / AA |
| `color-contrast`         | 1.4.3 Contrast (Minimum) | AA |

One id is **not** an axe rule: `small-text` is WebMobAI's own heuristic and its `helpUrl` points at the W3C Understanding page for 1.4.4 Resize Text, not to Deque. Say so if the user asks why they can't find it in axe.

The `issue.helpUrl` field comes straight from axe (or, for supplementary rules, is hardcoded in WebMobAI); pass it through to the user verbatim — don't fabricate URLs.

Note the output shape when you quote findings: issues are grouped `Critical / Serious / Moderate / Minor`, each rendered as `### <rule>` + description + `Help: <helpUrl>`, and **at most 5 affected elements are listed per issue** (each element's HTML is truncated — 200 characters for axe findings, 120 for the supplementary rules). "5 affected elements" in the output can mean 5 or 500 — don't report the printed count as the total.

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
  Report: /var/folders/xx/…/webmobai-1747000000000-a1b2c3/report-1747000000789.html
```

The report path is whatever `webmobai_generate_report` returned — relay it verbatim. It is written into the browser session directory (`<os.tmpdir()>/webmobai-<unix-ms>-<random>/report-<unix-ms>.html`), never the current working directory.

## Severity Definitions

Use the impact level the tool returns. For reference (matches axe-core conventions):

- **Critical** — blocks users with assistive tech from accomplishing core tasks. Fix immediately. Examples: form input with no label, button with no accessible name.
- **Serious** — significant barrier but workaround may exist. Examples: invalid ARIA, missing landmarks, low contrast on key text.
- **Moderate** — usability hit, not a hard block. Examples: heading-order jumps, missing skip link.
- **Minor** — polish-level. Examples: redundant ARIA, non-essential decorative-image alt.

## Tips & Gotchas

- **Run audits after the page is stable**. SPAs may inject content seconds after navigation; an audit run too early reports phantom issues. Use `webmobai_wait_for` on a stable selector first.
- **Modals hide issues until opened**. Always exercise interactive surfaces (open dialogs, hover dropdowns) before declaring a page audited.
- **Automated coverage has a ceiling.** Axe is thorough on what it can compute statically, but no automated engine flags every keyboard trap, focus-order mistake, or bad screen-reader announcement. Note this in the report.
- **Watch for the axe fallback.** If axe throws, the audit quietly drops to the eight supplementary rules and the response gives no hint. A page with rich ARIA that reports only `image-alt` / `label` / `landmark-one-main` findings probably ran degraded — re-run before concluding the page is clean.
- **Color contrast is computed against the rendered style**. If a hover/focus state has worse contrast than the default, you must trigger it (`webmobai_hover`) and re-audit.
- **Don't over-fix during the audit**. Your job is to *find* issues, not patch them. Report findings; let the user prioritize fixes.
- **Compliance language**: avoid telling the user the site "is WCAG AA compliant" based on this tool alone. The tool covers a subset; full compliance requires manual screen-reader testing and additional automated tooling.
- **Authenticated-only issues**: many issues only exist on the logged-in nav/dashboard. Prefer launching with a saved `storage_state_path` so the whole audit runs authenticated and reproducibly (`testing-web-authenticated-sessions`). If you do log in mid-audit instead, keep pre- and post-auth findings in separate buckets — a merged list makes it impossible to tell which surface needs the fix.
- **Compliance scores vs. violation lists**: if the user wants a number to track, `auditing-web-lighthouse` gives the official 0-100 Accessibility score. Don't try to synthesize a percentage from this skill's issue counts — issue count and Lighthouse score are not convertible.

## Example Invocations

User: *"Run a WCAG audit on https://example.com/pricing."*
→ Single-page audit. Run the full workflow on that URL. Highlight critical + serious in the summary.

User: *"Check the new signup flow for accessibility — start at /signup, go through to /welcome."*
→ Multi-page audit. Navigate the flow step by step, audit each landing state, audit any modals along the way. Report per-page and cross-page.

User: *"We're getting sued — do an ADA audit of the whole site."*
→ Push back politely: this skill is one input, not legal cover. Recommend pairing with axe DevTools, manual screen-reader testing (VoiceOver, NVDA), and legal review. Run the audit anyway as a fast first pass.
