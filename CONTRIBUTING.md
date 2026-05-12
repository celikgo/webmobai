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

Current releases are `aarch64` only. To produce a universal binary that runs on both architectures:

```bash
rustup target add x86_64-apple-darwin aarch64-apple-darwin
cargo tauri build --target universal-apple-darwin
```

This roughly doubles the bundle size; do it when there's demand from Intel-Mac users.

### Release checklist

- [ ] `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` versions all match.
- [ ] `CHANGELOG.md` has an entry for the new version.
- [ ] All four `APPLE_*` env vars are exported.
- [ ] `codesign -dv` reports a Developer ID signature; `spctl` reports "Notarized".
- [ ] `gh release create vX.Y.Z` with the signed `.dmg` and `.app.tar.gz` attached.

## Project Structure

| Directory | Description |
|-----------|-------------|
| `src/` | React frontend — UI components, stores, styles |
| `src-tauri/` | Tauri Rust backend — IPC commands, app config |
| `mcp-server/` | MCP server — Playwright tools, browser automation |

## Development Workflow

1. **Fork** the repository
2. **Create a branch** for your feature: `git checkout -b feature/my-feature`
3. **Make changes** and test locally
4. **Type check**: `npx tsc --noEmit` (frontend) and `cd mcp-server && npm run build` (MCP server)
5. **Commit** with a clear message
6. **Push** and open a Pull Request

## Adding a New MCP Tool

1. Choose the right tool file in `mcp-server/src/tools/`:
   - `browser-tools.ts` — browser control actions
   - `testing-tools.ts` — page analysis and interaction
   - `accessibility-tools.ts` — a11y checks
   - `reporting-tools.ts` — metrics and report generation

2. Add the tool definition to `get*ToolDefinitions()`:
   ```typescript
   {
     name: "webmobai_my_tool",
     description: "Clear description of what this tool does",
     inputSchema: {
       type: "object",
       properties: { /* ... */ },
       required: ["param1"],
     },
   }
   ```

3. Add the handler in `handle*Tool()`:
   ```typescript
   case "webmobai_my_tool": {
     // Implementation
     return text("Result message");
   }
   ```

4. Rebuild: `cd mcp-server && npm run build`

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
