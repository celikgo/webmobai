# WebMobAI Skills

This directory contains project-scoped Claude Code skills for **WebMobAI v1.4.0** — the AI-leveraged end-to-end web testing framework. It ships as three surfaces over one Playwright core:

- a **Tauri desktop app** (`src/`, `src-tauri/`) for watch-it-run sessions, reports, and the Monitors tab;
- an **MCP server** exposing **51 Playwright-driven web testing tools** to Claude;
- **seven binaries** published to npm as `webmobai-mcp` — `webmobai-mcp` (the MCP stdio server), `webmobai-test`, `webmobai-scenario`, `webmobai-suite`, `webmobai-codegen`, `webmobai-monitor`, and `webmobai-doctor` (the Sprint 18 preflight check).

Skills here teach Claude *how* to drive those tools cohesively for common QA jobs. Each skill is a self-contained workflow: when the user describes a job, the matching skill is auto-invoked and Claude follows its documented steps.

For installation, the scenario / suite formats, and the full tool reference, see [USER_MANUAL.md](../../USER_MANUAL.md). For the shipped feature inventory, see [FEATURES.md](../../FEATURES.md). When a doc and the source disagree, the source in `mcp-server/src/` wins.

## Available Skills

**20 skills**, grouped by the kind of job they do.

### Broad passes

| Skill | Use When | Output |
|-------|----------|--------|
| [`testing-web-app`](./testing-web-app/SKILL.md) | The user wants a complete, end-to-end QA pass — exploration + a11y + perf + responsive + report. The master workflow. | Full HTML report, video, screenshot gallery |
| [`running-web-smoke-test`](./running-web-smoke-test/SKILL.md) | Fast pass/fail "is the site alive" check, typically post-deploy. <60s. | Short pass/fail summary + 1 screenshot |
| [`exploring-web-app`](./exploring-web-app/SKILL.md) | Discover an unfamiliar site's surface area — crawl internal links, build a map, recommend follow-up skills. | Site map, page health, suggested next skills |

### Focused audits

| Skill | Use When | Output |
|-------|----------|--------|
| [`auditing-web-accessibility`](./auditing-web-accessibility/SKILL.md) | Deep accessibility audit aligned with WCAG 2.1 — axe-core findings by severity, keyboard sampling, CDP a11y-tree inspection. | HTML report with grouped a11y findings |
| [`auditing-web-performance`](./auditing-web-performance/SKILL.md) | Web Vitals measurement (LCP, FCP, CLS, INP, TTI, TTFB), single or multi-run medians, throttled mobile cross-check. | Per-page perf metrics, ratings, report |
| [`auditing-web-lighthouse`](./auditing-web-lighthouse/SKILL.md) | Official Google Lighthouse 0-100 category scores. Needs the optional `lighthouse` + `chrome-launcher` deps. | Category score table + 8 lowest audits |
| [`testing-web-responsive`](./testing-web-responsive/SKILL.md) | Verify layout at multiple viewports — mobile, tablet, desktop, custom breakpoints. Flags horizontal overflow. | Per-breakpoint screenshots, layout findings |
| [`auditing-web-security`](./auditing-web-security/SKILL.md) | Security-hygiene audit (CSP, mixed content, cookie flags). Not a pentest. | Grouped security findings, report |
| [`auditing-web-seo`](./auditing-web-seo/SKILL.md) | On-page SEO/content audit (title/meta/OG/canonical/h1/viewport/JSON-LD) + same-origin broken-link check. | Grouped SEO findings + broken-link list |
| [`auditing-web-pwa`](./auditing-web-pwa/SKILL.md) | Check PWA/installability readiness — manifest, service worker, HTTPS, optional offline reload. | Grouped PWA findings, report |
| [`regression-web-visual`](./regression-web-visual/SKILL.md) | Compare two states of a site (baseline vs current, staging vs prod) — pixelmatch diffs, versioned baselines. | Side-by-side screenshots, flagged-page list |

### Flows & assertions

| Skill | Use When | Output |
|-------|----------|--------|
| [`verifying-web-flows`](./verifying-web-flows/SKILL.md) | A hard pass/fail acceptance test of a flow via the five `assert_*` verbs (auto-wait + self-healing triage on fail). | Per-assertion pass/fail, optional report |
| [`testing-web-forms`](./testing-web-forms/SKILL.md) | Exercise a form or form-driven flow — happy path, validation cases, error states, form a11y. | Per-case pass/fail, screenshots, report |
| [`testing-web-error-states`](./testing-web-error-states/SKILL.md) | Test failure behavior — API 500s, empty/aborted responses, offline, blocked third-party — via `route`/`unroute` + network throttle. | Per-fault pass/fail, screenshots |
| [`debugging-web-selectors`](./debugging-web-selectors/SKILL.md) | A selector stopped matching / is ambiguous — diagnose it and get ranked replacement candidates from `describe_selector` + the self-healing triage. | Selector diagnosis + ranked, verified fix |

### Authoring & CI

| Skill | Use When | Output |
|-------|----------|--------|
| [`authoring-web-scenarios`](./authoring-web-scenarios/SKILL.md) | Turn a live exploration or plain-English description into a reusable, deterministic JSON scenario for `webmobai-scenario` / `-suite`. | Reviewed scenario JSON |
| [`running-web-ci-suites`](./running-web-ci-suites/SKILL.md) | Run scenarios as a real CI gate — suite file, `--workers`, `--shard`, `--tag`, JUnit XML, artifact upload, correct exit codes. | Suite file + pipeline config + exit-code contract |
| [`testing-web-authenticated-sessions`](./testing-web-authenticated-sessions/SKILL.md) | The site is behind a login — capture a session once with `webmobai_save_storage_state`, replay it via `storage_state_path` / `--storage-state` / scenario `storageState`. | A gitignored `auth.json` + authenticated runs |

### Ops & diagnosis

| Skill | Use When | Output |
|-------|----------|--------|
| [`monitoring-web-regressions`](./monitoring-web-regressions/SKILL.md) | Track a URL over time — read run history, check the latest run vs the historical median, stand up scheduled monitoring. | Regression verdict + monitor setup |
| [`troubleshooting-webmobai-setup`](./troubleshooting-webmobai-setup/SKILL.md) | WebMobAI itself is broken, not the site — tools missing, no Playwright engine, Lighthouse/AI reporting disabled, storageState rejected, app "damaged". | Diagnosis + the exact command that fixes it |

## Picking the Right Skill

```
                      ┌───────────────────────────┐
                      │ What does the user want?  │
                      └─────────────┬─────────────┘
                                    │
   ┌──────────────┬─────────────────┼─────────────────┬──────────────────┐
   │              │                 │                 │                  │
"WebMobAI     "The site         "Audit /          "Is the site      "Compare two
 itself is     needs a           test / QA         broken?"          versions"
 broken"       login"            this site"            │                  │
   │              │                 │                 ▼                  ▼
   ▼              ▼                 ▼           running-web-      regression-web-
troubleshooting-  testing-web-   testing-web-     smoke-test          visual
 webmobai-setup   authenticated-    app
   │               sessions          │
   │  (run this        │        (narrow the scope?)
   │   FIRST when      │             │
   │   nothing works)  │   ┌─────┬───┴───┬─────────┬──────────┬──────────┐
   │                   │   │     │       │         │          │          │
   │                   │   ▼     ▼       ▼         ▼          ▼          ▼
   │                   │ a11y  perf  responsive  security    seo        pwa
   │                   │         │
   │                   │         └── want an official 0-100 number?
   │                   │              → auditing-web-lighthouse
   │                   │
   │                   └── produces auth.json; every other skill can then
   │                       launch with storage_state_path / --storage-state
   │
   └── webmobai-doctor is the first command in almost every failure

                      "Verify a specific flow / assert an outcome"
                                    │
                   ┌────────────────┼─────────────────┐
                   ▼                ▼                 ▼
            verifying-web-    testing-web-      testing-web-
                flows            forms          error-states
                   │
                   └── a locator broke mid-flow? → debugging-web-selectors

                      "Make it repeatable"
                                    │
                   ┌────────────────┼─────────────────┐
                   ▼                ▼                 ▼
            authoring-web-    running-web-      monitoring-web-
              scenarios         ci-suites        regressions
             (write the        (gate a          (watch a URL
              JSON)             deploy)          over time)
```

Two routing rules worth internalizing:

- If the user is asking *exploratory* questions ("what's on this site?"), start with `exploring-web-app` — its output recommends which downstream skill to run next.
- If any skill hits a login wall, don't re-drive the login form inside that skill. Hand off to `testing-web-authenticated-sessions` once, then come back and launch from the saved session.

## Common Conventions (Apply to All Skills)

These conventions are repeated across SKILL.md files so each skill is self-contained, but they originate here.

### Preflight

- When something fails in a way that smells environmental — no browser engine, Lighthouse "not installed", AI tools reporting themselves disabled, a rejected auth file — run **`webmobai-doctor`** before debugging the site. It checks, in order: Node.js (≥18 required), Playwright chromium (required), firefox and webkit (optional), the optional `lighthouse` dependency, `WEBMOBAI_ANTHROPIC_API_KEY`, and — only with `--storage-state <file>` — that auth file's existence, JSON validity, and cookie expiry.
- Output is `  <icon> <name>: <detail>` with `✓` ok, `!` warn, `✗` error. **Exit 0 when there are zero errors** — warnings never fail it. Exit 1 when any required check errors. There is no exit 2, and unknown arguments are silently ignored.
- It writes nothing and touches no site. It is always safe to run first. Full workflow in `troubleshooting-webmobai-setup`.

### Browser Lifecycle

1. Always call `webmobai_launch_browser` first. Most tools error with `"Browser is not launched. Call webmobai_launch_browser first."` otherwise — that exact message comes from the dispatcher, which pre-checks the browser for guarded tool groups.
2. Only one browser per session — `launch_browser` returns `"Browser is already running. Close it first to relaunch."` if one exists. Close it first if you need different launch options (a different engine, device, or `storage_state_path`).
3. Always call `webmobai_close_browser` at the end. It stops tracing, saves the video, closes the context and browser, resets all `route` interceptions, and returns the video and `trace.zip` paths. It is null-safe — calling it with no browser running is harmless.
4. **Eight tools work with no browser at all**: `launch_browser` and `close_browser` themselves, `get_run_history`, `check_regressions`, `visual_baseline_list_versions`, `visual_baseline_restore_version`, `lighthouse_audit` (it spawns its own headless Chrome), and `explain_visual_diff` (it reads PNGs off disk). Don't launch a browser just to call one of these.
5. Every session gets a fresh browser profile — no cookies, cache, or extensions — which is what makes runs reproducible. **Unless you pass `storage_state_path`**, which seeds the context from a saved logged-in session. See the next section.
6. Session artifacts live in a per-run temp directory, `<os.tmpdir()>/webmobai-<timestamp>-<rand>/`, containing `screenshots/`, `recordings/`, `trace.zip`, and any generated report. Never invent a path like `/tmp/webmobai-screenshots/foo.png` — surface the path the tool actually returned.

### Authenticated Sessions

- The pattern is **capture once, replay many**: log in with a headed browser, call `webmobai_save_storage_state` with a `path`, then start later runs already authenticated via `storage_state_path` on `webmobai_launch_browser`, `--storage-state` on `webmobai-scenario` / `webmobai-suite` / `webmobai-doctor`, or the `storageState` field in a scenario or `suite.defaults`.
- Full workflow, precedence rules, and the MFA/SSO path: [`testing-web-authenticated-sessions`](./testing-web-authenticated-sessions/SKILL.md). Don't reimplement it inside another skill.
- **Secret hygiene is not optional.** The file holds live cookies and localStorage — including bearer tokens — in plaintext. It is a credential:
  - Never print its contents, and never reconstruct them with `webmobai_evaluate`. The tools are built so responses carry the path at most, never the values.
  - Keep it gitignored. The repo root already ignores `auth.json`, `*.auth.json`, and `*storage-state*.json` — a session written to `session.json` or `.auth/creds.json` matches **none** of those patterns, so prefer the conventional names.
  - The Playwright `trace.zip` and any recorded video capture the authenticated session and are **not** redacted. Think before attaching them to a ticket or a CI artifact bundle.
  - Nothing sets file permissions, encrypts, or expires the file, and nothing refreshes it. A stale session fails as ordinary step failures (a redirect to `/login`, an `assert_visible` timeout) with no distinct diagnostic. `webmobai-doctor --storage-state <file>` is the only staleness check, and it only warns when **every** dated cookie has expired.
- Never invent credentials. If a flow needs a login and none was provided, ask.

### AI Layer

- Three tools are AI-backed and **opt-in**: `webmobai_summarize_audit` (prioritized executive summary of the session), `webmobai_explain_visual_diff` (plain-English description of a baseline-vs-actual PNG pair), and `webmobai_generate_scenario_from_prompt` (natural language → validated scenario JSON).
- All three are gated on `WEBMOBAI_ANTHROPIC_API_KEY`. Unset — or whitespace-only — and they return, as an ordinary successful response, exactly: `AI features are disabled. Set WEBMOBAI_ANTHROPIC_API_KEY (and optionally WEBMOBAI_AI_MODEL) to enable.` No throw, no MCP error, no network call. Treat that string as "feature off," not as a failure, and say so plainly rather than retrying.
- The gate is checked **before** the browser check, so a disabled-AI message can mask the fact that you also forgot to launch a browser.
- Companion env vars: `WEBMOBAI_AI_MODEL` (default `claude-opus-4-8`) and `WEBMOBAI_AI_MAX_TOKENS` (default 2048). These are not gates.
- `webmobai_generate_scenario` — no `_from_prompt` — is the **deterministic, non-AI** scaffolder. It always works, key or no key. Prefer it when the user just wants a starting-point scenario.

### Headed vs Headless

- **Default: headed** (`headless: false`). The user can watch the run live. This is the design intent of the desktop app's "see your browser" UX, and it is the only surface where a human can complete an interactive step such as MFA.
- **Headless** (`headless: true`) when the user asks for it — CI-style runs, batch scripts, long unattended crawls. Performance and a11y results are equivalent.
- The CLIs do not offer the choice: `webmobai-scenario` and `webmobai-suite` are hardcoded **headless** (there is no `--headed` flag), and `webmobai-test` — and therefore `webmobai-monitor`, which spawns it — is hardcoded **headed** and needs a display server.
- Consequence worth knowing: the `pauseForManual` scenario step is a logged no-op in headless, so it can never work through either CLI. Capture interactive logins over MCP instead.

### Video Recording

- MCP `webmobai_launch_browser` defaults `record_video: true`.
- **Off** for performance audits (recording can perturb metrics by 1–3%).
- **Off** for long crawls (file size grows linearly; >10 min sessions can hit hundreds of MB).
- **Off** for smoke tests (startup cost not worth it for a 60s check).
- **Off** when capturing a login — the video records the credentials being typed.
- `webmobai-scenario` and `webmobai-suite` always pass `recordVideo: false`; `webmobai-test` follows its config's `enableVideo`, default true.

### Result Categories

`webmobai_add_test_result` requires `title`, `status`, `category`, and `description` (`details` is optional). `category` is a **free string**, not an enum — the list below is a convention that keeps reports grouping cleanly, so stick to it:

- `Navigation` — page loads, redirects, 404s
- `Errors` — broken images, console errors, network failures
- `Accessibility` — a11y findings, per impact bucket
- `Performance` — Web Vitals, one entry per metric
- `Responsive` — layout findings, per breakpoint
- `Forms` — form happy path and validation cases
- `Content` — broken links, missing critical content, SEO and PWA findings
- `Security` — CSP / cookie-flag / mixed-content findings
- `Scenario` — one entry per step in a scenario or suite run (the runners set this themselves)
- `Visual Regression` — diff findings between two states
- `Baseline` — captures used for later comparison

In JUnit XML the category becomes the testcase `classname`, so an inconsistent category fragments the CI test tree.

### Status Values

The tool enforces three values; use them consistently:

- `pass` — check ran, result is within spec
- `warning` — suboptimal but not user-breaking ("Needs Improvement" perf, moderate a11y, horizontal overflow that doesn't hide content)
- `fail` — user-impacting (page errors, critical a11y, "Poor" perf, content not rendering)

Note for CI: JUnit maps `warning` to `<skipped/>`, **not** to a failure — warnings will not turn a build red. If something must fail the build, it has to be a `fail`.

### Reports

- One report per session is the norm. The HTML report is the user-facing deliverable.
- Generate via `webmobai_generate_report` with the *primary* URL (the one the user asked about, even if the crawl visited many). It runs a **fresh** accessibility audit and performance snapshot at call time, so call it while the page you care about is still loaded.
- It writes `report-<ts>.html` plus `junit-<ts>.xml` into the **session directory** — deliberately not the working directory. Pass `junit: false` for HTML only. `webmobai-suite` is the exception: its aggregate `report-<ts>.html`, `junit-<ts>.xml`, and always-written `suite-<ts>.json` go to `--out` (default cwd).
- The report path is timestamped and absolute — surface it verbatim to the user, and never guess at it.

### Auth & Destructive Actions

- Never invent credentials. If a flow needs a login and no creds were provided, ask — or point at `testing-web-authenticated-sessions` so the session is captured once and reused.
- Never submit to production endpoints with destructive data (real signups, real checkouts) unless the user explicitly authorized it.
- Skip logout / delete / destroy URLs during crawls unless the user explicitly authorized them. A crawl running from a saved authenticated session is *more* dangerous than a logged-out one — it can actually reach those endpoints.
- Don't use `webmobai_route` to fulfill a destructive endpoint with a fake success on production. Fault injection is for surfacing bad behavior, not masking it.

## Underlying Tool Reference

All skills are thin orchestrations over the WebMobAI MCP tools. The server advertises version `1.4.0` and exposes **51 tools** — the full canonical list, grouped. Counts sum to 51 (7+1+5+2+5+5+2+2+4+5+3+3+2+2+2+1).

| Category | Count | Tools (all carry the `webmobai_` prefix) |
|---|---|---|
| Browser control | 7 | `launch_browser` (chromium/firefox/webkit, device presets, `storage_state_path`, `idle_timeout_ms`), `navigate`, `go_back`, `scroll`, `screenshot`, `set_viewport`, `close_browser` |
| Session / auth | 1 | `save_storage_state` — cookies + localStorage to a Playwright storageState JSON |
| Interaction | 5 | `click`, `type`, `hover`, `press_key`, `select_option` |
| Waiting & scripting | 2 | `wait_for` (selector → url_contains → plain timeout), `evaluate` |
| Page analysis | 5 | `get_page_state`, `get_interactive_elements`, `get_links`, `check_errors`, `get_console_errors` |
| Assertions | 5 | `assert_visible`, `assert_hidden`, `assert_text`, `assert_url`, `assert_count` — auto-wait, 100 ms poll, `timeout_ms` default 5000, self-healing triage on fail |
| Request mocking | 2 | `route` (fulfill / abort / continue), `unroute` |
| Accessibility | 2 | `accessibility_audit` (axe-core primary, heuristics merged), `get_accessibility_tree` (real CDP tree, Chromium-only) |
| Performance | 4 | `get_performance_metrics` (LCP/FCP/CLS/TTI/INP/TTFB + ratings), `run_perf_multi` (median/p95/min/max), `set_network_throttle`, `set_cpu_throttle` |
| Audits | 5 | `lighthouse_audit` (optional dep, own headless Chrome), `security_audit`, `seo_audit`, `check_broken_links`, `pwa_audit` |
| Visual regression | 3 | `visual_snapshot` (pixelmatch), `visual_baseline_list_versions`, `visual_baseline_restore_version` |
| Reporting | 3 | `test_responsive`, `add_test_result`, `generate_report` |
| Run history | 2 | `get_run_history`, `check_regressions` — read `~/.webmobai/history.json`, no browser needed |
| Scenario authoring | 2 | `generate_scenario` (deterministic scaffolder), `generate_scenario_from_prompt` (AI) |
| AI analysis | 2 | `summarize_audit`, `explain_visual_diff` — both gated on `WEBMOBAI_ANTHROPIC_API_KEY` |
| Debugging | 1 | `describe_selector` |
| **Total** | **51** | |

Tools are implemented in `mcp-server/src/tools/` — 16 files, one group per file — and dispatched from `mcp-server/src/server.ts`, where each group carries a `requiresBrowser` flag. Web Vitals thresholds, accessibility rules, throttling presets, severity grades, and report formatting all live in that source. **When in doubt about what a tool actually does, read the source, not the docs.**

## Adding a New Skill

1. Create `.claude/skills/<skill-name>/SKILL.md`. The directory name is the skill name.
2. Use the frontmatter format — exactly two keys:
   ```yaml
   ---
   name: skill-name
   description: Use when the user wants to ... Triggers on "kw", "kw", ...
   ---
   ```
   `name` must be kebab-case and match the directory. `description` is one long sentence starting with "Use when the user wants to…" and ending with a `Triggers on "…", "…"` list of roughly 8-12 natural-language phrases — that list is what actually routes the user's prompt to the skill.
3. Structure the body with these sections, in this order (look at any existing skill for a template):
   - **Overview** — what the skill does, what it doesn't
   - **When to Use** — concrete triggers, and which sibling skill to prefer for adjacent cases
   - **Inputs You Need** — what to ask the user up front, including whether the target is behind a login
   - **Workflow** — numbered steps, each naming the exact MCP tool or CLI it uses, with fenced JSON for tool args where it helps
   - **Tools Used** — full list of tool names, `mcp__webmobai__`-prefixed, with *(conditional)* markers
   - **Output** — what the user gets at the end
   - **Tips & Gotchas** — caveats, edge cases, things that surprise newcomers
   - **Example Invocations** — 3-4 realistic user prompts and how the skill responds
4. Register no extra config — Claude Code discovers `.claude/skills/<name>/SKILL.md` automatically.
5. Update this README's skill table, the decision tree, and the skill count in the intro.

### Skill Authoring Principles

- **One job per skill**. If a skill does two unrelated things, split it.
- **Cite the actual tool names**. `webmobai_navigate`, not "navigate the page" — Claude needs the exact identifiers to call them. Every name must come from the canonical 51 in the table above; a plausible-sounding invented name is the worst failure mode in this tree, because it teaches a call that always errors.
- **Verify against source before you assert**. Defaults, severity grades, flag spellings, and output formats drift. `mcp-server/src/tools/`, `mcp-server/src/*-cli.ts`, and `mcp-server/src/scenario/types.ts` are the ground truth. If you cannot verify a claim, say so in the skill rather than guessing.
- **Be honest about limitations**. Most v1 caveats are resolved — a11y is axe-core, visual regression is pixelmatch with versioned baselines, Web Vitals can be throttled and multi-run aggregated, Lighthouse ships as an optional dep, and logins are replayable via storageState. State the *remaining* gaps, and cite [FEATURES.md §4](../../FEATURES.md) rather than stale ones.
- **Never fabricate an artifact path.** Session artifacts land in `<os.tmpdir()>/webmobai-<ts>-<rand>/`. Print what the tool returned.
- **Workflow first, narrative second**. The numbered workflow is what Claude executes. Tips and explanations are context — keep them tight.
- **Cross-reference**. If another skill is a better fit for a sub-case, name it. Skills should hand off to each other rather than reimplement — especially `testing-web-authenticated-sessions` for logins, `running-web-ci-suites` for pipelines, and `troubleshooting-webmobai-setup` for environment failures.
