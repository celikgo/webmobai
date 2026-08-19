# WebMobAI Documentation Index

WebMobAI v1.4.0 — a Tauri desktop app plus 7 binaries published to npm as
`webmobai-mcp` (the MCP stdio server and six CLIs), exposing 51
Playwright-driven web testing tools and 20 packaged Claude Code skills.

This page is the map. Every document in the repo is listed once, with the
question it answers.

---

## The documentation set

### Top level

| Document | Read this when |
|---|---|
| [`README.md`](../README.md) | You are new. Project front door: what it is, install paths, quick start, architecture tree. |
| [`USER_MANUAL.md`](../USER_MANUAL.md) | You want the end-to-end walkthrough — install, all seven binaries, every flag, the full 51-tool MCP reference (§7), workflows by job, artifact layout, troubleshooting. The longest document; start at its table of contents. |
| [`FEATURES.md`](../FEATURES.md) | You want the capability inventory, what is deliberately out of scope, and the sprint-by-sprint history. |
| [`ROADMAP.md`](../ROADMAP.md) | You want to know what is planned next and what already shipped. |
| [`CHANGELOG.md`](../CHANGELOG.md) | You are upgrading and need the exact per-release delta. |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | You are changing the code — dev setup, adding an MCP tool, adding a scenario step verb, adding a skill, the release checklist. |
| [`SECURITY.md`](../SECURITY.md) | You are testing behind a login, or you found a vulnerability — how `storageState` session files are stored, why they must never be committed, and the disclosure path. |
| [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md) | You are participating in the project's community spaces. |
| [`LICENSE`](../LICENSE) | Licensing. |

### `docs/` — the deep references

| Document | Read this when |
|---|---|
| [`SCENARIO_FORMAT.md`](SCENARIO_FORMAT.md) | You are hand-writing or reviewing a scenario / suite JSON — the canonical field list, every step verb, the suite wrapper, exit codes. |
| [`AUTHENTICATION.md`](AUTHENTICATION.md) | The thing you want to test sits behind a login — capturing, replaying, validating, and rotating a Playwright `storageState` session. |
| [`CI.md`](CI.md) | You are wiring WebMobAI into GitHub Actions / GitLab CI — which binary to gate on, exit codes, `--workers`, `--shard`, tags, JUnit, artifacts. |
| [`DESIGNED_FOR_AGENTS.md`](DESIGNED_FOR_AGENTS.md) | You want the design principle behind the tool responses — what a selector miss returns, why a ranked candidate list plus page-state triage lets a model recover on its own, the measured recovery rate, and the cases it still gets wrong. |
| [`MCP_DIRECTORY_SUBMISSIONS.md`](MCP_DIRECTORY_SUBMISSIONS.md) | You are listing WebMobAI in the MCP registries and awesome-lists — which ones are worth it, each one's bar, and the prepared submission for each. |
| [`assets/README.md`](assets/README.md) | You are regenerating or installing the repository's social preview image. |
| `README.md` | This page. |

### Package- and agent-level

| Document | Read this when |
|---|---|
| [`mcp-server/README.md`](../mcp-server/README.md) | You installed the npm package `webmobai-mcp` and want the package-level quick reference — binaries, tool table, MCP client config. |
| [`.claude/skills/README.md`](../.claude/skills/README.md) | You use Claude Code and want the 20 packaged testing workflows, the conventions they share, and how to add one. **This is the authority on skills** — nothing else in the repo duplicates it. |

### Source is the final authority

When a document and the code disagree, the code wins. The files that define the
contracts:

| Contract | File |
|---|---|
| Scenario and step shapes | [`mcp-server/src/scenario/types.ts`](../mcp-server/src/scenario/types.ts) |
| Step execution semantics | [`mcp-server/src/scenario/runner.ts`](../mcp-server/src/scenario/runner.ts) |
| Suite and defaults shapes | [`mcp-server/src/suite/types.ts`](../mcp-server/src/suite/types.ts) |
| Tool definitions and schemas | [`mcp-server/src/tools/*.ts`](../mcp-server/src/tools) (16 files, 51 tools) |
| Tool dispatch and browser guards | [`mcp-server/src/server.ts`](../mcp-server/src/server.ts) |
| Browser lifecycle, storageState, tracing | [`mcp-server/src/playwright/browser-manager.ts`](../mcp-server/src/playwright/browser-manager.ts) |
| CLI flags and exit codes | `mcp-server/src/{scenario,suite,doctor,monitor,codegen}-cli.ts`, `auto-test.ts` |

---

## "I want to…" — task routing

### Getting started

| Task | Go to |
|---|---|
| Install WebMobAI | [`README.md` — Quick Start](../README.md#quick-start), [`USER_MANUAL.md` §1](../USER_MANUAL.md#1-install) |
| Understand what the seven binaries do | [`USER_MANUAL.md` §2](../USER_MANUAL.md#2-the-seven-binaries) |
| Wire the MCP server into Claude Desktop / Claude Code | [`mcp-server/README.md`](../mcp-server/README.md), [`USER_MANUAL.md` §1](../USER_MANUAL.md#1-install) |
| Run something in the next five minutes | [`USER_MANUAL.md` §3](../USER_MANUAL.md#3-five-minute-quick-start) |
| Find out whether my environment is set up correctly | Run `webmobai-doctor`; [`CI.md` §10](CI.md#10-webmobai-doctor-as-a-preflight-step); the `troubleshooting-webmobai-setup` skill |

### Testing a website

| Task | Go to |
|---|---|
| Do a full QA pass on a site | [`USER_MANUAL.md` §4](../USER_MANUAL.md#4-workflows-by-job); the `testing-web-app` skill |
| Look up one MCP tool's parameters or defaults | [`USER_MANUAL.md` §7](../USER_MANUAL.md#7-mcp-tool-reference) |
| Know which tools need a launched browser | [`USER_MANUAL.md` §7](../USER_MANUAL.md#7-mcp-tool-reference) — the "Browser" column |
| Audit accessibility / performance / SEO / security / PWA | [`FEATURES.md` §2](../FEATURES.md#2-shipped-capabilities); the matching `auditing-web-*` skill |
| Get an official Lighthouse 0-100 score | [`USER_MANUAL.md` §7](../USER_MANUAL.md#7-mcp-tool-reference) (`webmobai_lighthouse_audit`); the `auditing-web-lighthouse` skill |
| Compare screenshots across deploys | [`SCENARIO_FORMAT.md` — `visualSnapshot`](SCENARIO_FORMAT.md#visualsnapshot); the `regression-web-visual` skill |
| Roll back a visual baseline I updated by mistake | `webmobai_visual_baseline_list_versions` + `webmobai_visual_baseline_restore_version` in [`USER_MANUAL.md` §7](../USER_MANUAL.md#7-mcp-tool-reference) |
| Force an API failure / offline / slow network | [`SCENARIO_FORMAT.md` — `route`](SCENARIO_FORMAT.md#route); the `testing-web-error-states` skill |
| Work out why a selector stopped matching | `webmobai_describe_selector`; the `debugging-web-selectors` skill |

### Behind a login

| Task | Go to |
|---|---|
| Test a page that requires being logged in | [`AUTHENTICATION.md`](AUTHENTICATION.md) |
| Capture a session once and replay it | [`AUTHENTICATION.md` §3](AUTHENTICATION.md#3-creating-a-session--three-surfaces) |
| Handle MFA / CAPTCHA / SSO | [`AUTHENTICATION.md` §4](AUTHENTICATION.md#4-manual-mfa-and-the-pauseformanual-verb) — read the caveat before writing a capture scenario |
| Check whether my saved session has expired | `webmobai-doctor --storage-state <file>`; [`AUTHENTICATION.md` §5](AUTHENTICATION.md#5-validating-a-session--webmobai-doctor) |
| Store a session safely in CI | [`AUTHENTICATION.md` §6](AUTHENTICATION.md#6-ci-handling) and [§7](AUTHENTICATION.md#7-secret-hygiene) |

### Writing repeatable tests

| Task | Go to |
|---|---|
| Hand-write a scenario JSON | [`SCENARIO_FORMAT.md`](SCENARIO_FORMAT.md) |
| Record a flow instead of writing it | `webmobai-codegen <url>`; [`SCENARIO_FORMAT.md` — Generating scenarios](SCENARIO_FORMAT.md#generating-scenarios) |
| Turn a plain-English description into a scenario | `webmobai_generate_scenario_from_prompt`; the `authoring-web-scenarios` skill |
| Group scenarios into a suite | [`SCENARIO_FORMAT.md` — Suite format](SCENARIO_FORMAT.md#suite-format-parallel--sharded) |
| Understand why a step failed when the tool "worked" | [`SCENARIO_FORMAT.md` — Step failure semantics](SCENARIO_FORMAT.md#step-failure-semantics-v140) |

### CI

| Task | Go to |
|---|---|
| Make a build fail when the site regresses | [`CI.md` §1–2](CI.md#1-which-binary-for-which-gate) |
| Split tests across machines | [`CI.md` §5](CI.md#5-sharding----shard-kn) |
| Run scenarios in parallel on one machine | [`CI.md` §4](CI.md#4-parallelism----workers) |
| Filter by tag without accidentally testing nothing | [`CI.md` §6](CI.md#6-tag-filtering) |
| Show results in my CI's test tab | [`CI.md` §8](CI.md#8-junit-xml-wiring) |
| Find where the reports and traces went | [`CI.md` §7](CI.md#7-reporters-and-where-each-artifact-lands), [`USER_MANUAL.md` §8](../USER_MANUAL.md#8-reports-and-artifacts) |
| Copy-paste a working pipeline | [`CI.md` §11](CI.md#11-github-actions--complete-example) (GitHub Actions) or [§12](CI.md#12-gitlab-ci-equivalent) (GitLab CI) |
| Watch a URL over time and get alerted | `webmobai-monitor`; the `monitoring-web-regressions` skill |

### Contributing

| Task | Go to |
|---|---|
| Set up a dev environment | [`CONTRIBUTING.md` — Development Setup](../CONTRIBUTING.md#development-setup) |
| Add an MCP tool | [`CONTRIBUTING.md` — Adding a New MCP Tool](../CONTRIBUTING.md#adding-a-new-mcp-tool) |
| Add a scenario step verb | [`CONTRIBUTING.md` — Adding a Scenario Step Type](../CONTRIBUTING.md#adding-a-scenario-step-type) |
| Add a Claude Code skill | [`.claude/skills/README.md`](../.claude/skills/README.md) — the authority; [`CONTRIBUTING.md` — Adding a New Skill](../CONTRIBUTING.md#adding-a-new-skill) points there |
| Update the counts a change invalidates | [`CONTRIBUTING.md` — Keeping docs honest](../CONTRIBUTING.md#keeping-docs-honest) |
| Cut a release | [`CONTRIBUTING.md` — Release checklist](../CONTRIBUTING.md#release-checklist) |
