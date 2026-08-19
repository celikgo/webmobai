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
3. **Login required?** If the entry page is auth-gated, don't re-drive the login form on every audit — capture a session once and launch from it. See `testing-web-authenticated-sessions` (`webmobai_save_storage_state`, then `storage_state_path` on `webmobai_launch_browser`). Never invent credentials. Note that a replayed `storageState` carries cookies and localStorage but **not** service-worker registrations or the Cache Storage they populate, so the SW must re-register on the replayed load — give it a beat (step 2) before auditing.

## Workflow

### 1. Launch
`webmobai_launch_browser` with `headless: false` (let the user watch), `record_video: false` (an audit needs no replay).

### 2. Navigate
`webmobai_navigate` to the URL. Let it settle — service workers register asynchronously after load. If the site is a heavy SPA, a brief `webmobai_wait_for` on a mount selector before auditing avoids reading the page before the SW registers.

### 3. Run the PWA audit
`webmobai_pwa_audit`. Pass `test_offline: true` **only** if the user asked about offline support; otherwise omit it (defaults to `false`). The tool checks manifest → service worker → HTTPS → (optional) offline, and returns a markdown findings list grouped by severity (`high`, `medium`, `low`, `info`) with a per-rule breakdown.

### 4. Interpret the findings
Map the returned rules into the four groups for the user. This is the complete rule set — don't re-grade the severities:
- `manifest-link-missing` (high) → no `<link rel=manifest>` in the head; nothing else about the manifest is checked.
- `manifest-fetch-failed` (high) → the manifest URL returned a non-2xx. The audit stops there; no field checks run.
- `manifest-invalid-json` (high) → the body didn't `JSON.parse`. Again, field checks are skipped.
- `manifest-fetch-error` (high) → the in-page `fetch()` threw (CORS, CSP, network). Distinct from `manifest-fetch-failed`, and easy to miss.
- `manifest-missing-<field>` (medium) → one per absent/empty required field: `name`, `short_name`, `start_url`, `display`, `icons`.
- `manifest-icon-too-small` (medium) → largest parsed icon side is < 192; Chrome won't offer install.
- `manifest-invalid-display` (low) → `display` not one of `fullscreen`, `standalone`, `minimal-ui`, `browser`.
- `sw-not-supported` (info) → the browser doesn't expose `navigator.serviceWorker` at all.
- `sw-not-registered` (medium) → no service worker registered for this origin; no offline, no install prompt.
- `sw-registration-inactive` (low) → registration(s) exist but none are `active` yet.
- `pwa-not-https` (medium) → not HTTPS and not `http://localhost`; SW can't register at all.
- `offline-no-fallback` (medium) → offline reload rendered nothing (or the reload threw).
- `offline-renders` (info) → good PWA behavior.

Output is headed `# PWA audit — <url>` with `Found N findings: N high, N medium, N low, N info.` An empty findings list returns exactly `All PWA heuristics pass.`

### 5. Record results (optional)
If this is part of a larger reported session, log grouped entries via `webmobai_add_test_result` under the `Content` category — one entry per group (Manifest, Service Worker, HTTPS, Offline). `category` is a free string, so `Content` is a convention that keeps report grouping consistent; `title`, `status`, `category`, and `description` are all required. Map high → `fail`, medium → `warning` or `fail` by user impact, low/info → `pass`/`warning`.

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

- **This is heuristics, not a full Lighthouse PWA audit.** It checks presence/validity, not caching strategy quality, push, or background sync. Say so if the user expects a Lighthouse score. For official 0-100 category scores, hand off to `auditing-web-lighthouse`.
- **Audit the right page.** The manifest and SW usually live on the app entry route, not a marketing subpage. If nothing is found, confirm the URL.
- **HTTPS is the gate, and only `localhost` is exempt.** The check is literally "URL starts with `https://` or `http://localhost`". A dev server on `http://127.0.0.1:3000` or `http://dev.local` is therefore flagged `pwa-not-https` even though the browser itself treats `127.0.0.1` as a secure context. Read that finding as a false positive on a loopback IP, not as a real defect. On genuine plain HTTP the SW cannot register at all — expect `sw-not-registered` alongside it; fix HTTPS first, since the other findings are downstream.
- **The manifest is fetched by the page, not by Playwright.** The audit runs `fetch(manifestUrl)` inside the page, so it inherits the page's cookies, CSP, and — importantly — **any active `webmobai_route` interception**. If you armed a route in the same session (see `testing-web-error-states`), unroute before auditing or you may be validating a mock. A CSP `connect-src` that blocks the manifest origin surfaces as `manifest-fetch-error`, not as a manifest problem.
- **The icon-size check only understands `WxH`.** Sizes are parsed with `/^(\d+)x(\d+)$/` and compared on the **width**. A single scalable icon declared `sizes="any"` (the normal way to ship an SVG) parses to 0 and trips `manifest-icon-too-small` even though Chrome accepts it. Also, the check runs only when `icons` is a non-empty array — an absent `icons` field reports as `manifest-missing-icons` instead.
- **Manifest failures short-circuit.** `manifest-fetch-failed`, `manifest-invalid-json`, and `manifest-fetch-error` return immediately, so you get **no** field, display, or icon findings on the same run. Fix the fetch/parse first, then re-audit for the rest — don't report "only one manifest problem."
- **Offline mutates state.** `test_offline: true` reloads under a forced-offline context. Run it last, or on a throwaway navigation — don't run it on a page you still need in its current state. The tool restores online mode in a `finally`, so a thrown reload still leaves the context online.
- **The offline verdict is crude.** "Rendered usefully" means `document.body.innerText.trim().length > 0` after a reload with a 5 s timeout. A branded offline page passes; so does a page showing a single error string. It does not verify the *content* is the cached app shell.
- **SW registration is async.** Auditing immediately after navigate can miss a SW that registers a beat later. Give the page a moment (step 2) on SPA-heavy sites. `sw-registration-inactive` frequently means exactly this — you looked too early — so re-run before reporting it as a defect.
- **Don't confuse this with performance.** "Is my PWA fast?" is `auditing-web-performance`. This skill only speaks to installability and offline.

## Example Invocations

User: *"Is https://app.example.com installable as a PWA?"*
→ Launch, navigate, run `webmobai_pwa_audit` (no offline), report the four-group verdict.

User: *"Check the service worker and manifest on our web app, and see if it works offline."*
→ Same flow but pass `test_offline: true` so the audit adds the offline-fallback check; call out the offline result explicitly.

User: *"Why won't Chrome show the 'Add to Home Screen' prompt on https://shop.example.com?"*
→ Run the audit and translate the blocking findings — most often a missing/incomplete manifest, a missing ≥192×192 icon, no registered service worker, or non-HTTPS.

User: *"Full PWA readiness report for staging."*
→ Run the audit, log grouped `webmobai_add_test_result` entries under `Content`, then `webmobai_generate_report` and surface the path.
