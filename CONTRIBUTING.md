# Contributing to WebMobAI

Thank you for your interest in contributing to WebMobAI! This guide will help you get set up.

## Development Setup

### Prerequisites

- **Node.js** 18+ ([download](https://nodejs.org))
- **Rust** stable ([install via rustup](https://rustup.rs))
- **Tauri CLI** v2: `cargo install tauri-cli --version "^2"`

### Clone and Install

```bash
git clone https://github.com/celikgo/webmobai.git
cd webmobai

# Install frontend dependencies
npm install

# Install MCP server dependencies
cd mcp-server
npm install
npx playwright install chromium
cd ..
```

### Run in Development

```bash
# Start the desktop app (opens Tauri window + Vite dev server)
cargo tauri dev

# Or run just the MCP server
cd mcp-server
npm run dev
```

### Build for Production

```bash
# Build MCP server
cd mcp-server && npm run build && cd ..

# Build desktop app (unsigned — local use only)
cargo tauri build
```

Unsigned builds open fine on the developer's own machine but are flagged "damaged" by Gatekeeper on any other Mac. Public releases must be signed and notarized — see below.

## Releasing a signed and notarized macOS build

Without signing + notarization, macOS reports the DMG as "damaged and can't be opened" on end-user machines. Users can work around it with `xattr -cr /Applications/WebMobAI.app`, but the only durable fix is a notarized release.

### One-time setup

1. **Apple Developer Program** membership ([$99/year](https://developer.apple.com/programs/)).
2. Generate a **Developer ID Application** certificate in Apple Developer → Certificates. Download and double-click to install into the login keychain. Verify with:
   ```bash
   security find-identity -v -p codesigning
   # → "Developer ID Application: Your Name (TEAMID)"
   ```
3. Generate an **app-specific password** at [appleid.apple.com](https://appleid.apple.com) → Sign-In and Security → App-Specific Passwords. Used for `notarytool` submissions.
4. Note your **Team ID** from [developer.apple.com/account](https://developer.apple.com/account) (top-right under your name).

### Per-release build

Export the credentials, then build. Tauri reads these env vars at build time and runs signing + notarization automatically.

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export APPLE_ID="you@example.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"   # app-specific password
export APPLE_TEAM_ID="TEAMID"

cd mcp-server && npm run build && cd ..
cargo tauri build
```

`APPLE_SIGNING_IDENTITY` overrides the `null` placeholder in `src-tauri/tauri.conf.json → bundle.macOS.signingIdentity`, so the committed config stays secret-free.

Notarization adds 1–5 minutes to the build; Tauri staples the notarization ticket to the DMG so the app opens offline on first launch.

### Verify the artifact

```bash
# Should show a valid Developer ID signature with hardened runtime + notarization
codesign -dv --verbose=4 /path/to/WebMobAI.app
spctl -a -t open --context context:primary-signature -vv /path/to/WebMobAI_*.dmg
# → "accepted, source=Notarized Developer ID"
```

If `spctl` reports "rejected" or "source=Unnotarized", do not ship the release — re-run with the env vars set, or check the build log for a `notarytool` error.

### Universal (Intel + Apple Silicon) builds

Releases already ship **both** architectures as separate artifacts: `release.yml` builds a
`aarch64-apple-darwin` and an `x86_64-apple-darwin` leg, both on `macos-latest` (the Intel leg
is cross-compiled). To collapse them into a single universal binary instead:

```bash
rustup target add x86_64-apple-darwin aarch64-apple-darwin
cargo tauri build --target universal-apple-darwin
```

This roughly doubles the bundle size; do it when there's demand from Intel-Mac users.

### Release checklist

- [ ] `package.json`, `mcp-server/package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` versions all match. All four — `mcp-server/package.json` is the one actually published to npm as `webmobai-mcp`.
- [ ] The counts asserted across the docs still hold — see [Keeping docs honest](#keeping-docs-honest).
- [ ] `CHANGELOG.md` has an entry for the new version.
- [ ] All four `APPLE_*` env vars are exported.
- [ ] `codesign -dv` reports a Developer ID signature; `spctl` reports "Notarized".
- [ ] `gh release create vX.Y.Z` with the signed `.dmg` and `.app.tar.gz` attached.

## Project Structure

| Directory | Description |
|-----------|-------------|
| `src/` | React frontend — `App.tsx`, `components/`, `hooks/`, `lib/`, `stores/`, `styles/`, `types/` |
| `src-tauri/` | Tauri Rust backend — IPC commands, `tauri.conf.json`, `capabilities/`, icons |
| `mcp-server/` | MCP server + the 7 CLI binaries — Playwright tools, browser automation, tests |
| `docs/` | Deep references — see [`docs/README.md`](docs/README.md) for the index |
| `.claude/skills/` | 20 packaged Claude Code skills (tracked, shared) — see [`.claude/skills/README.md`](.claude/skills/README.md) |
| `.github/workflows/` | `ci.yml` (build + 214 tests + Tauri build) and `release.yml` (npm publish + signed desktop release) |

Inside `mcp-server/src/`:

| Directory / file | Description |
|-----------|-------------|
| `index.ts` | `webmobai-mcp` entry — stdio MCP server |
| `server.ts` | Tool-group dispatch table, `requiresBrowser` guards, MCP resources |
| `auto-test.ts`, `scenario-cli.ts`, `suite-cli.ts`, `codegen-cli.ts`, `monitor-cli.ts`, `doctor-cli.ts` | The six CLI binary entry points |
| `tools/` | 16 files, 51 MCP tool definitions + handlers |
| `playwright/` | `BrowserManager` (lifecycle, storageState, tracing, throttling), page analyzer |
| `scenario/` | Scenario types, runner, scaffolder |
| `suite/` | Suite types, loader, tag filter + sharding, parallel runner |
| `visual/` | Baseline store, pixelmatch comparator |
| `perf/` | Lighthouse runner (optional dependency) |
| `ai/` | Claude client, audit summarizer, visual-diff narrator, NL→scenario |
| `utils/` | Report generator, JUnit generator, run history, logger, failure triage, browser install |
| `../test/` | 214 vitest cases across 26 files, plus HTML fixtures and helpers |

## Development Workflow

1. **Fork** the repository
2. **Create a branch** for your feature: `git checkout -b feature/my-feature`
3. **Make changes** and test locally
4. **Type check**: `npx tsc --noEmit` (frontend) and `cd mcp-server && npm run build` (MCP server — `build` is `tsc`, so it doubles as the type check)
5. **Run the tests**: `cd mcp-server && npm test` (`vitest run`). CI runs this on every push and PR; new behavior ships with tests.
6. **Update the docs**, including any count that your change invalidates — see [Keeping docs honest](#keeping-docs-honest)
7. **Commit** with a clear message
8. **Push** and open a Pull Request

## Adding a New MCP Tool

There are 16 tool files in `mcp-server/src/tools/`, each exporting a
`get*ToolDefinitions()` / `handle*Tool()` pair. Pick the one your tool belongs
to — most new tools belong in an existing file, not a new one.

| File | Tools | Scope |
|---|---|---|
| `browser-tools.ts` | 9 | Launch/close, navigate, click, type, scroll, screenshot, viewport, storageState |
| `testing-tools.ts` | 11 | Page analysis, interaction, waiting, `evaluate`, console/error inspection |
| `assertion-tools.ts` | 5 | The auto-waiting `assert_*` family |
| `reporting-tools.ts` | 4 | Perf metrics, responsive sweep, session results, report generation |
| `visual-tools.ts` | 3 | Snapshot + baseline version history |
| `ai-tools.ts` | 3 | Claude-backed tools (gated on `WEBMOBAI_ANTHROPIC_API_KEY`) |
| `perf-tools.ts` | 3 | Multi-run perf, network + CPU throttling |
| `accessibility-tools.ts` | 2 | axe-core audit, CDP accessibility tree |
| `history-tools.ts` | 2 | Run history, regression detection (disk-backed, no browser) |
| `route-tools.ts` | 2 | Request interception install/teardown |
| `seo-tools.ts` | 2 | SEO audit, broken-link check |
| `debug-tools.ts` | 1 | `describe_selector` |
| `lighthouse-tools.ts` | 1 | Official Lighthouse scores — kept separate so `lighthouse` + `chrome-launcher` stay optional deps |
| `pwa-tools.ts` | 1 | Manifest / service worker / installability |
| `scenario-tools.ts` | 1 | Deterministic scenario scaffolder |
| `security-tools.ts` | 1 | CSP, mixed content, cookie flags |

1. Add the tool definition to that file's `get*ToolDefinitions()`:
   ```typescript
   {
     name: "webmobai_my_tool",
     description: "Clear description of what this tool does",
     inputSchema: {
       type: "object" as const,
       properties: { /* ... */ },
       required: ["param1"],
     },
   }
   ```

2. Add the handler case in the same file's `handle*Tool()`:
   ```typescript
   case "webmobai_my_tool": {
     // Implementation
     return text("Result message");
   }
   ```

3. **If — and only if — you created a new tool file**, register its group in the
   dispatch table in `mcp-server/src/server.ts`. Since the Sprint 15 refactor
   that replaced 11 copy-pasted guards, `createMcpServer()` holds a
   `ToolGroup[]`; a group that is not in that array is never routed, and the
   tool will not appear in `tools/list`.

   ```typescript
   {
     definitions: getMyToolDefinitions,
     handle: handleMyTool,
     requiresBrowser: true,
   },
   ```

   `requiresBrowser: true` makes the dispatcher pre-check `bm.isLaunched` and
   return `"Browser is not launched. Call webmobai_launch_browser first."`
   without entering your handler. Set it `false` when **any** tool in the group
   works without a browser — then guard the ones that do need it inside the
   handler, as `visual-tools.ts` and `ai-tools.ts` do. Dispatch resolves by
   scanning groups in order and taking the first whose `definitions()` contains
   the name, so tool names must stay globally unique.

4. Add tests under `mcp-server/test/`.

5. Rebuild: `cd mcp-server && npm run build`

6. Update the tool count and the tool reference — see
   [Keeping docs honest](#keeping-docs-honest).

## Adding a Scenario Step Type

A scenario step verb is three coordinated edits plus docs:

1. **`mcp-server/src/scenario/types.ts`** — add a variant to the `ScenarioStep`
   discriminated union. Include `description?: string` unless there is a reason
   not to.
2. **`mcp-server/src/scenario/runner.ts`** — add a `case` to `executeStep()` and
   a label to `stepLabel()`. Both switches are exhaustiveness-checked via
   `never`, so a missing case is a compile error — do not silence it.
   If your verb delegates to an MCP tool handler, wrap the result in
   `requireToolSuccess(result, [...])` with the handler's success prefixes.
   Anything not explicitly whitelisted must fail the step; a verb that reports
   PASS on a tool error is the false-green defect this runner exists to avoid.
3. **`docs/SCENARIO_FORMAT.md`** — document the verb with its exact JSON, every
   optional key, and its defaults, and bump the verb count in the "Step verbs"
   preamble.
4. Add a test in `mcp-server/test/scenario.test.ts` (or a new file).

Note that AI scenario generation has its own vocabulary and zod schema in
`mcp-server/src/ai/scenario-generator.ts`. A new verb is **not** automatically
available to `webmobai_generate_scenario_from_prompt` — add it there too if the
model should be able to emit it.

## Adding a New Skill

`.claude/skills/README.md` is the authority on the skill format, the shared
conventions every skill inherits, and the process for adding one. Read it and
follow it; this file deliberately does not duplicate it.

Two things that live here rather than there:

- A new skill changes the skill count. Update every place it is asserted — see [Keeping docs honest](#keeping-docs-honest).
- Skills are tracked in git and shipped with the repo. Only `.claude/settings.local.json` is gitignored.

## Keeping docs honest

Four numbers are asserted in many places at once, and every past docs audit has
found them drifting apart. If your change moves one of these, update **every**
row before opening the PR.

Re-derive the real value first — never copy it from another doc:

```bash
# MCP tools + tool files
grep -rhoE 'name: "webmobai_[a-z_]+"' mcp-server/src/tools/*.ts | sort -u | wc -l
ls mcp-server/src/tools/*.ts | wc -l

# Binaries
node -e 'console.log(Object.keys(require("./mcp-server/package.json").bin))'

# Tests + test files
cd mcp-server && npx vitest list | wc -l && find test -name '*.test.ts' | wc -l

# Skills
ls -d .claude/skills/*/ | wc -l
```

| Count | Today | Asserted in |
|---|---|---|
| **MCP tools** (and the 16 tool files) | 51 | `README.md` — positioning list, Documentation table, "What's in the box", architecture tree, skills paragraph · `USER_MANUAL.md` §7 header **and its per-group counts, which must sum to the total** · `docs/README.md` — intro and the source-authority table · `FEATURES.md` §1 and the binary table · `mcp-server/README.md` — intro, binary table, `## Available tools (N)` header **and its per-category counts** · `.claude/skills/README.md` — the grouped tool catalog · `CONTRIBUTING.md` — the tool-file table above |
| **Binaries** | 7 | `README.md` · `USER_MANUAL.md` §2 (and its TOC entry) · `FEATURES.md` binary table · `mcp-server/README.md` `## Seven binaries` · `.claude/skills/README.md` · `mcp-server/package.json` `bin` (the source of truth) |
| **Tests** (and test files) | 214 across 26 | `README.md` — "What's in the box" and architecture tree · `FEATURES.md` test-coverage section, **including the per-file table whose Cases column must sum to the total** · `ROADMAP.md` · `CHANGELOG.md` for the release · `CONTRIBUTING.md` structure table above |
| **Skills** | 20 | `README.md` — Documentation table and the skills section · `USER_MANUAL.md` — intro and the Claude-workflows section · `.claude/skills/README.md` — header **and the skills table, which must list every directory** · `docs/README.md` · `CONTRIBUTING.md` structure table above |

Two recurring failure modes worth naming, because both have shipped before:

- **Headline updated, body not.** A past commit bumped the tool count in two headers without adding the missing tool entries beneath them. If you change a total, verify the list underneath actually contains that many items.
- **Sub-counts that don't sum.** Several docs carry per-category or per-file tables under a total. Add the column up; a total that disagrees with its own table is worse than a stale total, because it hides which half is wrong.

Also worth a grep when the relevant thing changes: the default AI model
(`mcp-server/src/ai/config.ts`) and the version string, which must match across
`package.json`, `mcp-server/package.json`, `src-tauri/tauri.conf.json`, and
`src-tauri/Cargo.toml`.

## Adding a UI Component

Frontend uses [shadcn/ui](https://ui.shadcn.com) patterns with Tailwind CSS v4.

1. Create component in `src/components/`
2. Use existing UI primitives from `src/components/ui/`
3. Connect to Zustand stores in `src/stores/` for state
4. Import in `App.tsx` and add to the panel routing

## Code Style

- TypeScript strict mode everywhere
- No `any` types — use proper typing
- Functional components with hooks
- Zustand for state management (no prop drilling)
- Error messages should be actionable

## Reporting Issues

Open an issue at [github.com/celikgo/webmobai/issues](https://github.com/celikgo/webmobai/issues) with:
- Steps to reproduce
- Expected vs actual behavior
- OS, Node.js version, Claude client version
