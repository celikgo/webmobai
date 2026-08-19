---
name: auditing-web-security
description: Use when the user wants a security-hygiene audit of a page — Content-Security-Policy, mixed content, and cookie flags (Secure/HttpOnly/SameSite). NOT a penetration test. Triggers on "security audit", "CSP check", "mixed content", "cookie flags", "is this page secure", "security headers", "HttpOnly", "SameSite", "security hygiene".
---

# Auditing Web Security Hygiene

## Overview

This skill runs a **fast, read-only security-hygiene scan** of one loaded page and reports three things, grouped by severity:

1. **Content-Security-Policy** — is a CSP present (header or `<meta>`), and is it weak (`unsafe-inline`, `unsafe-eval`, no `default-src`/`script-src`)?
2. **Mixed content** — an HTTPS page pulling `http://` subresources (also flags a page served over plain HTTP).
3. **Cookie flags** — cookies missing `Secure`, `HttpOnly`, or a strong `SameSite` (Lax/Strict); `SameSite=None` without `Secure` is called out as high.

This is **transport/header/cookie hygiene, NOT a penetration test.** It does no fuzzing, no auth bypass, no injection, no SAST/DAST, no vuln scanning, no dependency CVE check. A clean result means "the obvious hygiene headers are in order," not "this site is secure." Always say so.

For the deliverable HTML report or a broader QA pass, hand off to `testing-web-app`. This skill is the focused security slice.

## When to Use

Trigger keywords: security audit, CSP check, security headers, mixed content, cookie flags, HttpOnly, SameSite, "is this page secure", security hygiene.

Use when the user wants a quick read on header/cookie hygiene for a **specific page**. If they want a full audit, or accessibility/perf/SEO instead, route to the matching skill.

## Inputs You Need

1. **URL** (required). The exact page to audit — `webmobai_security_audit` inspects whatever is currently loaded, so navigate there first. Cookies and CSP are per-page; audit the page that actually matters (e.g. the authenticated dashboard, not just the marketing homepage).
2. **Login required?** Almost always, for this audit. Session/auth cookies are exactly where flag hygiene matters most, and they do not exist before login. Capture a session once and replay it rather than re-driving the login form — see `testing-web-authenticated-sessions` (`webmobai_save_storage_state`, then `storage_state_path` on `webmobai_launch_browser`). Never invent credentials. Caveat: a replayed `storageState` restores cookies with the attributes Playwright recorded, so audit a **freshly logged-in** session when the question is "does our server set the right flags?" — the replay tells you what was saved, not what the server sends today.

## Workflow

### 1. Launch
`webmobai_launch_browser` with `headless: false` (let the user watch), `record_video: false` (a header/cookie scan needs no replay).

### 2. Navigate
`webmobai_navigate` to the URL. This must land on the real page — the audit reads the CSP header, the network log, and the browser-context cookies for whatever is loaded now. If a login wall is in the way and you have no credentials, stop and report "blocked, not audited."

### 3. (If needed) reach the page that has the cookies
The audit only sees cookies set for the current context. If the interesting cookies appear post-login or post-action, drive to that state first with `webmobai_click` / `webmobai_type` before auditing.

### 4. Run the audit
`webmobai_security_audit` — takes no arguments. It returns a Markdown report headed `# Security audit — <url>` with a summary line (`Found N issues: N high, N medium, N low, N info.`) and findings grouped under `## High / ## Medium / ## Low / ## Info`. A clean page returns `No issues found by the heuristics. This is a fast scan; pair with proper SAST/DAST tooling before declaring a site secure.`

The complete rule set, with the severity the tool actually assigns — do not re-grade these:

| Rule | Severity | Fires when |
|---|---|---|
| `csp-missing` | medium | No CSP header **and** no `<meta http-equiv>` CSP |
| `csp-no-default-src` | medium | CSP present but has neither `default-src` nor `script-src` |
| `csp-unsafe-inline-<directive>` | high | `'unsafe-inline'` in `script-src`, `default-src`, or `style-src` |
| `csp-unsafe-eval-<directive>` | high | `'unsafe-eval'` in the same three directives |
| `https` | high | Page URL is not `https://` |
| `mixed-content` | high | An `http://` URL appears in the captured network-error log while the page is HTTPS |
| `cookie-attribute-missing` | high **or** medium | Any of Secure / HttpOnly / SameSite absent. High when the cookie **name** contains `session` or `auth` (case-insensitive), medium otherwise |
| `cookie-samesite-none-insecure` | high | `SameSite=None` without `Secure` — emitted *in addition to* `cookie-attribute-missing` for the same cookie |

Note there is **no `low` rule and no `info` rule** in this tool — every finding is high or medium, so those two buckets are always empty. Only three directives are inspected for unsafe values (`script-src`, `default-src`, `style-src`); `style-src: 'unsafe-inline'` is graded high alongside script-src, which overstates it for a style-only policy — say so if that's the only high finding.

### 5. Group findings into results
For each severity bucket, log a `webmobai_add_test_result` under the category `Security` (the `category` field is a free string — this is a convention, not an enum) with the mapped status. Keep entries grouped — one per severity or one per rule family, not one per cookie.

Severity → status mapping:
- `high` → `fail` (`unsafe-inline`/`unsafe-eval`, mixed content, plain HTTP, `SameSite=None` without `Secure`, or a session/auth cookie missing flags)
- `medium` → `warning` (CSP missing or unconstrained, non-session cookie missing flags)
- A missing CSP is **medium**, not high. Don't inflate it — report it as the gap it is and let the user decide the priority for their threat model.

**Do not put raw cookie values into results.** The tool already reports only cookie *names* and attributes, never values — keep it that way. Report "cookie `session_id` is missing HttpOnly," never the cookie contents.

### 6. (Optional) report
If the user wants a saved artifact, `webmobai_generate_report` with the audited URL. For a quick "is this page secure?" a plain grouped summary is usually enough — don't force a report.

### 7. Close
`webmobai_close_browser`.

## Tools Used

- `mcp__webmobai__webmobai_launch_browser`
- `mcp__webmobai__webmobai_navigate`
- `mcp__webmobai__webmobai_click` *(conditional — reach a post-login/action state)*
- `mcp__webmobai__webmobai_type` *(conditional — login)*
- `mcp__webmobai__webmobai_security_audit`
- `mcp__webmobai__webmobai_add_test_result`
- `mcp__webmobai__webmobai_generate_report` *(optional deliverable)*
- `mcp__webmobai__webmobai_close_browser`

## Output

A grouped, severity-first summary. Example:

```
SECURITY HYGIENE — https://app.example.com/dashboard
  Found 3 issues: 2 high, 1 medium, 0 low, 0 info.

  HIGH (fail)
   - csp-unsafe-inline-script-src: script-src allows 'unsafe-inline' — defeats CSP's XSS mitigation
   - cookie-attribute-missing: cookie "session_id" missing Secure, HttpOnly

  MEDIUM (warning)
   - cookie-attribute-missing: cookie "prefs" missing SameSite (=Lax or Strict)

  Note: hygiene scan only — CSP/mixed-content/cookie flags.
  Not a penetration test. Pair with SAST/DAST before declaring the site secure.
```

If the audit finds nothing, say so plainly and still include the caveat — a clean hygiene scan is not a security guarantee.

## Tips & Gotchas

- **Not a pentest.** No injection, no auth testing, no CVE scanning. Never present a clean result as "this site is secure" — it means the three hygiene checks passed. Always attach the caveat.
- **No cookie values, ever.** Report names and missing flags only. The tool is built to never surface values; don't reconstruct them via `evaluate` and paste them in.
- **Mixed content is badly under-detected — this is the weakest check in the tool.** It derives mixed content from the captured *network-error* log only, so it catches `http://` subresources that **failed to load**; a mixed-content request the browser upgraded or loaded successfully is invisible to it, and the tool acknowledges the gap in its own source. A clean mixed-content result is much weaker evidence than a clean CSP result. Say "no mixed content detected," never "no mixed content exists."
- **The audit never navigates.** `webmobai_security_audit` takes no arguments and reads whatever `webmobai_navigate` last landed on. If you skipped the navigate, or a redirect bounced you to `/login`, you will audit the wrong page and the findings will look deceptively clean.
- **Audit the page that has the cookies.** CSP is per-page. Cookies are read with `context.cookies()`, which is **context-wide** — it returns every cookie the browser context holds, across all domains visited in the session, not just the current page's. A finding may therefore name a cookie from an SSO/IdP or analytics domain you touched earlier in the run. Check the `domain=` in the finding's details line before telling the user it's "their" cookie.
- **CSP source matters, and the header is refetched.** The tool prefers a `Content-Security-Policy` response header and falls back to `<meta http-equiv="content-security-policy">`. The header is **not** read from the document response you actually navigated to — it comes from a fresh `GET` of the same URL through Playwright's request context. On a page reached by POST/redirect, or an origin that varies headers by request, that second fetch can report a CSP the real page never had. Treat a header-sourced CSP as strong evidence, not proof, and mention it when only a meta CSP exists.
- **`Content-Security-Policy-Report-Only` counts as a CSP here.** The header lookup falls back to the report-only variant, so a policy that is merely being *monitored* is analysed as if it were enforcing — and an origin with only a report-only policy will not raise `csp-missing`. If the user is rolling out CSP in report-only mode, say the scan cannot distinguish the two.
- **`SameSite=None` without `Secure`** is flagged high because browsers reject such cookies outright — treat it as a real bug, not a nitpick.
- **Don't guarantee anything.** Frame every finding as "the scan observed X," and hand off security-critical assurance to a real security review.

## Example Invocations

User: *"Run a security audit on https://app.example.com — check the CSP and cookie flags."*
→ Launch, navigate, `webmobai_security_audit`, report grouped high/medium/low with the hygiene caveat.

User: *"Is https://shop.example.com secure? Are the session cookies HttpOnly?"*
→ Audit the page; session cookies only exist after login, so drive to the logged-in state first (or launch from a saved `storage_state_path` — see `testing-web-authenticated-sessions`), then audit. Report the cookie-flag findings by name — never values — check the `domain=` before attributing a cookie to their app, and clarify this is hygiene, not a full security assessment.

User: *"Check https://staging.example.org for mixed content and security headers."*
→ Run the audit, focus the summary on `mixed-content` and `csp-*` findings, and note that mixed-content detection is best-effort (network-error-derived), so a clean result isn't proof.

User: *"Do a full security pentest of my site."*
→ Set expectations: this skill does header/cookie/CSP hygiene only, not penetration testing. Offer to run the hygiene scan and recommend a dedicated pentest / DAST tool for the rest.
