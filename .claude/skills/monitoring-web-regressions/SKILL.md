---
name: monitoring-web-regressions
description: Use when the user wants to track a URL over time and be told when it regresses — read stored run history, check the latest run against the historical median, and stand up continuous scheduled monitoring. Triggers on "monitor this site", "run history", "did it regress", "regression detection", "track over time", "alert me when", "trend", "compare to baseline", "watch this URL", "scheduled test".
---

# Monitoring Web Regressions

## Overview

This skill answers **"is this URL getting worse over time?"** It works over WebMobAI's persisted run history at `~/.webmobai/history.json` — a plain JSON array, append-only, capped at **200 entries total across all URLs** (oldest dropped on append). Only `webmobai-test` writes to it; `webmobai-monitor` writes indirectly by spawning `webmobai-test`. Neither `webmobai-scenario` nor `webmobai-suite` records history, so a CI suite run leaves no trend behind.

Each entry is:

```json
{
  "id": "…", "url": "https://example.com", "timestamp": 1753027200000, "durationMs": 41234,
  "summary": { "totalTests": 18, "passed": 17, "failed": 0, "warnings": 1 },
  "metrics": { "lcp": 2100, "fcp": 980, "cls": 0.04, "tti": 3100, "ttfb": 210 },
  "accessibilityIssueCount": 3, "consoleErrorCount": 0, "networkErrorCount": 0
}
```

Any metric can be `null`. The entry type also declares optional `browser` / `device` fields, but `webmobai-test` never populates them, so they are absent in practice. Note what is **not** there: no INP, no per-test detail, no screenshots, no report path. A corrupted or unparseable history file is treated as empty rather than raising — "no history" can mean "file is broken," so check the file exists and parses before concluding the user never ran anything.

The skill does three things:

1. **Surfaces history** — read the trend of past runs for a URL (`webmobai_get_run_history`).
2. **Explains a regression** — compare the latest run against the **median** of recent runs and report which metrics deviated (`webmobai_check_regressions`).
3. **Documents continuous monitoring** — how to stand up the `webmobai-monitor` binary so runs keep accumulating on a schedule with optional webhook alerts.

It does **not** run a fresh browser test itself. If there is no history yet — or the user wants a new measurement *now* — hand off to `testing-web-app` (full run, writes a history entry) or `auditing-web-performance` (Vitals only). This skill reads and explains what those runs recorded.

## When to Use

Trigger keywords: monitor, run history, "did it regress", regression detection, track over time, alert me when, trend, compare to baseline, watch this URL, scheduled test.

Use this when the target has **already been tested at least twice** and the question is about *change*, not a single snapshot. For a one-time before/after visual comparison, use `regression-web-visual` instead — that's pixel diffing, this is metric trending.

## Inputs You Need

1. **URL** (required for regression check). History is keyed by exact URL string — `https://x.com` and `https://x.com/` are different keys. Confirm the exact form the user tests with.
2. **Baseline size** (optional). How many prior runs form the median. `baseline_runs` default 5.
3. **Sensitivity** (optional). Per-metric deviation threshold in percent. `threshold_pct` default 10. Lower = more sensitive, more false positives.
4. **For continuous monitoring**: an interval (`30s`, `5m`, `1h`) and, optionally, an alert webhook URL to POST regression bundles to. Both tuning knobs above are **MCP-tool-only** — the monitor binary always alerts on its own hardcoded defaults (see step 5).
5. **Is the URL behind a login?** Then say so up front — this is the one thing the monitor genuinely cannot do well. See step 5's honest limits before promising scheduled monitoring of an authenticated page.

## Workflow

This skill is **mostly offline** — reading stored history needs no browser. Only launch Chromium if the user also wants a fresh run captured first (and prefer handing that to `testing-web-app`).

### 1. Read the trend
`webmobai_get_run_history` with `url` (to scope to one target) and `limit` (default 20). Returns most-recent-first: per run, the timestamp, LCP/CLS/FCP, `passed/totalTests`, a11y issue count, console error count. Read this to describe the trajectory — is LCP creeping up, did console errors appear three runs ago, is the pass rate slipping?

If it returns "No history found", there is nothing to trend. Tell the user to run `testing-web-app` first (that writes the first entry), then come back.

### 2. Check the latest run against the median
`webmobai_check_regressions` with `url` (required), `baseline_runs` (default 5), `threshold_pct` (default 10). It takes the **last** entry for that URL in file order and compares each of seven metrics — `lcp`, `fcp`, `cls`, `tti`, `ttfb`, `consoleErrorCount`, `accessibilityIssueCount` — to the **median** of up to `baseline_runs` prior entries for the same URL, returning findings tagged `regression`, `improvement`, or `noise`. Higher is worse for all seven. `networkErrorCount` and the `summary` pass counts are stored but **never** compared.

Fewer than 2 entries for the URL returns `Not enough history for <url> (have N, need 2+).` But the "need 2+" in that message is misleading, and you should be straight with the user about it: the per-metric comparison needs **2 or more prior values**, and priors exclude the current run. With exactly 2 total runs every metric reports `insufficient history (need 2+ runs, have 1)` as `noise`, so the tool prints "No regressions detected" while having compared nothing. **3 runs is the real minimum for a meaningful verdict; 6+ gives a full 5-run baseline.**

Report the findings verbatim-ish — each finding message names the metric, the baseline median, the current value, and the delta. Group regressions first (that's the answer to "did it regress?"), then note any improvements.

### 3. Explain the regression in plain terms
Translate the raw findings for the user: which metric moved, by how much, whether it crosses a user-impact line (e.g. LCP going from "Good" into "Needs Improvement"), and what typically causes that class of regression (new blocking script, larger hero image, a shifted layout, a newly-thrown console error). Use the README status vocabulary — a metric past threshold but still within spec is a `warning`; one that crosses into user-breaking territory is a `fail`.

### 4. Recommend a next action
- Regressions found → point at the skill that diagnoses that class: `auditing-web-performance` for Vitals regressions, `running-web-smoke-test` for new console errors, `auditing-web-accessibility` for a rising a11y count.
- No regressions → say so plainly and note the baseline size, so the user knows how much history backed the verdict.

### 5. (Optional) Stand up continuous monitoring
To keep history growing on a schedule without manual runs, document the `webmobai-monitor` binary (one of the **seven** WebMobAI binaries):

```
webmobai-monitor <url> [config-json] [--interval=5m] [--once] [--alert-webhook=<url>]
```

| Flag | Value form | Default | Effect |
|---|---|---|---|
| *(positional 1)* | url | required | Target URL. Missing → exit 2 with the usage line. |
| *(positional 2)* | JSON string | `{}` | `RunConfig` passed straight through to `webmobai-test`. |
| `--interval <dur>` / `--interval=<dur>` | both forms | `5m` | Loop period. |
| `--every <dur>` | **space form only** | — | Alias for `--interval`. |
| `--once` | boolean | off | One iteration, then exit. |
| `--alert-webhook <url>` / `--alert-webhook=<url>` | both forms | none | POST the regression bundle. |
| `--config <json>` / `--config=<json>` | both forms | `{}` | Alternative to positional 2. |

Interval grammar is `<number><unit>` with unit `ms`, `s`, `m`, or `h` — `30s`, `5m`, `1.5h`. Anything else throws `Bad interval "<s>". Use a number followed by ms/s/m/h…` and exits 2.

**Gotcha: `--every=5m` is rejected.** Only `--interval` has an `=`-form of the alias pair; `--every=5m` falls into the unknown-flag branch and exits 2 with `Unknown flag: --every=5m`. Any other unrecognized `--` token does the same.

Exit codes: `0` normal stop (`--once` completed, or SIGINT/SIGTERM), `1` fatal inside the loop, `2` argument-parse failure.

Each tick spawns `webmobai-test` as a child process with stdio inherited, so every run's output streams through the monitor. `SIGINT`/`SIGTERM` set a stop flag and the **current run finishes first**; the sleep between runs wakes every 250 ms so Ctrl-C is responsive. It runs in the foreground and writes nothing of its own — for true scheduling, wrap `--once` in cron/launchd, or keep the long-running loop under a process supervisor.

**The alert thresholds are not configurable.** After each run the monitor re-reads the history, takes the **last** entry matching the URL, and calls the same `detectRegressions` used by `webmobai_check_regressions` but with **no options** — a fixed 5-run baseline and a fixed ±10% threshold. There is no `--baseline-runs` and no `--threshold-pct`. If the user wants a stricter gate, they must run `webmobai_check_regressions` themselves with a lower `threshold_pct`; the webhook will keep firing on 10%.

The webhook fires only when at least one finding has `severity: "regression"`. The body is `POST` with `Content-Type: application/json` and exactly this shape:

```json
{
  "url": "https://example.com",
  "latestRunId": "<id of the newest history entry for this URL>",
  "timestamp": 1753027200000,
  "baselineRuns": 5,
  "regressions": [
    {
      "metric": "lcp",
      "current": 2600,
      "baseline": 1990,
      "deltaPct": 30.65,
      "severity": "regression",
      "message": "lcp: +30.7% vs baseline 1990 (regression)"
    }
  ]
}
```

`metric` is one of `lcp`, `fcp`, `cls`, `tti`, `ttfb`, `consoleErrorCount`, `accessibilityIssueCount`. `baselineRuns` is the number of prior runs **actually** found, not the requested 5. `baseline` and `deltaPct` are `null` in the edge case where the baseline median was 0 and the current value is not. Only `severity: "regression"` entries are included — improvements are printed to stdout but never POSTed. There is no signature, no auth header, and no retry.

### 6. Monitoring a URL behind a login — read this before promising it

`webmobai-monitor` spawns `webmobai-test`, and **`webmobai-test` has no `storageState` support at all.** No `--storage-state` flag, no `storage_state_path`, no env var. Be honest about the three consequences:

- The only auth path is the legacy `credentials` field in the config JSON — `webmobai-monitor <url> '{"credentials":{"username":"…","password":"…"}}'`. It is a best-effort heuristic that looks for an email/username input plus `input[type=password]` **on the landing page**, fills them, and presses Enter. It cannot handle a login on a separate route (pass that route as the URL instead), MFA, CAPTCHA, or SSO. If no form is found it logs "No login form found on landing page — skipping auto-login" and carries on measuring the logged-out page — which will silently produce a trend for the wrong page.
- **Credentials would sit in the process argv on every tick.** They are visible to `ps` and to shell history. Don't recommend this for anything but a throwaway test account.
- **A saved `storageState` cannot rescue this, and would expire anyway.** Even where storageState *is* supported (`webmobai_launch_browser`, `webmobai-scenario`, `webmobai-suite`), nothing refreshes it: no expiry check at launch, no retry-on-401, no re-auth loop. A session captured today outlives a 5-minute monitoring interval for exactly as long as the site's own session TTL — often hours, sometimes minutes — and when it lapses the monitored page silently becomes the login page. Every subsequent "run" then trends `/login`, and because the URL key never changes, the regression check compares a login page against a dashboard baseline and reports nonsense.

Practical guidance: monitor a **public** URL (marketing page, status page, docs, a logged-out app shell) on a schedule. For the authenticated surface, run an authenticated `webmobai-suite` from CI on each deploy instead of a wall-clock loop — see `running-web-ci-suites` for the pipeline and `testing-web-authenticated-sessions` for capturing and refreshing the session file, including `webmobai-doctor --storage-state auth.json` as a preflight staleness check.

The MCP tools in steps 1-2 then **read and explain** the history this binary accumulates.

## Tools Used

- `mcp__webmobai__webmobai_get_run_history` — trend of past runs for a URL
- `mcp__webmobai__webmobai_check_regressions` — latest run vs median of recent runs

Both live in the dispatcher's history group with `requiresBrowser: false`, so they work with no browser launched and no MCP session state.

Plus two CLIs (not MCP tools):
- **`webmobai-monitor`** — scheduled runs + webhook alerts.
- **`webmobai-test`** — what the monitor actually spawns; the only binary that writes `~/.webmobai/history.json`. Never gate CI on its exit code: it exits 0 even when checks fail.

No browser tools are required for the read/explain path. If the user wants a *fresh* run captured, don't reimplement it here — invoke `testing-web-app`, which launches the browser, tests, and writes the next history entry.

## Output

```
REGRESSION CHECK — https://example.com  (baseline: median of last 5 runs)

Trend (last 6 runs):
  2026-07-14  LCP 2100ms  CLS 0.04  tests 18/18  a11y 3  console 0
  2026-07-13  LCP 1980ms  CLS 0.04  tests 18/18  a11y 3  console 0
  ...

Regressions (1):
  - lcp: +30.7% vs baseline 1990 (regression) — crosses "Good" → "Needs Improvement"

Improvements (0)

Verdict: WARNING — LCP regressed ~31% since the last deploy. Likely a heavier
hero asset or a new blocking script. Next: run auditing-web-performance to see
the LCP element and the request waterfall.
```

## Tips & Gotchas

- **History is per-machine and unshared.** `~/.webmobai/history.json` is local to whatever machine ran the tests, and the path is not configurable — no env var, no flag. CI runs and your laptop keep separate histories; a regression check only sees runs recorded on the *same* machine. There is no shared or remote history store.
- **The 200-entry cap is global, not per URL.** Appending past 200 drops the oldest entries regardless of which URL they belong to. Monitoring five URLs at a 5-minute interval burns the whole file in under three and a half hours, and the long-tail baseline for each of them disappears with it. Widen the interval or monitor fewer URLs.
- **Exact-URL keyed.** Trailing slashes, query strings, and `www.` all fork the history. `webmobai-test` stores the URL **exactly as it was passed on the command line** — not the post-redirect final URL — so `http://x.com` and `https://x.com/` stay two separate history keys even when a redirect makes them the same page, and re-running with a slightly different spelling silently starts a second key. If a check says "not enough history" but the user swears they've tested it, run `webmobai_get_run_history` with **no** `url` filter and read the exact strings back.
- **Median, not last-run.** The baseline is the *median* of up to N prior runs, so a single noisy run won't trip a false regression — and won't mask a real one. But see step 2: 2 total runs compares nothing, 3 is the real floor, 6+ gives a full 5-run baseline.
- **A zero baseline is a special case.** When the median of the priors is 0 and the current value isn't — the usual shape of "the first console error appeared" — the finding is a `regression` with `deltaPct: null` and the message `<metric>: regression — baseline was 0, current is <n>`. There's no percentage to quote; report it as "new, previously zero."
- **This skill doesn't measure — it reads.** If there's no history, there's nothing to compare. Seed it with a `testing-web-app` run (or `webmobai-monitor --once`) first. Scenario and suite runs do **not** write history.
- **Threshold tuning applies to the MCP tool only.** Perf metrics are inherently noisy; `threshold_pct: 10` is a reasonable default, and dropping to 5 buys early warning at the cost of false positives. The `webmobai-monitor` webhook ignores all of this and always uses ±10% over 5 runs.
- **Webhook is fire-and-forget.** The monitor logs `[monitor] webhook returned <status>` on a non-2xx and `[monitor] webhook POST failed: …` on a throw, then continues — a failed POST never stops monitoring and is never retried. It is not a guaranteed delivery channel, and it carries no signature or auth header, so treat the receiving endpoint as unauthenticated input.
- **The monitored run is headed.** `webmobai-test` hardcodes `headless: false`, so `webmobai-monitor` needs a display server. It will not run on a headless CI runner or a bare SSH session without one. This is the other reason continuous monitoring belongs on a workstation or a desktop-session host, and per-deploy checking belongs in `running-web-ci-suites`.

## Example Invocations

User: *"Has https://example.com regressed since we last tested it?"*
→ `webmobai_get_run_history` scoped to the URL for the trend, then `webmobai_check_regressions` with defaults. Report the trajectory and any flagged metric, verbatim deltas, then a verdict.

User: *"Show me the run history for my staging site and tell me if perf is trending down."*
→ `webmobai_get_run_history` for that URL, describe the LCP/CLS/FCP trajectory across the entries. If it's slipping, follow with `webmobai_check_regressions` to quantify against the median.

User: *"Monitor https://shop.foo.com every 10 minutes and ping our Slack webhook if it regresses."*
→ Hand them `webmobai-monitor https://shop.foo.com --interval=10m --alert-webhook=<slack-url>`. Note that it runs headed in the foreground (needs a display; use a supervisor for 24-7), that alerts fire at a fixed ±10% vs a 5-run median with no way to tune it, and that Slack will not accept the raw bundle — the POST body is the `{url, latestRunId, timestamp, baselineRuns, regressions[]}` JSON above, so they need a receiver that reshapes it into Slack's payload format.

User: *"Did LCP get worse after today's deploy? Be strict about it."*
→ `webmobai_check_regressions` with `threshold_pct: 5` for higher sensitivity. Report the LCP finding specifically and caveat that a tighter threshold means more false positives on a noisy metric.

User: *"Monitor our logged-in dashboard at https://app.foo.com/dashboard every 15 minutes."*
→ Don't agree to it as stated. `webmobai-monitor` spawns `webmobai-test`, which has no storageState support, and no saved session survives an open-ended interval unrefreshed — the loop would quietly start trending `/login`. Offer the two things that do work: monitor a public URL on the schedule, and gate the authenticated surface per deploy with an authenticated suite (`running-web-ci-suites` + `testing-web-authenticated-sessions`). If they insist on the loop, the only lever is the legacy `credentials` config JSON, with its landing-page-only heuristic and its credentials-in-argv exposure spelled out.
