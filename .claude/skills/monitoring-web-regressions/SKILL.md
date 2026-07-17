---
name: monitoring-web-regressions
description: Use when the user wants to track a URL over time and be told when it regresses — read stored run history, check the latest run against the historical median, and stand up continuous scheduled monitoring. Triggers on "monitor this site", "run history", "did it regress", "regression detection", "track over time", "alert me when", "trend", "compare to baseline", "watch this URL", "scheduled test".
---

# Monitoring Web Regressions

## Overview

This skill answers **"is this URL getting worse over time?"** It works over WebMobAI's persisted run history — every completed auto-test/monitor run appends a summary (LCP, CLS, FCP, test pass count, a11y issue count, console error count) to `~/.webmobai/history.json`. The skill does three things:

1. **Surfaces history** — read the trend of past runs for a URL (`webmobai_get_run_history`).
2. **Explains a regression** — compare the latest run against the **median** of recent runs and report which metrics deviated (`webmobai_check_regressions`).
3. **Documents continuous monitoring** — how to stand up the `webmobai-monitor` binary so runs keep accumulating on a schedule with optional webhook alerts.

It does **not** run a fresh browser test itself. If there is no history yet — or the user wants a new measurement *now* — hand off to `testing-web-app` (full run, writes a history entry) or `auditing-web-performance` (Vitals only). This skill reads and explains what those runs recorded.

## When to Use

Trigger keywords: monitor, run history, "did it regress", regression detection, track over time, alert me when, trend, compare to baseline, watch this URL, scheduled test.

Use this when the target has **already been tested at least twice** and the question is about *change*, not a single snapshot. For a one-time before/after visual comparison, use `regression-web-visual` instead — that's pixel diffing, this is metric trending.

## Inputs You Need

1. **URL** (required for regression check). History is keyed by exact URL string — `https://x.com` and `https://x.com/` are different keys. Confirm the exact form the user tests with.
2. **Baseline size** (optional). How many prior runs form the median. Default 5.
3. **Sensitivity** (optional). Per-metric deviation threshold in percent. Default 10. Lower = more sensitive, more false positives.
4. **For continuous monitoring**: an interval ("30s", "5m", "1h") and, optionally, an alert webhook URL to POST regression bundles to.

## Workflow

This skill is **mostly offline** — reading stored history needs no browser. Only launch Chromium if the user also wants a fresh run captured first (and prefer handing that to `testing-web-app`).

### 1. Read the trend
`webmobai_get_run_history` with `url` (to scope to one target) and `limit` (default 20). Returns most-recent-first: per run, the timestamp, LCP/CLS/FCP, `passed/totalTests`, a11y issue count, console error count. Read this to describe the trajectory — is LCP creeping up, did console errors appear three runs ago, is the pass rate slipping?

If it returns "No history found", there is nothing to trend. Tell the user to run `testing-web-app` first (that writes the first entry), then come back.

### 2. Check the latest run against the median
`webmobai_check_regressions` with `url` (required), `baseline_runs` (default 5), `threshold_pct` (default 10). It takes the **latest** run for that URL and compares each metric to the **median** of the prior baseline runs, returning findings tagged `regression` or `improvement`. Needs **2+ runs** for the URL or it returns "Not enough history".

Report the findings verbatim-ish — each finding message names the metric, the baseline median, the current value, and the delta. Group regressions first (that's the answer to "did it regress?"), then note any improvements.

### 3. Explain the regression in plain terms
Translate the raw findings for the user: which metric moved, by how much, whether it crosses a user-impact line (e.g. LCP going from "Good" into "Needs Improvement"), and what typically causes that class of regression (new blocking script, larger hero image, a shifted layout, a newly-thrown console error). Use the README status vocabulary — a metric past threshold but still within spec is a `warning`; one that crosses into user-breaking territory is a `fail`.

### 4. Recommend a next action
- Regressions found → point at the skill that diagnoses that class: `auditing-web-performance` for Vitals regressions, `running-web-smoke-test` for new console errors, `auditing-web-accessibility` for a rising a11y count.
- No regressions → say so plainly and note the baseline size, so the user knows how much history backed the verdict.

### 5. (Optional) Stand up continuous monitoring
To keep history growing on a schedule without manual runs, document the `webmobai-monitor` binary (one of the six WebMobAI binaries):

```
webmobai-monitor <url> [config-json] --interval=5m --alert-webhook=<url>
```

- `--interval=<duration>` — `30s`, `5m`, `1h` (default `5m`). Each tick spawns a full auto-test run and appends it to `~/.webmobai/history.json`.
- `--once` — run a single iteration and exit (useful to seed the first entries or as a cron body).
- `--alert-webhook=<url>` — after each run the monitor calls the same regression logic as `webmobai_check_regressions`; if the latest run regressed against the median it POSTs a JSON bundle (`url`, `latestRunId`, `timestamp`, `baselineRuns`, `regressions[]`) to this webhook.
- Runs in the foreground; `Ctrl-C`/SIGINT finishes the current run then exits cleanly. For true scheduling, wrap `--once` in cron/launchd, or leave the long-running loop under a process supervisor.

The MCP tools in steps 1-2 then **read and explain** the history this binary accumulates.

## Tools Used

- `mcp__webmobai__webmobai_get_run_history` — trend of past runs for a URL
- `mcp__webmobai__webmobai_check_regressions` — latest run vs median of recent runs

Plus the **`webmobai-monitor` binary** (CLI, not an MCP tool) for scheduled runs + webhook alerts.

No browser tools are required for the read/explain path. If the user wants a *fresh* run captured, don't reimplement it here — invoke `testing-web-app`, which launches the browser, tests, and writes the next history entry.

## Output

```
REGRESSION CHECK — https://example.com  (baseline: median of last 5 runs)

Trend (last 6 runs):
  2026-07-14  LCP 2100ms  CLS 0.04  tests 18/18  a11y 3  console 0
  2026-07-13  LCP 1980ms  CLS 0.04  tests 18/18  a11y 3  console 0
  ...

Regressions (1):
  - LCP: 2600ms vs median 1990ms (+31%) — crosses "Good" → "Needs Improvement"

Improvements (0)

Verdict: WARNING — LCP regressed ~31% since the last deploy. Likely a heavier
hero asset or a new blocking script. Next: run auditing-web-performance to see
the LCP element and the request waterfall.
```

## Tips & Gotchas

- **History is per-machine.** `~/.webmobai/history.json` is local to whatever machine ran the tests. CI runs and your laptop keep separate histories — a regression check only sees runs recorded on the *same* machine. Set this expectation honestly; there is no shared/remote history store.
- **Exact-URL keyed.** Trailing slashes, query strings, and `www.` all fork the history. If a check says "not enough history" but the user swears they've tested it, check the URL form.
- **Median, not last-run.** The baseline is the *median* of N prior runs, so a single noisy run won't trip a false regression — and won't mask a real one. That's why 2 runs is the bare minimum and 5+ gives a trustworthy baseline.
- **This skill doesn't measure — it reads.** If there's no history, there's nothing to compare. Seed it with a `testing-web-app` run (or `webmobai-monitor --once`) first.
- **Threshold tuning.** Perf metrics are inherently noisy; `threshold_pct: 10` is a reasonable default. Drop to 5 only when the user genuinely wants early warning and will tolerate false positives.
- **Webhook is fire-and-forget.** The monitor logs and continues if the webhook is down — a failed POST never stops monitoring. Don't rely on it as a guaranteed delivery channel.

## Example Invocations

User: *"Has https://example.com regressed since we last tested it?"*
→ `webmobai_get_run_history` scoped to the URL for the trend, then `webmobai_check_regressions` with defaults. Report the trajectory and any flagged metric, verbatim deltas, then a verdict.

User: *"Show me the run history for my staging site and tell me if perf is trending down."*
→ `webmobai_get_run_history` for that URL, describe the LCP/CLS/FCP trajectory across the entries. If it's slipping, follow with `webmobai_check_regressions` to quantify against the median.

User: *"Monitor https://shop.foo.com every 10 minutes and ping our Slack webhook if it regresses."*
→ Explain and hand them the `webmobai-monitor https://shop.foo.com --interval=10m --alert-webhook=<slack-url>` invocation, note it runs in the foreground / needs a supervisor for 24-7, and that alerts fire on regression vs the historical median.

User: *"Did LCP get worse after today's deploy? Be strict about it."*
→ `webmobai_check_regressions` with `threshold_pct: 5` for higher sensitivity. Report the LCP finding specifically and caveat that a tighter threshold means more false positives on a noisy metric.
