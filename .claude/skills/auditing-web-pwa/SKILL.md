---
name: auditing-web-pwa
description: Use when the user wants to check Progressive Web App / installability readiness — web app manifest, service worker, HTTPS, and offline capability. Triggers on "PWA audit", "is it installable", "service worker", "web app manifest", "offline support", "add to home screen", "PWA readiness".
---

# Auditing Web PWA Readiness

## Overview

This skill answers one question: **is this page a well-formed, installable Progressive Web App?** It runs `webmobai_pwa_audit` on the currently-loaded page and reports four groups of signals:

- **Manifest** — is there a `<link rel=manifest>`, does it fetch and parse, and does it have the required fields (`name`, `short_name`, `start_url`, `display`, `icons`) plus a ≥192×192 icon.
- **Service worker** — is one registered for the origin, and is it active.
- **HTTPS** — a PWA prerequisite; service workers won't register on non-HTTPS (non-localhost) origins.
- **Offline** — *optional* — flips the context offline, reloads, and checks the page still renders a cached shell.

Scope is deliberately narrow: **installability and offline hygiene, not a Lighthouse-grade PWA score.** It does not measure performance, does not test push notifications, background sync, or app-shell caching strategy, and does not install the app. For load speed and Web Vitals, hand off to `auditing-web-performance`. For a full QA pass, use `testing-web-app`.

## When to Use

Trigger keywords: PWA audit, is it installable, add to home screen, service worker, web app manifest, offline support, PWA readiness.

Use when the user cares specifically about install/offline capability. If they say "audit the site" broadly, default to `testing-web-app`.

## Inputs You Need

1. **URL** (required). The exact page to audit — usually the app's entry route (`start_url`), since that's where the manifest and SW are wired up.
2. **Test offline?** (optional, default no). Offline testing *mutates page state* (it reloads under a forced-offline context). Only enable it when the user asks about offline behavior, and never mid-flow on a page you still need in its loaded state.
3. **Login required?** If the entry page is auth-gated, ask for credentials — manifest/SW often only load post-auth.

## Workflow

### 1. Launch
`webmobai_launch_browser` with `headless: false` (let the user watch), `record_video: false` (an audit needs no replay).

### 2. Navigate
`webmobai_navigate` to the URL. Let it settle — service workers register asynchronously after load. If the site is a heavy SPA, a brief `webmobai_wait_for` on a mount selector before auditing avoids reading the page before the SW registers.

### 3. Run the PWA audit
`webmobai_pwa_audit`. Pass `test_offline: true` **only** if the user asked about offline support; otherwise omit it (defaults to `false`). The tool checks manifest → service worker → HTTPS → (optional) offline, and returns a markdown findings list grouped by severity (`high`, `medium`, `low`, `info`) with a per-rule breakdown.

### 4. Interpret the findings
Map the returned rules into the four groups for the user. Key rules to translate:
- `manifest-link-missing` / `manifest-fetch-failed` / `manifest-invalid-json` (high) → no usable manifest; not installable.
- `manifest-missing-<field>` (medium) → manifest present but incomplete.
- `manifest-icon-too-small` (medium) → no ≥192×192 icon; Chrome won't offer install.
- `manifest-invalid-display` (low) → `display` not one of fullscreen/standalone/minimal-ui/browser.
- `sw-not-registered` (medium) → no service worker; no offline, no install prompt.
- `sw-registration-inactive` (low) → SW registered but not yet active.
- `pwa-not-https` (medium) → not HTTPS/localhost; SW can't register at all.
- `offline-no-fallback` (medium) → offline reload rendered nothing.
- `offline-renders` (info) → good PWA behavior.

An empty findings list means "All PWA heuristics pass."

### 5. Record results (optional)
If this is part of a larger reported session, log grouped entries via `webmobai_add_test_result` under the `Content` category — one entry per group (Manifest, Service Worker, HTTPS, Offline). Map high → `fail`, medium → `warning` or `fail` by user impact, low/info → `pass`/`warning`.

### 6. Report & close
If the user wants a deliverable, `webmobai_generate_report` with the audited URL. Always `webmobai_close_browser` last.

## Tools Used

- `mcp__webmobai__webmobai_launch_browser`
- `mcp__webmobai__webmobai_navigate`
- `mcp__webmobai__webmobai_wait_for` *(conditional — let a SPA mount + SW register)*
- `mcp__webmobai__webmobai_pwa_audit`
- `mcp__webmobai__webmobai_add_test_result` *(conditional — only if part of a reported session)*
- `mcp__webmobai__webmobai_generate_report` *(conditional)*
- `mcp__webmobai__webmobai_close_browser`

## Output

The audit returns markdown like:

```
# PWA audit — https://app.example.com

Found 3 findings: 1 high, 2 medium, 0 low, 0 info.

## High (1)
- **manifest-link-missing** — No <link rel=manifest> in the document head.

## Medium (2)
- **sw-not-registered** — No service worker is registered for this origin.
- **pwa-not-https** — Page isn't HTTPS (or localhost). Service workers won't register.
```

Summarize it for the user as a verdict plus the four groups, e.g.:

```
PWA READINESS: NOT INSTALLABLE — https://app.example.com
  - Manifest:       MISSING (no <link rel=manifest>)
  - Service worker: not registered
  - HTTPS:          fail (served over HTTP)
  - Offline:        not tested
  Next step: add a manifest + register a service worker over HTTPS.
```

## Tips & Gotchas

- **This is heuristics, not a full Lighthouse PWA audit.** It checks presence/validity, not caching strategy quality, push, or background sync. Say so if the user expects a Lighthouse score.
- **Audit the right page.** The manifest and SW usually live on the app entry route, not a marketing subpage. If nothing is found, confirm the URL.
- **HTTPS is the gate.** On plain HTTP (non-localhost), the SW literally cannot register — expect `sw-not-registered` alongside `pwa-not-https`. Fix HTTPS first; other findings may be downstream of it.
- **Offline mutates state.** `test_offline: true` reloads under a forced-offline context. Run it last, or on a throwaway navigation — don't run it on a page you still need in its current state. The tool restores online mode afterward.
- **SW registration is async.** Auditing immediately after navigate can miss a SW that registers a beat later. Give the page a moment (step 2) on SPA-heavy sites.
- **Don't confuse this with performance.** "Is my PWA fast?" is `auditing-web-performance`. This skill only speaks to installability and offline.

## Example Invocations

User: *"Is https://app.example.com installable as a PWA?"*
→ Launch, navigate, run `webmobai_pwa_audit` (no offline), report the four-group verdict.

User: *"Check the service worker and manifest on our web app, and see if it works offline."*
→ Same flow but pass `test_offline: true` so the audit adds the offline-fallback check; call out the offline result explicitly.

User: *"Why won't Chrome show the 'Add to Home Screen' prompt on https://shop.foo.com?"*
→ Run the audit and translate the blocking findings — most often a missing/incomplete manifest, a missing ≥192×192 icon, no registered service worker, or non-HTTPS.

User: *"Full PWA readiness report for staging."*
→ Run the audit, log grouped `webmobai_add_test_result` entries under `Content`, then `webmobai_generate_report` and surface the path.
