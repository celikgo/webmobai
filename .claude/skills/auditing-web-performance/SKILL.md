---
name: auditing-web-performance
description: Use when the user wants to measure web performance — Core Web Vitals (LCP, FCP, CLS, TTI, TTFB), load timing, regressions vs. a baseline, or perf at different viewports. Triggers on "performance audit", "Web Vitals", "Core Web Vitals", "LCP", "CLS", "page speed", "lighthouse perf", "is the site slow", "speed test", "page load time", "TTFB", "perf regression".
---

# Auditing Web Performance

## Overview

This skill measures and reports on web performance using WebMobAI's Web Vitals collection. It captures LCP, FCP, CLS, TTI, TTFB, DOM Content Loaded, and full load time for one or more pages, rates each metric against Google's Web Vitals thresholds, and produces an HTML report with findings.

**Scope of the underlying tools** (v1.2 added several upgrades — make sure you use them):
- `webmobai_get_performance_metrics` — single-run reads LCP / FCP / CLS / TTI / **INP** (replaced FID in March 2024) / TTFB / load timings, plus the **LCP element fingerprint** (tag, src, text, size).
- `webmobai_run_perf_multi` — multi-run aggregation (1-10 runs) with median + p95 + min + max per metric. Use this when stability matters.
- `webmobai_set_network_throttle` — slow-3g / fast-3g / slow-4g / offline presets matching Chrome DevTools.
- `webmobai_set_cpu_throttle` — slowdown multiplier (4 = Lighthouse mobile profile).

What we still do **not** do:
- Capture field/RUM data
- Provide a Lighthouse-style "performance score" out of 100

Surface these limitations to the user when relevant — especially if they're chasing a specific Lighthouse number.

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
3. **Runs per page** — default 1 (the underlying tool does single runs). If the user wants reliable numbers, do 3+ runs and report median.
4. **Baseline** — if comparing against a prior measurement, get the prior numbers up front.
5. **Auth** — same caveat as other skills.

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
`webmobai_get_performance_metrics`. The tool returns LCP, FCP, CLS, TTI, TTFB, DOM Content Loaded, Page Load Complete, with ratings on the first five.

#### 2d. (Optional) Multi-run averaging
If the user wants stable numbers, do 3 runs per page. Pattern:
1. `webmobai_navigate` → page
2. `webmobai_get_performance_metrics`
3. Navigate away to `about:blank` (`webmobai_navigate` with `about:blank` — note: this is *not* a Web Vitals best practice for the *Chromium* sense; just navigate to a different real URL or close+relaunch for a true cold reload)
4. Repeat

Report median, not mean — perf is heavily right-skewed.

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

Mobile LCP is typically 1.5–2.5× desktop on the same site. For realistic mobile simulation, call `webmobai_set_network_throttle({preset: "slow-4g"})` and `webmobai_set_cpu_throttle({slowdown: 4})` before measurement. For touch + DPR emulation use `webmobai_launch_browser({device: "Pixel 5"})`.

### 4. Report
`webmobai_generate_report` with the primary URL. The HTML report includes the perf metrics section. Surface the report path and the top regressions.

### 5. Close
`webmobai_close_browser`.

## Web Vitals Thresholds

These are the ratings the underlying tool uses. Use the same language in your report.

| Metric | Good | Needs Improvement | Poor | What it means |
|--------|------|-------------------|------|---------------|
| **LCP** (Largest Contentful Paint) | ≤2500ms | ≤4000ms | >4000ms | When the biggest above-the-fold content shows up |
| **FCP** (First Contentful Paint) | ≤1800ms | ≤3000ms | >3000ms | When *any* content first paints |
| **CLS** (Cumulative Layout Shift) | ≤0.10 | ≤0.25 | >0.25 | How much the layout jumps during load |
| **TTI** (Time to Interactive) | ≤3800ms | ≤7300ms | >7300ms | When the page becomes reliably interactive |
| **TTFB** (Time to First Byte) | ≤800ms | ≤1800ms | >1800ms | Server response time |

Other timings (Page Load Complete, DOM Content Loaded) are reported but un-rated — they're useful for diagnosis, not user experience thresholds.

## Diagnosing Common Findings

When you report a "Poor" or "Needs Improvement" metric, suggest plausible causes — but don't claim certainty without evidence:

- **LCP > 4s** — likely a heavy hero image, render-blocking CSS/JS in `<head>`, or slow server. Check: is the LCP element an `<img>`? Is it lazy-loaded (it shouldn't be)?
- **FCP > 3s** — render-blocking resources, slow CDN. Check: how many blocking `<script>` tags in `<head>`?
- **CLS > 0.25** — images/iframes without explicit `width`/`height`, late-loading fonts (FOUT), banners/ads injecting after first paint.
- **TTI > 7s** — heavy JS execution. Check: bundle size, main-thread blocking long tasks.
- **TTFB > 1.8s** — server-side bottleneck. Not a frontend fix.

For LCP element identification, you can run `webmobai_evaluate` with:
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
- `mcp__webmobai__webmobai_get_performance_metrics`
- `mcp__webmobai__webmobai_set_viewport` (mobile cross-check)
- `mcp__webmobai__webmobai_evaluate` (LCP element identification, custom timing)
- `mcp__webmobai__webmobai_add_test_result`
- `mcp__webmobai__webmobai_generate_report`
- `mcp__webmobai__webmobai_close_browser`

## Output

End-of-turn summary should look like:

```
Performance audit — https://example.com/pricing (desktop, single run)
  LCP   3.2s   Needs Improvement
  FCP   1.4s   Good
  CLS   0.18   Needs Improvement
  TTI   4.1s   Needs Improvement
  TTFB  240ms  Good
  Load  3.8s
  Likely culprits:
   - LCP element: <img src="/hero.jpg"> (1.4MB, no preload)
   - CLS: hero image renders without width/height, pushing content down
  Report: /tmp/webmobai-report-1715534000.html
```

## Tips & Gotchas

- **Single-run variance is real**. A single LCP measurement can be ±20%. Don't make policy decisions on one number — push for 3+ runs.
- **Disable video recording for perf runs**. Recording adds CPU overhead and can inflate TTI/LCP slightly.
- **Background tabs / other apps affect results**. Tell the user the run reflects the host machine's load, not a clean CI environment.
- **CLS measurement window**: CLS accumulates over the page's lifetime in the tool's measurement. Long sessions inflate CLS even when the initial load was stable. Measure shortly after load.
- **TTFB on cached pages**: subsequent loads in the same session have warm DNS/TCP. The number you see may be optimistic vs. a real first-time visitor.
- **Lighthouse parity**: for the official perf score (0-100), Lighthouse CLI is still authoritative. We complement it with `set_network_throttle` + `set_cpu_throttle` + `run_perf_multi` for the underlying metrics, but we don't compute the weighted score.
- **Comparing to baselines**: if the user has prior numbers, ask whether they came from this tool, Lighthouse, or Chrome DevTools — they're not directly comparable.

## Example Invocations

User: *"Get Core Web Vitals for https://example.com."*
→ Single-page, desktop, single run. Report all five vitals + load timings + report path.

User: *"Did the deploy regress perf? Compare current vs baseline LCP 2.1s, CLS 0.08."*
→ Same flow, then explicitly diff the current numbers against the baseline. Flag any metric that regressed.

User: *"Check perf on mobile for the top 5 pages."*
→ Loop: navigate, set viewport 375×812, wait, measure. Report a table of per-page Web Vitals at mobile width.

User: *"The site feels slow — find out why."*
→ Start with a single-page measurement. If anything is "Poor", run the LCP-element-identification snippet and inspect the offender. Recommend pairing with Chrome DevTools Performance panel for flame charts.
