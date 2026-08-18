---
name: auditing-web-performance
description: Use when the user wants to measure web performance — Core Web Vitals (LCP, FCP, CLS, INP, TTI, TTFB), load timing, regressions vs. a baseline, or perf at different viewports. Triggers on "performance audit", "Web Vitals", "Core Web Vitals", "LCP", "CLS", "INP", "page speed", "lighthouse perf", "is the site slow", "speed test", "page load time", "TTFB", "perf regression".
---

# Auditing Web Performance

## Overview

This skill measures and reports on web performance using WebMobAI's Web Vitals collection. It captures LCP, FCP, CLS, **INP** (which replaced FID in March 2024), TTI, TTFB, DOM Content Loaded, and full load time for one or more pages, rates each metric against Google's Web Vitals thresholds, and produces an HTML report with findings.

**Scope of the underlying tools** — all four are live-session measurements through the caller's Playwright browser:

- `webmobai_get_performance_metrics` — one run. Emits a markdown table: LCP, FCP, **CLS (running)**, **CLS (at load)**, **TTI (fast)**, INP, TTFB, DOM Content Loaded, Page Load Complete. Optional `strict_tti: true` adds a **TTI (strict)** row computed Lighthouse-style (first 5-second long-task quiet window) — slower, up to ~15s.
- `webmobai_run_perf_multi` — navigates the current browser to `url` N times and aggregates. `runs` defaults to **3**, clamped to 1-10. Reports median / p95 (nearest-rank) / min / max / n for LCP, FCP, CLS, TTI, INP, TTFB. Use it whenever a number is going to be quoted or tracked.
- `webmobai_set_network_throttle` — `slow-3g` (500Kbps/2s) / `fast-3g` (1.5Mbps/562ms) / `slow-4g` (4Mbps/400ms) / `offline`; `null` clears. **`preset` is a required argument.**
- `webmobai_set_cpu_throttle` — `slowdown` multiplier (4 mirrors Lighthouse's mobile profile); `1` or `null` clears. **`slowdown` is a required argument.**

Two things to be precise about:

- **The throttling tools are Chromium-only** (they drive CDP). On Firefox and WebKit the bandwidth presets are silently ignored — no error, just untruthful numbers. The `offline` preset is the exception: it uses Playwright's context-level offline switch and works on every engine.
- **The LCP element fingerprint is collected but not returned by the tool.** `get_performance_metrics` gathers the LCP element's tag / id / class / src / text / size internally and feeds it to the HTML report; the MCP tool's markdown table has metric rows only. To identify the LCP element from a tool call, use the `webmobai_evaluate` snippet below.

What we do **not** do:
- Capture field/RUM data — everything here is lab data from one machine.

For the official 0-100 composite Performance score (the web.dev / PageSpeed number), hand off to `auditing-web-lighthouse` — `webmobai_lighthouse_audit` ships exactly that. This skill gives millisecond diagnosis; that one gives the headline score. They are complementary and it's fine to run both; just don't expect the numbers to line up, since Lighthouse simulates a throttled mid-tier mobile in its own Chrome.

## When to Use

- "Measure performance on …"
- "Get Web Vitals for …"
- "Is the site too slow?"
- "Did my deploy regress LCP?"
- "Compare perf on mobile vs desktop"

If the user wants a complete report (perf + a11y + responsive + errors), use `testing-web-app` instead.

## Inputs You Need

1. **URL(s)** — single page or list. Performance is per-page; "audit the whole site" usually means "audit the top 3-5 pages by traffic."
2. **Viewport** — desktop, mobile, both. Mobile perf is usually where issues hide (heavier JS-per-pixel, slower CPU emulation).
3. **Runs per page** — `webmobai_get_performance_metrics` is one run; `webmobai_run_perf_multi` defaults to **3** and accepts up to 10. Single-run variance is ±15-20%, so anything the user will quote or track should come from `run_perf_multi` and be reported as a median.
4. **Baseline** — if comparing against a prior measurement, get the prior numbers up front, and ask where they came from (this tool, Lighthouse, or DevTools — they are not comparable).
5. **Auth** — pages behind a login need a saved session file; see `testing-web-authenticated-sessions` and launch with `storage_state_path`. Note that Lighthouse cannot do this at all, so gated pages are raw-metrics-only territory.

## Workflow

### 1. Launch
`webmobai_launch_browser`. For perf testing:
- `headless: false` — visible runs are fine for spot-checks; headless matches CI conventions but barely affects metrics
- Default viewport (1280×720). Switch to 375×812 for mobile runs.
- `record_video: false` — video recording can perturb perf measurements. Disable unless the user explicitly wants it.

### 2. For each page in scope:

#### 2a. Cold-load navigation
`webmobai_navigate` to the URL. The tool waits for DOMContentLoaded + network idle, which is what you want for a "page is interactive" baseline.

> **Cold vs warm load**: each session is a fresh Chromium profile, so first navigation = cold load. If you want a warm-load measurement (cached, repeat visit), navigate to a sibling page first, then back to the page under test.

#### 2b. Wait for the page to actually settle
For SPAs and React/Vue apps, the network-idle event may fire before the page is interactive. Add a `webmobai_wait_for` on a stable below-the-fold selector to avoid measuring half-rendered state.

#### 2c. Collect metrics
`webmobai_get_performance_metrics`. The tool returns LCP, FCP, CLS (running), CLS (at load), TTI (fast), INP, TTFB, DOM Content Loaded, and Page Load Complete. Rated rows: LCP, FCP, both CLS rows, TTI, TTFB. **INP and the two load timings print `-` in the Rating column** — there is no threshold table for them; don't invent one.

Add `strict_tti: true` when TTI is the metric under scrutiny — the default TTI is a fast approximation (end of the last long task); the strict one waits for a genuine 5s quiet window and is the one comparable to Lighthouse.

#### 2d. (Recommended) Multi-run aggregation
Don't hand-roll a loop — `webmobai_run_perf_multi` exists for this:

```json
{ "url": "https://example.com/pricing", "runs": 5 }
```

It re-navigates the current browser `runs` times (clamped 1-10, default 3) and returns a median / p95 / min / max / n table across LCP, FCP, CLS, TTI, INP, TTFB. Report the median — perf is heavily right-skewed — and quote p95 when the user cares about worst-case users.

Caveat: it drives the same session, so any throttling you set stays applied across all runs (usually what you want) and the browser is warm after run 1 (usually not what you want for LCP). For strictly cold loads, relaunch between runs.

#### 2e. Annotate with results
Per metric, call `webmobai_add_test_result`:
- `category: "Performance"`
- `status`: `pass` if "Good", `warning` if "Needs Improvement", `fail` if "Poor"
- `title`: "LCP on /pricing — 3.2s (Needs Improvement)"
- `details`: include the threshold and the raw number

### 3. (Optional) Mobile cross-check
If the user asked for desktop only, but the desktop numbers are concerning, briefly switch to mobile:
- `webmobai_set_viewport` to 375×812
- Re-navigate
- Re-collect

Mobile LCP is typically 1.5–2.5× desktop on the same site. For realistic mobile simulation, call `webmobai_set_network_throttle({preset: "slow-4g"})` and `webmobai_set_cpu_throttle({slowdown: 4})` before measurement, and clear them afterwards (`preset: null`, `slowdown: null`) so later measurements in the same session aren't silently throttled. For touch + DPR emulation use `webmobai_launch_browser({device: "Pixel 5"})`. Both throttle tools are Chromium-only.

### 4. (Optional) Compare against stored history
If the user is asking "did this get worse?", not "how fast is it?", there may already be an answer on disk:

- `webmobai_get_run_history` — reads `~/.webmobai/history.json` (capped at 200 entries), optional exact-match `url` filter, `limit` default 20, newest first. Each entry carries LCP / CLS / FCP, pass counts, a11y issue count, and console-error count.
- `webmobai_check_regressions` — takes the **latest** entry for a URL and compares it against the median of the last `baseline_runs` (default 5) at `threshold_pct` (default 10), splitting findings into Regressions and Improvements. It refuses with "Not enough history" below 2 entries for that URL.

Neither tool needs a browser. **Important honesty point: nothing in an MCP session writes to that history.** Entries are appended only by completed `webmobai-test` (and therefore `webmobai-monitor`) runs. If the history is empty, the answer is "no runs have been recorded for this URL", not "no regression" — say so, and point the user at `monitoring-web-regressions` to set up recorded runs over time.

### 5. Report
`webmobai_generate_report` with the primary URL. The HTML report includes the perf metrics section. Surface the report path and the top regressions.

### 6. Close
`webmobai_close_browser`. If you throttled, clearing it first is polite but the session is being torn down anyway.

## Web Vitals Thresholds

These are the ratings the underlying tool uses. Use the same language in your report.

| Metric | Good | Needs Improvement | Poor | What it means |
|--------|------|-------------------|------|---------------|
| **LCP** (Largest Contentful Paint) | ≤2500ms | ≤4000ms | >4000ms | When the biggest above-the-fold content shows up |
| **FCP** (First Contentful Paint) | ≤1800ms | ≤3000ms | >3000ms | When *any* content first paints |
| **CLS** (Cumulative Layout Shift) | ≤0.10 | ≤0.25 | >0.25 | How much the layout jumps during load |
| **TTI** (Time to Interactive) | ≤3800ms | ≤7300ms | >7300ms | When the page becomes reliably interactive |
| **TTFB** (Time to First Byte) | ≤800ms | ≤1800ms | >1800ms | Server response time |

Both CLS rows use the CLS thresholds, and TTI (strict) reuses the TTI thresholds.

**Un-rated rows** — reported as `-`, useful for diagnosis but with no threshold in the tool: **INP**, DOM Content Loaded, Page Load Complete. INP in particular is a Core Web Vital with published Google thresholds (200ms / 500ms), but this tool does not apply them; if you cite those numbers, say they're Google's, not the tool's rating.

**CLS (running) vs CLS (at load)**: the running value accumulates for the whole session lifetime, so it inflates the longer the page stays open. The at-load value is frozen 3s past the load event and is the more faithful "what a visitor experienced on arrival" number. When they disagree, that gap is itself the finding — something is shifting layout after load.

## Diagnosing Common Findings

When you report a "Poor" or "Needs Improvement" metric, suggest plausible causes — but don't claim certainty without evidence:

- **LCP > 4s** — likely a heavy hero image, render-blocking CSS/JS in `<head>`, or slow server. Check: is the LCP element an `<img>`? Is it lazy-loaded (it shouldn't be)?
- **FCP > 3s** — render-blocking resources, slow CDN. Check: how many blocking `<script>` tags in `<head>`?
- **CLS > 0.25** — images/iframes without explicit `width`/`height`, late-loading fonts (FOUT), banners/ads injecting after first paint.
- **TTI > 7s** — heavy JS execution. Check: bundle size, main-thread blocking long tasks.
- **TTFB > 1.8s** — server-side bottleneck. Not a frontend fix.

For LCP element identification — which `webmobai_get_performance_metrics` collects but does not print — run `webmobai_evaluate` with:
```js
new Promise(resolve => {
  new PerformanceObserver(list => {
    const entries = list.getEntries();
    const last = entries[entries.length - 1];
    resolve({
      element: last?.element?.outerHTML?.slice(0, 300),
      size: last?.size,
      url: last?.url,
    });
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  setTimeout(() => resolve(null), 1000);
})
```

## Tools Used

- `mcp__webmobai__webmobai_launch_browser`
- `mcp__webmobai__webmobai_navigate`
- `mcp__webmobai__webmobai_wait_for`
- `mcp__webmobai__webmobai_get_performance_metrics` (optional `strict_tti`)
- `mcp__webmobai__webmobai_run_perf_multi` (median/p95 over 1-10 runs, default 3)
- `mcp__webmobai__webmobai_set_network_throttle` (Chromium only except `offline`; `preset` required, `null` clears)
- `mcp__webmobai__webmobai_set_cpu_throttle` (Chromium only; `slowdown` required, `null` or `1` clears)
- `mcp__webmobai__webmobai_set_viewport` (mobile cross-check)
- `mcp__webmobai__webmobai_evaluate` (LCP element identification, custom timing)
- `mcp__webmobai__webmobai_get_run_history` *(optional; no browser — historical trend)*
- `mcp__webmobai__webmobai_check_regressions` *(optional; no browser — latest vs. median)*
- `mcp__webmobai__webmobai_add_test_result`
- `mcp__webmobai__webmobai_generate_report`
- `mcp__webmobai__webmobai_close_browser`

Not here: `webmobai_lighthouse_audit` — if the user wants the 0-100 score, that's `auditing-web-lighthouse`.

## Output

End-of-turn summary should look like:

```
Performance audit — https://example.com/pricing (desktop, median of 5 runs)
  LCP            3.2s   Needs Improvement   (p95 4.1s)
  FCP            1.4s   Good                (p95 1.6s)
  CLS (running)  0.18   Needs Improvement
  CLS (at load)  0.16   Needs Improvement
  TTI (fast)     4.1s   Needs Improvement   (p95 5.0s)
  INP             180ms  (un-rated by the tool)
  TTFB           240ms  Good
  Load           3.8s
  Likely culprits:
   - LCP element: <img src="/hero.jpg"> (1.4MB, no preload)  [via evaluate]
   - CLS: hero image renders without width/height, pushing content down
  Report: /var/folders/xx/…/webmobai-1747000000000-a1b2c3/report-1747000000789.html
```

Relay the report path exactly as `webmobai_generate_report` returned it. It is written into the browser session directory (`<os.tmpdir()>/webmobai-<unix-ms>-<random>/report-<unix-ms>.html`), not the working directory.

## Tips & Gotchas

- **Single-run variance is real**. A single LCP measurement can be ±15-20%. Don't make policy decisions on one number — use `webmobai_run_perf_multi` and report the median.
- **Throttling is sticky and engine-dependent.** A throttle set with `set_network_throttle` / `set_cpu_throttle` stays on for the rest of the session until cleared with `null`. On Firefox and WebKit the bandwidth presets are ignored outright — you'll get unthrottled numbers with no warning, so don't claim "measured on slow-4g" unless the session is Chromium.
- **Disable video recording for perf runs**. Recording adds CPU overhead and can inflate TTI/LCP slightly.
- **Background tabs / other apps affect results**. Tell the user the run reflects the host machine's load, not a clean CI environment.
- **CLS measurement window**: the running CLS accumulates over the page's lifetime, so long sessions inflate it even when the initial load was stable. Prefer the **CLS (at load)** row, or measure shortly after load.
- **TTFB on cached pages**: subsequent loads in the same session have warm DNS/TCP. The number you see may be optimistic vs. a real first-time visitor.
- **Lighthouse parity**: this skill does not compute the weighted 0-100 score, but WebMobAI does ship it — `webmobai_lighthouse_audit` via `auditing-web-lighthouse`. Hand off rather than apologizing. Expect the two to disagree: Lighthouse runs its own throttled headless Chrome, this skill measures the live session as configured.
- **Comparing to baselines**: if the user has prior numbers, ask whether they came from this tool, Lighthouse, or Chrome DevTools — they're not directly comparable.
- **History is not written by MCP sessions.** `webmobai_get_run_history` / `webmobai_check_regressions` read `~/.webmobai/history.json`, which only completed `webmobai-test` and `webmobai-monitor` runs append to. Measuring a page here does not add an entry, so a "no regressions" answer immediately after an MCP audit is comparing nothing. For a real trend, set up recorded runs via `monitoring-web-regressions`.

## Example Invocations

User: *"Get Core Web Vitals for https://example.com."*
→ Single-page, desktop, single run. Report all five vitals + load timings + report path.

User: *"Did the deploy regress perf? Compare current vs baseline LCP 2.1s, CLS 0.08."*
→ Measure with `webmobai_run_perf_multi` (medians beat a single sample for a regression call), then explicitly diff against the supplied baseline. Flag any metric that regressed and note whether the gap exceeds single-run variance.

User: *"Has this page been getting slower over the last month?"*
→ Don't measure first — `webmobai_get_run_history` for that URL, then `webmobai_check_regressions`. If history is empty or has fewer than 2 entries, say so plainly and hand off to `monitoring-web-regressions` to start recording; an MCP measurement won't populate it.

User: *"Check perf on mobile for the top 5 pages."*
→ Loop: navigate, set viewport 375×812, wait, measure. Report a table of per-page Web Vitals at mobile width.

User: *"The site feels slow — find out why."*
→ Start with a single-page measurement. If anything is "Poor", run the LCP-element-identification snippet and inspect the offender. Recommend pairing with Chrome DevTools Performance panel for flame charts.
