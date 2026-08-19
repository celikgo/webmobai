# Running WebMobAI in CI

WebMobAI is usable as a real CI gate: a suite of deterministic scenarios that
exits non-zero when something regresses, emits JUnit XML your CI can render,
and produces an HTML report plus a Playwright trace you can download.

This document covers which binary to gate on, the exit-code contract, browser
installation, parallelism and sharding, tag filtering, reporters, artifacts,
authenticated suites, and copy-pasteable pipeline YAML.

Grounded in [`mcp-server/src/suite-cli.ts`](../mcp-server/src/suite-cli.ts),
[`scenario-cli.ts`](../mcp-server/src/scenario-cli.ts),
[`doctor-cli.ts`](../mcp-server/src/doctor-cli.ts), the suite
[`filter`](../mcp-server/src/suite/filter.ts) /
[`runner`](../mcp-server/src/suite/runner.ts), and this repo's own
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

Scenario and suite file formats live in
[`SCENARIO_FORMAT.md`](SCENARIO_FORMAT.md). Testing behind a login is
[`AUTHENTICATION.md`](AUTHENTICATION.md).

---

## 1. Which binary for which gate

| Gate you want | Binary | Why |
|---|---|---|
| Pre-deploy / PR E2E gate | **`webmobai-suite`** | Parallel, shardable, tag-filterable, correct exit codes, aggregate JUnit. This is the CI binary. |
| One flow, one job | `webmobai-scenario` | Same exit contract, no parallelism. Fine for a single smoke scenario. |
| Environment preflight | `webmobai-doctor` | Fails fast on a missing browser or a stale auth file with a readable message. |
| Scheduled/continuous monitoring | `webmobai-monitor` | Long-running loop; not a build gate. Use a cron job, not a PR check. |
| **Not a gate** | `webmobai-test` | **Exits 0 even when checks fail.** See §2. |
| Not for CI | `webmobai-codegen` | Launches a headed Chromium and records a human. No headless mode. |

### `webmobai-test` is not a gate

`webmobai-test`'s `run()` has no `process.exit` on the success path — failing
results only change the status inside the emitted JSON, and only an outer
exception exits 1. It also launches **headed**, so it needs a display server.
If you want its breadth in CI, parse the emitted JSON `report` event or the
JUnit XML it writes; never branch on its exit code.

---

## 2. Exit-code contract

| Binary | 0 | 1 | 2 |
|---|---|---|---|
| `webmobai-suite` | All scenarios passed; `--help`; zero scenarios to run after sharding, an empty suite, or `--allow-empty` | ≥1 scenario with a failed step; **or** any thrown error (loader failure, malformed `--shard`) | Usage error — see below |
| `webmobai-scenario` | `summary.failed === 0` | ≥1 failed step; **or** any thrown error incl. browser-launch failure | Missing path arg, file not found, unparseable JSON, missing `url` or non-array `steps` |
| `webmobai-doctor` | Zero `error`-status checks (warnings do **not** fail); `--help` | ≥1 `error`-status check | — (unknown args are silently ignored) |
| `webmobai-test` | **Implicit — including with failing checks** | Fatal error only | Missing url arg |
| `webmobai-monitor` | Loop ended (`--once`, SIGINT, SIGTERM) | Fatal error in the loop | Arg-parse failure — bad interval, unknown flag, missing url |
| `webmobai-codegen` | Normal completion after the window closes | Fatal error | No url, or an unexpected second positional |
| `webmobai-mcp` | Graceful SIGINT/SIGTERM shutdown | Fatal error in `main()` | — |

### `webmobai-suite` exit 2 in detail

Exit 2 is a **usage** error, reached for: zero args; a `--workers` value that is
not a finite integer ≥1; a missing value for any value-taking flag; a
`--reporter` outside `html|junit|both|none`; an unknown `--` option; a second
positional; no suite path; and the tag-filter guard below.

**Note the two cases that are *not* exit 2**, despite what you might expect:

- **Loader errors exit 1**, not 2 — a non-JSON suite file, a non-object root, a missing string `name`, a missing `scenarios` array, or an unreadable referenced scenario file all throw and surface as `Suite CLI fatal error:` on stderr.
- **Malformed `--shard` exits 1**, not 2 — `--shard abc` and `--shard 5/4` throw from the parser rather than going through the usage-error path.

### The zero-match tag guard

```
Tag filter matched 0 of <N> scenarios (include=[…] exclude=[…]). This usually
means a mistyped tag. Pass --allow-empty to treat an empty selection as success.
```

Exit 2 fires when **all four** hold: at least one `--tag`/`--exclude-tag` was
supplied, the post-filter count is 0, the suite itself was non-empty, and
`--allow-empty` was not passed. This exists so a typo'd tag fails the build
instead of producing a green run that tested nothing.

`--allow-empty` bypasses the guard; the run then falls through to
`No scenarios to run.` and exits **0**. An **empty suite file**
(`"scenarios": []`) never trips the guard. A **shard that receives zero
scenarios** never trips it either — the guard runs before sharding, deliberately.

### What makes a scenario fail

The runner stops at the first failed step and marks the rest `skipped`, unless
the scenario sets `continueOnFailure: true`. Skipped steps alone can never cause
a non-zero exit, since they only appear after a failure. Inside a suite, a
scenario that throws during launch is not fatal to the run: it is recorded as
one failed `navigate` step with `Scenario failed to launch: <msg>`, which still
makes the suite exit 1.

---

## 3. Headless and browser installation

`webmobai-scenario` and `webmobai-suite` are **hardcoded headless** and pass
`recordVideo: false`. Nothing to configure — there is no `WEBMOBAI_HEADLESS`
env var and no `--headed` flag. (`webmobai-test` and `webmobai-codegen` are
hardcoded **headed** and need a display server; see §1.)

`BrowserManager.launch()` self-installs the requested Playwright engine on
first use, so a clean CI runner will work without an install step — but that
download is untimed, uncached, and can add 1–3 minutes to the first job. Install
explicitly:

```bash
npx playwright install --with-deps chromium
```

Install only the engines your scenarios actually name. This repo's own CI
installs all three (`chromium firefox webkit`) because its test suite exercises
multi-browser paths; a downstream E2E job usually needs only chromium.

---

## 4. Parallelism — `--workers`

```bash
webmobai-suite ./suites/e2e.json --workers 4
```

- Default: `min(4, max(1, cpus().length))`. GitHub's standard `ubuntu-latest` runner has 4 vCPU, so the default is 4.
- The runner clamps to `max(1, workers)`. No upper bound is enforced; the help text suggests ~8 as a practical ceiling.
- Implementation is a promise pool, not worker threads — at most `workers` scenarios in flight at a time.
- **Isolation is complete**: each scenario gets its own session dir and its own `BrowserManager` (fresh browser + fresh context). Screenshots, recordings, and traces never collide.
- Each worker is a full headless browser. Raise `--workers` only alongside a larger runner.
- **Results are collected in completion order, not queue order**, so the aggregate report's scenario ordering is nondeterministic when `--workers > 1`.

---

## 5. Sharding — `--shard k/n`

```bash
webmobai-suite ./suites/e2e.json --shard 2/4
```

- `k` is **1-based**. Format is strictly `k/n` (whitespace around the slash is tolerated).
- Distribution is **modular striping, not contiguous chunking**: `--shard 1/3` takes indices 0, 3, 6…; `--shard 3/3` takes 2, 5, 8…. Striping keeps load balanced when scenario durations vary.
- Out-of-range (`--shard 5/4`, `--shard 0/4`) or malformed (`--shard abc`) throws → **exit 1**, not 2.
- **Filtering happens before sharding.** Every shard must therefore receive *identical* `--tag` / `--exclude-tag` flags, or the shards disagree about the index space and will silently overlap or skip scenarios.
- A shard with zero scenarios prints `No scenarios to run.` and exits 0.
- **There is no cross-shard aggregation.** Each shard writes its own `report-*.html` / `junit-*.xml` / `suite-*.json` into its own `--out`. Merging is the CI's job — most JUnit-consuming actions accept a glob across all downloaded shard directories.

### Worked multi-machine example

Four machines, one suite, one tag selection, artifacts kept separate:

```bash
# machine 1
webmobai-suite ./suites/e2e.json --tag smoke --exclude-tag flaky \
  --shard 1/4 --workers 4 --reporter both --out ./out-1

# machine 2
webmobai-suite ./suites/e2e.json --tag smoke --exclude-tag flaky \
  --shard 2/4 --workers 4 --reporter both --out ./out-2

# machine 3
webmobai-suite ./suites/e2e.json --tag smoke --exclude-tag flaky \
  --shard 3/4 --workers 4 --reporter both --out ./out-3

# machine 4
webmobai-suite ./suites/e2e.json --tag smoke --exclude-tag flaky \
  --shard 4/4 --workers 4 --reporter both --out ./out-4
```

Total concurrency is `4 machines × 4 workers = 16` headless browsers. Each
machine exits independently; the pipeline fails if any shard exits non-zero.

---

## 6. Tag filtering

Tags come from the **suite entry**, not the scenario file:

```jsonc
{ "path": "./scenarios/checkout.json", "tags": ["e2e", "auth"] }
```

| Rule | Behavior |
|---|---|
| `--tag` repeated | **OR** — a scenario passes if it carries *any* listed tag |
| `--exclude-tag` repeated | **OR** — a scenario is dropped if it carries *any* listed tag |
| Both given | **Exclude wins.** `tags: ["smoke","slow"]` with `--tag smoke --exclude-tag slow` is dropped |
| No `--tag` | Everything passes the include check |
| Matching | **Exact string equality.** No globbing, no negation syntax, no AND, no case-insensitivity |

A tag filter that reduces a non-empty suite to zero is exit 2 unless you pass
`--allow-empty` (§2).

---

## 7. Reporters and where each artifact lands

`--reporter` accepts exactly `html`, `junit`, `both` (default), `none`. Anything
else is exit 2. The flag exists **only** on `webmobai-suite` —
`webmobai-scenario` and `webmobai-test` always emit their full artifact set.

| `--reporter` | `report-<ts>.html` | `junit-<ts>.xml` | `suite-<ts>.json` |
|---|---|---|---|
| `html` | ✅ | — | ✅ |
| `junit` | — | ✅ | ✅ |
| `both` *(default)* | ✅ | ✅ | ✅ |
| `none` | — | — | ✅ |

`suite-<ts>.json` is written unconditionally — it is the full `SuiteRunResult`,
including every scenario's `sessionDir`, tags, and per-step results. The three
filenames each call `Date.now()` separately, so their timestamps can differ by
a few milliseconds.

`--out DIR` defaults to `process.cwd()`, is `resolve()`d, and is created with
`mkdir -p` before writing.

### Full artifact map

| Producer | Path |
|---|---|
| `webmobai-suite` (aggregate) | `<--out>/report-<ts>.html`, `<--out>/junit-<ts>.xml`, `<--out>/suite-<ts>.json` |
| `webmobai-suite` (per scenario) | One `<os.tmpdir()>/webmobai-<ts>-<rand>/` **per scenario**, referenced only by `sessionDir` inside `suite-<ts>.json` |
| `webmobai-scenario` | `<sessionDir>/report-<ts>.html`, `junit-<ts>.xml`, `screenshots/`, `trace.zip` — no PDF, no recordings |
| `webmobai-test` | `<sessionDir>/report-<ts>.html`, `report-<ts>.pdf`, `junit-<ts>.xml`, `screenshots/`, `recordings/`, `trace.zip` |
| `webmobai-test` (and `webmobai-monitor`, which spawns it) | `~/.webmobai/history.json` — appended summary, capped at 200 entries. `webmobai-suite` and `webmobai-scenario` never write it |
| `webmobai-doctor`, `webmobai-monitor` | Nothing of their own |

**The CI caveat that surprises people:** suite aggregate reports land in
`--out`, but **per-scenario screenshots and `trace.zip` land in `$TMPDIR` and
are not copied**. To archive traces you must read `sessionDir` out of
`suite-<ts>.json` and copy them yourself:

```bash
python3 - <<'PY'
import json, glob, shutil, os
res = json.load(open(sorted(glob.glob('./webmobai-out/suite-*.json'))[-1]))
for s in res['scenarios']:
    src = s.get('sessionDir')
    if src and os.path.isdir(src):
        shutil.copytree(src, os.path.join('./webmobai-out/sessions', os.path.basename(src)))
PY
```

Remember that a trace of an authenticated run contains the session — see
[`AUTHENTICATION.md` §7](AUTHENTICATION.md#7-secret-hygiene) before publishing
it.

---

## 8. JUnit XML wiring

`--reporter junit` (or `both`) writes `junit-<ts>.xml` into `--out`. Shape:

- One `<testsuites name="WebMobAI">` containing exactly **one** `<testsuite>`, whose `name` is the host + pathname of the report URL.
- Attributes on both levels: `tests`, `failures`, `errors="0"` (hardcoded), `skipped`, `time` in seconds to 3 dp; the `<testsuite>` also carries an ISO-8601 `timestamp`.
- `classname` is the result's category. In a suite run that is the scenario's **first tag**, falling back to `Scenario` for an untagged entry (`WebMobAI` is the generator's own fallback, which a suite run never reaches). Tag your scenarios if you want readable grouping in the CI test view.

Status mapping:

| WebMobAI status | JUnit element | Build effect |
|---|---|---|
| `pass` | self-closing `<testcase/>` | green |
| `fail` | `<failure message="…">` | **red** |
| `warning` | `<skipped message="…"/>` | **not a failure — deliberately** |

That last row matters: a `warning` result (for example a responsive breakpoint
with horizontal overflow) will show as skipped and will **not** turn the build
red. Gate on the exit code as well as the XML.

v1.4.0 hardening: the escaper strips ANSI colour escapes and XML-1.0-illegal
control characters before entity-escaping. Before that, one bad byte in a page
title made the whole file unparseable and importers dropped every result.

---

## 9. Authenticated suites

```bash
webmobai-suite ./suites/e2e.json --storage-state "$RUNNER_TEMP/auth.json"
```

Three things to internalize before relying on this:

1. **There is no env-var input.** Store the storageState JSON as an encrypted CI secret and write it to a temp file at job start.
2. **The flag loses to per-scenario and suite-default values** — the suite applies `scenario.storageState ??= args.storageState`. If a committed scenario or `defaults.storageState` already sets the field, the flag is ignored. (`webmobai-scenario` is the opposite: there the flag wins.)
3. **Use an absolute path.** Resolution is cwd-sensitive and inconsistent across the CLIs, the suite loader, and `webmobai-doctor`.

Full detail, including capture and expiry, in
[`AUTHENTICATION.md`](AUTHENTICATION.md).

---

## 10. `webmobai-doctor` as a preflight step

```bash
webmobai-doctor --storage-state "$RUNNER_TEMP/auth.json"
```

Checks, in order: Node ≥18 (**error** if older), chromium installed
(**error** — it is the default engine), firefox and webkit (**warn**, optional),
Lighthouse resolvable (**warn**), `WEBMOBAI_ANTHROPIC_API_KEY` set (**warn**),
and — only with the flag — the storageState file.

Exit 1 on any hard error, 0 otherwise. **Warnings do not fail the job**, so it
is safe to run unconditionally: it converts "Executable doesn't exist" mid-run
into a one-line failure at second 5, and catches a stale auth file before the
suite burns twenty minutes redirecting to `/login`.

Its storageState heuristic is weak (one live dated cookie is enough for `ok`,
localStorage is never inspected) — treat a green doctor as necessary, not
sufficient.

---

## 11. GitHub Actions — complete example

```yaml
name: E2E

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  suite:
    name: WebMobAI suite (shard ${{ matrix.shard }}/4)
    runs-on: ubuntu-latest
    timeout-minutes: 30
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version: 22

      - name: Install WebMobAI
        run: npm i -g webmobai-mcp@1.4.0

      # BrowserManager self-installs on first use, but that download is
      # untimed and uncached. Install only the engines the suite names.
      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      # storageState has no env-var input — materialize it to a temp file.
      # Skip this step and the --storage-state flag if the suite is public.
      - name: Materialize the saved session
        run: printf '%s' "$WEBMOBAI_AUTH_JSON" > "$RUNNER_TEMP/auth.json"
        env:
          WEBMOBAI_AUTH_JSON: ${{ secrets.WEBMOBAI_AUTH_JSON }}

      # Fails the job in seconds on a missing browser or a stale auth file.
      # Optional warnings still exit 0.
      - name: Preflight
        run: webmobai-doctor --storage-state "$RUNNER_TEMP/auth.json"

      # Every shard MUST get identical --tag / --exclude-tag flags: filtering
      # runs before sharding, so mismatched filters shift the index space.
      # exit 0 = all pass, 1 = a scenario failed, 2 = usage error (including a
      # --tag that matched zero of a non-empty suite).
      - name: Run suite
        run: |
          webmobai-suite ./suites/e2e.json \
            --tag smoke \
            --exclude-tag flaky \
            --shard ${{ matrix.shard }}/4 \
            --workers 4 \
            --reporter both \
            --out ./webmobai-out \
            --storage-state "$RUNNER_TEMP/auth.json"

      # report-*.html, junit-*.xml, suite-*.json only. Per-scenario traces and
      # screenshots live in $TMPDIR under the sessionDir recorded inside
      # suite-*.json — copy them explicitly if you want them (see §7), and
      # remember an authenticated trace contains the session.
      - name: Upload reports
        if: always()
        uses: actions/upload-artifact@v7
        with:
          name: webmobai-shard-${{ matrix.shard }}
          path: ./webmobai-out/

  report:
    name: Publish JUnit
    needs: suite
    if: always()
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v7
        with:
          pattern: webmobai-shard-*
          path: ./all-shards
      # There is no cross-shard aggregation in WebMobAI — point your JUnit
      # consumer at a glob across every downloaded shard directory.
      - name: Summarize
        run: ls -R ./all-shards
```

Set `WEBMOBAI_ANTHROPIC_API_KEY` in the job env only if you want the AI
summaries; every AI path is a silent no-op without it and none of them affect
pass/fail.

### How this repo's own CI differs

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) tests **WebMobAI
itself**, not a website: `check-mcp-server` on `ubuntu-latest` runs `npm ci`,
`npm run build` (which is `tsc`, so it doubles as the type check),
`npx playwright install --with-deps chromium firefox webkit`, then `npm test`
(214 vitest cases). `check-frontend` type-checks and builds the React app.
`build-tauri` needs both and builds two macOS targets. No Linux or Windows job
runs the desktop build; no job runs the test suite on macOS or Windows.
[`release.yml`](../.github/workflows/release.yml) fires on a `v*` tag, publishes
`webmobai-mcp` to npm, and builds the signed desktop artifacts — **it does not
run the tests**, so the gate is CI on `main` before tagging.

---

## 12. GitLab CI equivalent

```yaml
stages: [e2e]

webmobai:
  stage: e2e
  image: node:22-bookworm
  timeout: 30m
  parallel:
    matrix:
      - SHARD: ["1", "2", "3", "4"]
  variables:
    # WEBMOBAI_AUTH_JSON is a masked, protected CI/CD variable holding the
    # storageState JSON. It is written to disk because no env-var input exists.
    AUTH_FILE: "$CI_PROJECT_DIR/.tmp/auth.json"
  before_script:
    - npm i -g webmobai-mcp@1.4.0
    - npx playwright install --with-deps chromium
    - mkdir -p "$CI_PROJECT_DIR/.tmp"
    - printf '%s' "$WEBMOBAI_AUTH_JSON" > "$AUTH_FILE"
    - webmobai-doctor --storage-state "$AUTH_FILE"
  script:
    - |
      webmobai-suite ./suites/e2e.json \
        --tag smoke --exclude-tag flaky \
        --shard ${SHARD}/4 \
        --workers 4 \
        --reporter both \
        --out ./webmobai-out \
        --storage-state "$AUTH_FILE"
  artifacts:
    when: always
    paths:
      - webmobai-out/
    reports:
      junit: webmobai-out/junit-*.xml
```

`.tmp/` must be gitignored, and `AUTH_FILE` must not sit under a path an
artifact glob picks up.

---

## 13. CI checklist

1. Gate on **`webmobai-suite`**, never on `webmobai-test`.
2. Install browsers explicitly; don't rely on the first-run self-install.
3. Run `webmobai-doctor` first — it is cheap and warnings don't fail.
4. Give **every shard identical tag flags**.
5. Treat exit 2 as "your invocation is wrong", exit 1 as "the site is wrong" — and remember loader and `--shard` errors land in exit 1.
6. Only add `--allow-empty` when an empty selection is genuinely expected.
7. Use `--reporter both`; consume `junit-*.xml`, keep `report-*.html` for humans, keep `suite-*.json` for tooling.
8. Remember `warning` results are `<skipped/>` and will not redden the build.
9. Copy per-scenario traces out of `$TMPDIR` yourself if you want them — and think before publishing an authenticated one.
10. Use **absolute paths** for `--storage-state`, and keep `storageState` out of committed scenario files so the flag actually applies.
