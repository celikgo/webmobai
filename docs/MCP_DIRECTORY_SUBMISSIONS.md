# MCP directory submissions — prepared, not submitted

**Status: staged and waiting.** Everything below is ready to send. Nothing has been submitted,
because submitting means opening pull requests and registry entries under a real GitHub and npm
identity, and that is the repository owner's call to make, not an agent's.

**Every one of these has the same precondition: `webmobai-mcp` must be live on npm.** A directory
entry pointing at a package that 404s is worse than no entry — it is a public, indexed, dated
record of a broken install. Do not submit any of this until `npm view webmobai-mcp version`
returns a version.

Ordered by value, not by effort.

---

## 1. The official MCP Registry — `registry.modelcontextprotocol.io`

The canonical, first-party registry run by the MCP project itself. Sub-registries and client
directories increasingly aggregate from it, so this is the one entry that propagates.

**The bar, and whether this project clears it**

| Requirement | Status |
| ----------- | ------ |
| Package on a supported public registry (npm's `registry.npmjs.org` only) | ⏳ pending publish |
| Namespace ownership proven — `io.github.celikgo/*` via GitHub OAuth | ✅ the account owns the namespace |
| Package ownership proven — `mcpName` in the **published** `package.json` matching the server name | ✅ added to `mcp-server/package.json` **before** publish |
| A valid `server.json` against the current schema | ✅ [`server.json`](../server.json) at the repo root |
| A real, working stdio MCP server | ✅ 51 tools, 219 tests |

> **The `mcpName` timing matters.** The registry verifies ownership by reading `mcpName` out of
> the *published* package. It was added before the first publish deliberately — adding it
> afterwards would mean publishing another npm version purely to satisfy the registry, and npm
> versions are immutable.

**Submission**

`server.json` is already written and validated. From the repo root, once npm publish has landed:

```bash
# 1. Install the publisher CLI
brew install mcp-publisher
#   …or:
#   curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" \
#     | tar xz mcp-publisher && sudo mv mcp-publisher /usr/local/bin/

# 2. Confirm the metadata is valid before authenticating
mcp-publisher validate

# 3. Authenticate as the GitHub account that owns the io.github.celikgo namespace
mcp-publisher login github

# 4. Publish the metadata (the registry stores metadata only — npm hosts the artifact)
mcp-publisher publish
```

Then verify it resolves:

```bash
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=webmobai" | jq
```

**On every future release**, `server.json`'s `version` and `packages[0].version` must be bumped
in lockstep with `mcp-server/package.json` and re-published — a registry entry pinned to 1.4.0
after 1.5.0 ships is stale metadata pointing at an old tarball. Worth automating in
`release.yml` once the first manual publish has proven the flow; the registry documents a
GitHub Actions path using OIDC rather than a stored token.

---

## 2. `punkpeye/awesome-mcp-servers` — ~92.5k stars

By far the largest MCP list, and the one most often scraped by downstream directories. It has a
**📂 Browser Automation** category, which is exactly where this belongs.

**The bar:** a working server, an accurate one-line description, correct category, alphabetical
order within the category, and the house emoji legend. WebMobAI clears it.

**Prepared entry** — 📇 TypeScript/JavaScript, 🏠 local, and 🍎🪟🐧 because the server is Node +
Playwright and runs on all three (this is the npm server, not the desktop app):

```markdown
- [celikgo/webmobai](https://github.com/celikgo/webmobai) 📇 🏠 🍎 🪟 🐧 - Autonomous web QA across Chromium, Firefox and WebKit through 51 tools — navigation, assertions, request mocking, authenticated sessions via saved `storageState`, plus accessibility, performance, SEO, security and PWA audits. Self-healing selectors return a ranked candidate list and page-state triage on a miss, so the model can retry instead of failing (86.7% measured first-retry recovery).
```

Insert in alphabetical position within **📂 Browser Automation**, matching the surrounding
punctuation exactly.

**Process note:** the list maintainer fast-tracks agent-submitted PRs that opt in by appending
`🤖🤖🤖` to the PR title. Use it if an agent opens the PR; omit it if a human does.

---

## 3. `wong2/awesome-mcp-servers` + `mcpservers.org` — ~4.3k stars

The same list backs the [mcpservers.org](https://mcpservers.org) site, so one submission covers
both. Submit either through [mcpservers.org/submit](https://mcpservers.org/submit) or as a PR.

**Prepared entry:**

```markdown
- [WebMobAI](https://github.com/celikgo/webmobai) - Autonomous web QA in a real browser (Chromium/Firefox/WebKit): navigation, assertions, request mocking, authenticated sessions, self-healing selectors, and accessibility/performance/SEO/security/PWA audits.
```

---

## 4. `mcp.so` — marketplace

Web submission at [mcp.so/submit](https://mcp.so/submit). Low effort, meaningful traffic, no bar
beyond a working public server and a repository link. Use the description from §3.

---

## 5. `glama.ai/mcp/servers` — indexed directory

Glama largely crawls public GitHub for MCP servers rather than requiring submission, and scores
them on repository signals — tests, docs, license, activity. Nothing to submit; the useful action
is making sure the repository presents well when it is crawled, which the CI badges, SECURITY.md,
CODE_OF_CONDUCT.md and the eval table already serve.

---

## What NOT to do

- **Do not submit to every aggregator that exists.** Most low-tier MCP directories are SEO farms
  that scrape the lists above; submitting directly to them adds nothing and dilutes the signal.
  §1 and §2 do the real work.
- **Do not submit before npm.** Stated twice on purpose.
- **Do not overstate the platform support.** The npm server runs on macOS, Windows and Linux. The
  *desktop app* shipped macOS-only artifacts until the release matrix was extended — if a
  directory asks about the app specifically rather than the server, answer for the app.

## Verification checklist before any submission

```bash
npm view webmobai-mcp version                      # must return a version, not E404
npx -y webmobai-mcp --help                         # must print usage and exit 0
gh api repos/celikgo/webmobai --jq '{homepage, description}'
```
