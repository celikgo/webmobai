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
2. **Login required?** If the meaningful cookies only appear after login, ask for credentials — session/auth cookies are exactly where flag hygiene matters most.

## Workflow

### 1. Launch
`webmobai_launch_browser` with `headless: false` (let the user watch), `record_video: false` (a header/cookie scan needs no replay).

### 2. Navigate
`webmobai_navigate` to the URL. This must land on the real page — the audit reads the CSP header, the network log, and the browser-context cookies for whatever is loaded now. If a login wall is in the way and you have no credentials, stop and report "blocked, not audited."

### 3. (If needed) reach the page that has the cookies
The audit only sees cookies set for the current context. If the interesting cookies appear post-login or post-action, drive to that state first with `webmobai_click` / `webmobai_type` before auditing.

### 4. Run the audit
`webmobai_security_audit` — takes no arguments. It returns a Markdown report titled `Security audit — <url>` with a severity summary line (`N high, N medium, N low, N info`) and findings grouped under `## High / ## Medium / ## Low / ## Info`. Each finding has a `rule` slug (e.g. `csp-missing`, `csp-unsafe-inline-script-src`, `mixed-content`, `cookie-attribute-missing`, `cookie-samesite-none-insecure`, `https`) and a description.

### 5. Group findings into results
For each severity bucket, log a `webmobai_add_test_result` under a security category with the mapped status (see below). Keep entries grouped — one per severity or one per rule family, not one per cookie.

Severity → status mapping:
- `high` → `fail` (missing CSP script constraint, `unsafe-inline`/`unsafe-eval`, mixed content, plain HTTP, `SameSite=None` without `Secure`, or an auth/session cookie missing flags)
- `medium` → `warning` (CSP missing/weak on a low-risk page, non-session cookie missing flags)
- `low` / `info` → `warning` or `pass` — note but don't alarm

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
  Summary: 2 high, 1 medium, 0 low

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
- **Mixed content is under-detected.** The current implementation derives mixed content from the *network-error* log, so it catches `http://` subresources that failed — it does not yet listen on every request. A clean mixed-content result is weaker evidence than a clean CSP result. Say "no mixed content detected," not "no mixed content exists."
- **Audit the page that has the cookies.** CSP and cookies are per-page/per-context. The homepage often has neither a strict CSP nor auth cookies; the app page behind login is where findings live.
- **CSP source matters.** The tool accepts either a real `Content-Security-Policy` response header or a `<meta http-equiv>` tag. A header-based CSP is stronger; if only a meta CSP exists, mention it.
- **`SameSite=None` without `Secure`** is flagged high because browsers reject such cookies outright — treat it as a real bug, not a nitpick.
- **Don't guarantee anything.** Frame every finding as "the scan observed X," and hand off security-critical assurance to a real security review.

## Example Invocations

User: *"Run a security audit on https://app.example.com — check the CSP and cookie flags."*
→ Launch, navigate, `webmobai_security_audit`, report grouped high/medium/low with the hygiene caveat.

User: *"Is https://shop.foo.com secure? Are the session cookies HttpOnly?"*
→ Audit the page; if session cookies only exist after login, ask for creds, drive to the logged-in state, then audit. Report the cookie-flag findings by name — never values — and clarify this is hygiene, not a full security assessment.

User: *"Check https://staging.bar.com for mixed content and security headers."*
→ Run the audit, focus the summary on `mixed-content` and `csp-*` findings, and note that mixed-content detection is best-effort (network-error-derived), so a clean result isn't proof.

User: *"Do a full security pentest of my site."*
→ Set expectations: this skill does header/cookie/CSP hygiene only, not penetration testing. Offer to run the hygiene scan and recommend a dedicated pentest / DAST tool for the rest.
