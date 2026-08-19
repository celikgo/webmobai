# Security Policy

WebMobAI drives a real browser, and it can drive that browser **as a logged-in user**. That
makes two things security-relevant that would not be in an ordinary test library: the saved
session files it writes, and the pages it is pointed at. This document covers both, plus how to
report a vulnerability.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.4.x   | ✅ Current — fixes land here |
| < 1.4   | ❌ Please upgrade |

Security fixes are released as a new patch version and noted in [CHANGELOG.md](./CHANGELOG.md).

## Reporting a vulnerability

**Do not open a public issue for a security report.**

Use GitHub's private reporting form:
**[Report a vulnerability](https://github.com/celikgo/webmobai/security/advisories/new)**

If private advisories are unavailable to you, email **celik.gokhun@gmail.com** with `WEBMOBAI
SECURITY` in the subject line.

Please include the version, your platform, the steps to reproduce, and what an attacker gains.
A proof of concept helps enormously. If you have a suggested patch, say so and we will
coordinate on it.

What to expect:

| Stage | Target |
| ----- | ------ |
| Acknowledgement of your report | within 3 working days |
| Initial assessment (accepted / not-a-vuln / need more) | within 7 working days |
| Fix released for an accepted report | within 30 days, sooner for anything actively exploitable |

Please give us those 30 days before public disclosure. We will credit you in the advisory and
the changelog unless you would rather stay anonymous.

## Saved session state (`storageState`) — the big one

The single most sensitive artefact WebMobAI produces is the file written by
`webmobai_save_storage_state` (and consumed via `storage_state_path`, `--storage-state`, or a
scenario's `storageState` field).

**What is in it.** It is a [Playwright `storageState`](https://playwright.dev/docs/auth) JSON
document: every cookie for the origins you visited, plus `localStorage` for those origins. In
practice that means **live session tokens** — the bearer of that file is logged in as you, for
as long as those tokens remain valid. It is a credential, not a cache.

**Where it goes.** Nowhere you did not put it. `saveStorageState` writes to the exact path you
pass and nothing else; WebMobAI never uploads it, never bundles it into a report, and never
transmits it off the machine. It is written with your process's normal file permissions, so on
a shared machine set them yourself:

```bash
chmod 600 auth.json
```

**Never commit it.** The repository's `.gitignore` already excludes the conventional names:

```gitignore
auth.json
*.auth.json
*storage-state*.json
```

That protects the default naming. If you save one under a different name, add it yourself. A
session file in git history is a leaked credential even after you delete the file — rotate the
session rather than only deleting the blob.

**Treat it as short-lived.** Generate one per environment, prefer a dedicated test account over
a real user's, never point it at production with an account that can do damage, and re-generate
it rather than passing it between people. `webmobai-doctor --storage-state auth.json` tells you
whether a saved session is still valid without you having to run a whole suite.

**In CI**, inject it from a secret store at run time and let the job's workspace be destroyed
afterwards. Do not bake it into an image or an artifact. Note that WebMobAI's own reports,
traces (`trace.zip`) and screenshots can capture authenticated page content — treat uploaded
CI artifacts from an authenticated run as sensitive too.

## API keys

The optional AI features read **`WEBMOBAI_ANTHROPIC_API_KEY`** from the environment. It is used
only to call the Anthropic API and is never written to reports, logs, or scenario files. When it
is absent the AI tools disable themselves rather than failing. Keep it in your environment or a
secret manager, not in a scenario file or a committed `.env`.

## What WebMobAI does to the pages it visits

This is a testing tool: it navigates, clicks, types, evaluates JavaScript in the page
(`webmobai_evaluate`), and can intercept and rewrite network traffic (`webmobai_route`). Those
are the intended features, and they are also exactly the capabilities that matter if you point
the tool at something you do not own.

**Only run WebMobAI against sites you own or are authorised to test.** The audit tools
(security, SEO, PWA, accessibility) inspect response headers, cookie flags and page content —
they are hygiene checks, **not a penetration test**, and they neither attempt exploitation nor
probe for vulnerabilities.

Because scenarios can contain arbitrary selectors, URLs and evaluated expressions, **treat a
scenario file from an untrusted source the way you would treat a script from an untrusted
source** — read it before you run it.

## Reports and artifacts

Generated reports, screenshots and Playwright traces are written under your session directory
and may contain whatever was on screen, including personal data and authenticated content. They
are local files; nothing is uploaded. Apply the same care when sharing them that you would apply
to a screen recording of the session.

## Scope

In scope: anything that leaks session state or API keys, lets a visited page escape the intended
sandbox and reach the host, causes WebMobAI to write outside the paths it was given, or executes
untrusted input as code on the host.

Out of scope: vulnerabilities in the sites you test (report those to their owners), issues in
Playwright or Chromium themselves (report upstream), and the unsigned macOS builds — the
Gatekeeper warning documented in the README is a known, disclosed gap, tracked in
[CONTRIBUTING.md](./CONTRIBUTING.md), not a vulnerability report.
