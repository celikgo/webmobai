# WebMobAI Skills

This directory contains project-scoped Claude Code skills for **WebMobAI** — the AI-leveraged end-to-end web testing framework that pairs a Tauri desktop app, four CLI binaries, and an MCP server exposing **43 Playwright-driven web testing tools**.

Skills here teach Claude *how* to drive WebMobAI's MCP tools cohesively for common QA jobs. Each skill is a self-contained workflow: when the user describes a job, the matching skill is auto-invoked and Claude follows its documented steps.

For installation, the scenario / suite formats, and the full tool reference, see [USER_MANUAL.md](../../USER_MANUAL.md). For the shipped feature inventory, see [FEATURES.md](../../FEATURES.md).

## Available Skills

| Skill | Use When | Output |
|-------|----------|--------|
| [`testing-web-app`](./testing-web-app/SKILL.md) | The user wants a complete, end-to-end QA pass — exploration + a11y + perf + responsive + report. The master workflow. | Full HTML report, video, screenshot gallery |
| [`running-web-smoke-test`](./running-web-smoke-test/SKILL.md) | Fast pass/fail "is the site alive" check, typically post-deploy. <60s. | Short pass/fail summary + 1 screenshot |
| [`auditing-web-accessibility`](./auditing-web-accessibility/SKILL.md) | Deep accessibility audit aligned with WCAG 2.1 — severity-grouped issues, keyboard sampling, a11y tree inspection. | HTML report with grouped a11y findings |
| [`auditing-web-performance`](./auditing-web-performance/SKILL.md) | Web Vitals measurement (LCP, FCP, CLS, TTI, TTFB), single or multi-page, optional mobile cross-check. | Per-page perf metrics, ratings, report |
| [`testing-web-responsive`](./testing-web-responsive/SKILL.md) | Verify layout at multiple viewports — mobile, tablet, desktop, custom breakpoints. Flags horizontal overflow and broken nav at small widths. | Per-breakpoint screenshots, layout findings |
| [`testing-web-forms`](./testing-web-forms/SKILL.md) | Exercise a form or form-driven flow — happy path, validation cases, error states, form a11y. | Per-case pass/fail, screenshots, report |
| [`exploring-web-app`](./exploring-web-app/SKILL.md) | Discover an unfamiliar site's surface area — crawl internal links, build a map, recommend follow-up skills. | Site map, page health, suggested next skills |
| [`regression-web-visual`](./regression-web-visual/SKILL.md) | Compare two states of a site (baseline vs current, staging vs prod) — matched screenshots, structural-change heuristics. | Side-by-side screenshots, flagged-page list |

## Picking the Right Skill

```
                    ┌──────────────────────────┐
                    │  What does the user want?│
                    └────────────┬─────────────┘
                                 │
        ┌────────────────────────┼─────────────────────────┐
        │                        │                         │
"Audit / test                 "Is it                "Compare two
 / QA this site"               broken?"              versions"
        │                        │                         │
        ▼                        ▼                         ▼
testing-web-app          running-web-           regression-web-
                          smoke-test               visual
        │
   (Want to narrow scope?)
        │
   ┌────┼────┬─────────────┬───────────┐
   │    │    │             │           │
   ▼    ▼    ▼             ▼           ▼
 a11y  perf  responsive  forms     unfamiliar
                                    site →
                                 exploring-
                                  web-app
```

If the user is asking *exploratory* questions ("what's on this site?"), start with `exploring-web-app` — its output recommends which downstream skill to run next.

## Common Conventions (Apply to All Skills)

These conventions are repeated across SKILL.md files so each skill is self-contained, but they originate here:

### Browser Lifecycle
1. Always call `webmobai_launch_browser` first. Testing/a11y/reporting tools error with `"Browser is not launched"` otherwise.
2. Only one browser per session — `launch_browser` errors if one is already running. Close it first if you need to restart.
3. Always call `webmobai_close_browser` at the end. It saves the video and releases the Chromium process.
4. Every session uses a fresh Chromium profile (no cookies, cache, extensions). This is intentional — it makes runs reproducible.

### Headed vs Headless
- **Default: headed** (`headless: false`). The user can watch the run live. This is the design intent of the desktop app's "see your browser" UX.
- **Headless** (`headless: true`) only when the user explicitly requests it (CI-style runs, batch scripts, long unattended crawls). Performance and a11y results are equivalent.

### Video Recording
- **On** by default for human-driven sessions — replayable evidence is valuable.
- **Off** for performance audits (recording can perturb metrics by 1–3%).
- **Off** for long crawls (file size grows linearly; >10 min sessions can hit hundreds of MB).
- **Off** for smoke tests (startup cost not worth it for a 60s check).

### Result Categories
When calling `webmobai_add_test_result`, use these categories so reports group cleanly:

- `Navigation` — page loads, redirects, 404s
- `Errors` — broken images, console errors, network failures
- `Accessibility` — a11y findings, per impact bucket
- `Performance` — Web Vitals, one entry per metric
- `Responsive` — layout findings, per breakpoint
- `Forms` — form happy path and validation cases
- `Content` — broken links, missing critical content
- `Visual Regression` — diff findings between two states
- `Baseline` — captures used for later comparison

### Status Values
The tool enforces three values; use them consistently:

- `pass` — check ran, result is within spec
- `warning` — suboptimal but not user-breaking ("Needs Improvement" perf, moderate a11y, horizontal overflow that doesn't hide content)
- `fail` — user-impacting (page errors, critical a11y, "Poor" perf, content not rendering)

### Reports
- One report per session is the norm. The HTML report is the user-facing deliverable.
- Generate via `webmobai_generate_report` with the *primary* URL (the one the user asked about, even if the crawl visited many).
- The report path is timestamped and absolute — surface it verbatim to the user.

### Auth & Destructive Actions
- Never invent credentials. If a flow needs login and no creds were provided, ask.
- Never submit to production endpoints with destructive data (real signups, real checkouts) unless the user explicitly authorized it.
- Skip logout / delete / destroy URLs during crawls unless the user explicitly authorized them.

## Underlying Tool Reference

All skills are thin orchestrations over the WebMobAI MCP tools. **43 tools** across these categories — see [USER_MANUAL.md §7](../../USER_MANUAL.md#7-mcp-tool-reference) for the full list with descriptions.

| Category | Count | Examples |
|---|---|---|
| Browser control | 8 | launch_browser (chromium/firefox/webkit + device emulation), navigate, click, type, screenshot, … |
| Page analysis | 11 | get_page_state, check_errors (now incl. network failures), evaluate, wait_for, … |
| Accessibility | 2 | accessibility_audit (axe-core primary engine), get_accessibility_tree (real CDP tree) |
| Reporting | 4 | get_performance_metrics (LCP/FCP/CLS/TTI/INP/TTFB + LCP element), test_responsive, generate_report, … |
| **Assertions** | 5 | assert_visible / hidden / text / url / count — with auto-wait + self-healing diagnostics on fail |
| **Request mocking** | 2 | route (fulfill/abort/continue), unroute |
| **Performance control** | 3 | set_network_throttle (slow-3g/fast-3g/slow-4g/offline), set_cpu_throttle, run_perf_multi |
| **Visual regression** | 1 | visual_snapshot — pixelmatch-backed, writes actual+diff PNGs on mismatch |
| **Audits** | 3 | security_audit (CSP/mixed/cookies), seo_audit, pwa_audit |
| **Other** | 4 | check_broken_links, generate_scenario, get_run_history, check_regressions, describe_selector |

Tools are implemented in `mcp-server/src/tools/`. Web Vitals thresholds, accessibility rules, throttling presets, and report formatting all live in that source — when in doubt about what a tool *actually* does, read the source.

## Adding a New Skill

To add a new skill:

1. Create `.claude/skills/<skill-name>/SKILL.md`.
2. Use the frontmatter format:
   ```yaml
   ---
   name: skill-name
   description: When to use this skill, with explicit trigger keywords...
   ---
   ```
3. Structure the body with these sections (look at any existing skill for a template):
   - **Overview** — what the skill does, what it doesn't
   - **When to Use** — concrete triggers
   - **Inputs You Need** — what to ask the user up front
   - **Workflow** — numbered steps, each citing the MCP tool used
   - **Tools Used** — full list of tool names
   - **Output** — what the user gets at the end
   - **Tips & Gotchas** — caveats, edge cases, things that surprise newcomers
   - **Example Invocations** — 3-4 example user prompts and how the skill responds
4. Register no extra config — Claude Code discovers `.claude/skills/<name>/SKILL.md` automatically.
5. Update this README's skill table.

### Skill Authoring Principles

- **One job per skill**. If a skill does two unrelated things, split it.
- **Cite the actual tool names**. `webmobai_navigate`, not "navigate the page" — Claude needs the exact identifiers to call them.
- **Be honest about limitations**. Most of the v1 caveats have been resolved — a11y is now axe-core, visual regression is pixel-diff via pixelmatch, Web Vitals can be throttled + multi-run aggregated. The remaining honest gaps live in [FEATURES.md §4](../../FEATURES.md). Cite those, not stale ones.
- **Workflow first, narrative second**. The numbered workflow is what Claude executes. Tips and explanations are context — keep them tight.
- **Cross-reference**. If another skill is a better fit for a sub-case, name it. Skills should hand off to each other rather than reimplement.
