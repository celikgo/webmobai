---
name: running-web-ci-suites
description: Use when the user wants to run a set of WebMobAI scenarios as a real CI gate — building a suite file, parallelizing with --workers, splitting across machines with --shard, filtering with --tag, wiring JUnit XML into a CI test reporter, uploading artifacts, and getting the exit codes right. Triggers on "run this in CI", "CI pipeline", "GitHub Actions", "GitLab CI", "test suite", "run scenarios in parallel", "shard the tests", "JUnit report", "fail the build", "pre-deploy gate", "exit code", "upload test artifacts".
---

# Running Web Suites in CI

## Overview

This skill turns a pile of scenario JSON files into a **build gate**: a suite file, one `webmobai-suite` invocation, a JUnit XML the CI system renders, artifacts on failure, and an exit code the pipeline can trust.

Everything here is CLI, not MCP. **There is no MCP tool that runs a scenario or suite file** — `webmobai-scenario` and `webmobai-suite` are the only entry points. Use the MCP tools to *author and debug* scenarios interactively (see `authoring-web-scenarios`, `verifying-web-flows`, `debugging-web-selectors`), then hand the finished JSON to this skill for the CI wiring.

The one hard rule: **never gate CI on `webmobai-test`**. It exits 0 even with failing checks (there is no `process.exit` on its success path), it runs headed (`headless: false`), and it emits JSON-lines meant for the desktop app. `webmobai-suite` and `webmobai-scenario` are the CI binaries.

## When to Use

Trigger keywords: run in CI, CI pipeline, GitHub Actions, GitLab CI, suite, shard, workers, parallel, tag filter, JUnit, fail the build, pre-deploy gate, exit code, upload artifacts.

Use this when scenarios already exist (or the user is about to write them) and the question is *how they run unattended*. For writing the scenario JSON itself, use `authoring-web-scenarios`. For a one-off interactive pass/fail check, use `verifying-web-flows`.

## Inputs You Need

1. **The scenario files** — one JSON per flow. Their format is mirrored in `docs/SCENARIO_FORMAT.md`; the authority is `mcp-server/src/scenario/types.ts`.
2. **A grouping story** — which scenarios are `smoke` vs `e2e` vs `flaky`, since tags live on the *suite entry*, not inside the scenario file.
3. **The CI system** (GitHub Actions, GitLab CI, other) and whether it can render JUnit XML.
4. **Whether the flows are behind a login.** If yes you need a saved `storageState` JSON materialized on the runner — see `testing-web-authenticated-sessions`.
5. **Runner size** — `--workers` defaults to `min(4, cpus)` and every worker is a full headless browser.

## Suite File Essentials

A suite is a JSON file (never a directory — `webmobai-suite ./scenarios/` fails with `EISDIR`). Required keys are `name` (string) and `scenarios` (array):

```json
{
  "name": "Pre-deploy E2E",
  "description": "Everything that must pass before we ship.",
  "defaults": {
    "browser": "chromium",
    "viewport": { "width": 1280, "height": 720 },
    "continueOnFailure": false,
    "storageState": "./auth.json"
  },
  "scenarios": [
    { "path": "./scenarios/login.json",    "tags": ["smoke", "auth"] },
    { "path": "./scenarios/checkout.json", "name": "Checkout (renamed)", "tags": ["e2e", "auth"] },
    { "scenario": { "name": "Inline health check", "url": "https://example.com", "steps": [
        { "type": "assertVisible", "selector": "main" }
      ] }, "tags": ["smoke"] }
  ]
}
```

- **Path entries** resolve relative to the **suite file's directory**. **Inline entries** carry the whole scenario under `scenario`.
- **`tags` are on the entry**, not the scenario. A scenario referenced twice with different tags is two entries.
- **`defaults` are a fallback only** — an explicit value in the scenario file always wins (`viewport`, `browser`, `device`, `continueOnFailure`, `storageState`).
- `name` on a path entry renames the scenario in the report.

## Workflow

### 1. Preflight with `webmobai-doctor`
Put this before the suite step so a broken runner fails fast with a readable message instead of a mid-run Playwright stack trace:

```
webmobai-doctor --storage-state ./auth.json
```

It checks Node ≥ 18, chromium/firefox/webkit presence, the optional `lighthouse` package, `WEBMOBAI_ANTHROPIC_API_KEY`, and — only with the flag — that the auth file exists, parses, and isn't wholly expired. **Exit 1 only on hard errors** (old Node, missing chromium, missing/unparseable auth file); optional warnings still exit 0. See `troubleshooting-webmobai-setup` for reading its output in depth.

### 2. Install the browser engines explicitly
`BrowserManager.launch()` self-installs the requested engine on first use, but that download is untimed, uncached, and can take 1–3 minutes inside your job (it has a 10-minute hard timeout). Pre-install instead:

```
npx playwright install --with-deps chromium
```

Install `firefox` / `webkit` only if a scenario or `defaults.browser` names them. This repo's own `.github/workflows/ci.yml` installs all three because its test suite exercises all three.

### 3. Run the suite
```
webmobai-suite ./e2e/suite.json --workers 4 --reporter both --out ./webmobai-out
```

Every flag, verbatim from `webmobai-suite --help`:

| Flag | Value form | Default | Effect |
|---|---|---|---|
| *(positional)* | path | required | The suite JSON. A second positional is exit 2. |
| `--workers N` | space-separated int | `min(4, cpus)` | Concurrent scenarios. Non-integer or `< 1` is exit 2. |
| `--shard k/n` | space-separated `k/n` | none | Run shard k of n. **k is 1-based.** |
| `--tag T` | space-separated, repeatable | none | Include filter, OR across values. |
| `--exclude-tag T` | space-separated, repeatable | none | Exclude filter, OR across values. Exclude beats include. |
| `--reporter R` | `html` \| `junit` \| `both` \| `none` | `both` | Anything else is exit 2. |
| `--out DIR` | space-separated path | **cwd** | Aggregate reports land here; created with `mkdir -p`. |
| `--allow-empty` | boolean | false | Makes a zero-match tag filter a success instead of exit 2. |
| `--storage-state F` | space-separated path | none | Applied to every scenario that doesn't already set one. |
| `-h`, `--help` | boolean | — | Prints help, exit 0. |

There is **no `=` form** — `--workers=4` is an unknown option and exits 2. There is **no `--headed`**; suite and scenario runs are hardcoded `headless: true`, which is exactly what CI wants.

### 4. Parallelize and shard
- **`--workers N`** is an in-process promise pool. Each scenario gets its own `BrowserManager`, browser, context, and session dir, so screenshots and traces never collide. Results are collected in **completion order**, so report ordering is nondeterministic above 1 worker.
- **`--shard k/n`** splits across machines using **modular striping, not contiguous chunks**: shard `1/3` takes scenario indices 0, 3, 6…; shard `3/3` takes 2, 5, 8…. Striping keeps load balanced when durations vary.
- **Tag filtering runs before sharding.** Every shard must therefore receive *identical* `--tag` / `--exclude-tag` flags, or the shards disagree about the index space and will silently overlap or skip scenarios.
- A shard that legitimately receives zero scenarios prints `No scenarios to run.` and exits **0**.
- There is **no cross-shard aggregation**. Each shard writes its own report/JUnit/JSON into its own `--out`. Merging is the pipeline's job.

### 5. Understand the zero-match tag guard (v1.4.0)
If a tag filter reduces a **non-empty** suite to **zero** scenarios and `--allow-empty` was not passed, `webmobai-suite` exits **2** with:

```
Tag filter matched 0 of 12 scenarios (include=[smok] exclude=[]). This usually means a
mistyped tag. Pass --allow-empty to treat an empty selection as success.
```

This exists so a typo can't produce a green build on an untested commit. Only add `--allow-empty` when an empty selection is genuinely expected (e.g. a `--tag nightly` job on a suite that may have no nightly scenarios). An intentionally empty suite file (`"scenarios": []`) does **not** trip the guard and exits 0.

### 6. Wire up exit codes
| Binary | 0 | 1 | 2 |
|---|---|---|---|
| `webmobai-suite` | all scenarios passed; `--help`; zero scenarios after sharding / empty suite / `--allow-empty` | ≥1 scenario with a failed step; **also** any thrown error (bad `--shard k/n`, unloadable suite or scenario file) | usage errors: no args, bad `--workers`, missing flag value, bad `--reporter`, unknown `--option`, second positional, the tag guard |
| `webmobai-scenario` | `summary.failed === 0` | ≥1 failed step; or a thrown error (browser launch failure) | missing path, file not found, unparseable JSON, missing `url` or non-array `steps` |
| `webmobai-doctor` | zero `error`-status checks (warnings are fine); `--help` | ≥1 `error`-status check | — (unknown args are silently ignored) |
| `webmobai-test` | **always, even with failing checks** | only a fatal crash | missing url |

Note the asymmetry: a malformed `--shard abc` throws rather than calling the usage path, so it exits **1**, not 2. Loader errors (non-JSON suite, missing `name`, missing `scenarios`) exit 1 too.

A scenario that fails to launch inside a suite is not fatal to the run — the runner synthesises one failed `navigate` step with `Scenario failed to launch: <msg>` and the suite exits 1.

### 7. Emit and consume JUnit XML
`--reporter junit` or `both` writes **`junit-<ts>.xml`** into `--out`. (Not `report-<ts>.junit.xml`.) `webmobai-scenario` writes its JUnit unconditionally, but into its **tmp session dir**, not a path you choose — for CI, prefer the suite runner.

The shape: one `<testsuites name="WebMobAI">` with exactly one `<testsuite>` named `host + pathname` of the run URL. Status mapping:

- `pass` → self-closing `<testcase>`
- `fail` → `<failure message="...">`
- `warning` → `<skipped message="...">` — **deliberately not a failure**, so warnings never turn the build red

`classname` is the result's category; in suite runs that is the scenario's **first tag** (falling back to `Scenario`), so tag your entries with the grouping you want to see in the CI test tree.

Pick it up with whatever your CI renders JUnit with — e.g. `dorny/test-reporter` on `./webmobai-out/junit-*.xml`, or GitLab's `artifacts.reports.junit`.

### 8. Upload the right artifacts
Two different places, and this trips people up:

**In `--out`** (the only paths you control):
- `report-<ts>.html` — the human report (reporter `html`/`both`)
- `junit-<ts>.xml` — CI-consumable (reporter `junit`/`both`)
- `suite-<ts>.json` — **always written, even with `--reporter none`**. Full `SuiteRunResult`: every scenario's name, tags, `sourcePath`, `sessionDir`, and every step result.

**In `<os.tmpdir()>/webmobai-<ts>-<rand>/`, one dir per scenario** — *not* copied into `--out`:
- `trace.zip` — the Playwright trace; drop it on https://trace.playwright.dev to time-travel the failure. This is the single most valuable failure artifact.
- `screenshots/screenshot-<n>-<ts>.png` — includes the automatic screenshot every failing assertion takes via failure triage.
- `visual-baselines/` — only if a `visualSnapshot` step ran without an explicit `baselineDir`; a mismatch writes `<name>.actual.png` and `<name>.diff.png` next to the baseline.
- No videos (suite and scenario runs both pass `recordVideo: false`) and **no PDF** — `report-<ts>.pdf` is emitted only by `webmobai-test`.

To archive traces, read `sessionDir` out of `suite-<ts>.json` and copy them yourself:

```bash
mkdir -p ./webmobai-out/sessions
for dir in $(jq -r '.scenarios[].sessionDir' ./webmobai-out/suite-*.json); do
  cp -R "$dir" ./webmobai-out/sessions/ || true
done
```

For visual regression in CI, set `baselineDir` on each `visualSnapshot` step to a **repo-relative path** so baselines version with the code and the `.diff.png` lands somewhere predictable.

### 9. Run authenticated suites
Materialize the storageState JSON on the runner (from a CI secret) and pass `--storage-state ./auth.json`. There is **no environment variable** for it — the file must exist on disk before the CLI runs.

**Precedence is inverted between the two runners, and this is a real inconsistency:**
- `webmobai-scenario`: the **flag wins** over the scenario's `storageState` field.
- `webmobai-suite`: the flag uses `??=`, so **scenario field > `defaults.storageState` > `--storage-state`**. A scenario that hardcodes `"storageState": "dev-auth.json"` will silently ignore `--storage-state ci-auth.json`.

Also note relative paths resolve against the **invoking cwd**, not the suite file's directory — unlike scenario `path` entries. Capture, expiry, and the secret-hygiene rules live in `testing-web-authenticated-sessions`.

### 10. Hand over the pipeline file
Give the user a complete, pasteable workflow (below), and say plainly which lines they must change: the suite path, the tags, the shard count, and whether they need the auth file at all.

## Complete GitHub Actions Example

Action versions and Node major match this repo's own `.github/workflows/ci.yml`.

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

      # Only install the engines your scenarios actually name. The runner
      # self-installs on first launch, but that download is untimed and
      # uncached — do it here so it is visible and fast.
      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      # Auth file from a secret. Skip this and the --storage-state flag below
      # if the suite does not run behind a login.
      - name: Materialize storageState
        run: |
          printf '%s' '${{ secrets.WEBMOBAI_STORAGE_STATE }}' > ./auth.json
          chmod 600 ./auth.json

      # Fails the job early on a missing browser, an old Node, or a stale
      # auth file. Optional warnings (firefox/webkit/lighthouse/AI key) exit 0.
      - name: Preflight
        run: webmobai-doctor --storage-state ./auth.json

      - name: Run suite
        run: |
          webmobai-suite ./e2e/suite.json \
            --tag smoke \
            --exclude-tag flaky \
            --shard ${{ matrix.shard }}/4 \
            --workers 4 \
            --reporter both \
            --out ./webmobai-out \
            --storage-state ./auth.json
        # 0 = every scenario passed
        # 1 = a scenario failed, or the suite/scenario file could not be loaded
        # 2 = usage error, incl. a --tag that matched zero of a non-empty suite

      # Per-scenario traces and screenshots live in $TMPDIR, not --out.
      # suite-<ts>.json records each scenario's sessionDir; copy them in.
      - name: Collect traces and screenshots
        if: always()
        run: |
          mkdir -p ./webmobai-out/sessions
          for dir in $(jq -r '.scenarios[].sessionDir' ./webmobai-out/suite-*.json); do
            cp -R "$dir" ./webmobai-out/sessions/ || true
          done

      - name: Upload artifacts
        if: always()
        uses: actions/upload-artifact@v7
        with:
          name: webmobai-shard-${{ matrix.shard }}
          path: ./webmobai-out/

      - name: Publish JUnit results
        if: always()
        uses: dorny/test-reporter@v1
        with:
          name: E2E shard ${{ matrix.shard }}
          path: ./webmobai-out/junit-*.xml
          reporter: java-junit
```

Do not delete the `rm`/cleanup of `auth.json` if your runner is self-hosted and persistent — on a self-hosted runner add `rm -f ./auth.json` in an `if: always()` step.

## Tools Used

This skill is **binary-driven**. No MCP tool runs a scenario or suite file.

- **`webmobai-suite <suite.json>`** — the CI gate: parallelism, sharding, tag filters, reporters, aggregate artifacts.
- **`webmobai-scenario <scenario.json>`** — single-scenario gate; use for a one-file smoke job. Artifacts go to a tmp session dir, not a chosen `--out`.
- **`webmobai-doctor [--storage-state F]`** — preflight step.
- Authoring/debugging happens over MCP first — `mcp__webmobai__webmobai_generate_scenario`, `mcp__webmobai__webmobai_describe_selector`, the `webmobai_assert_*` family — then the JSON is committed and this skill wires it up.

## Output

```
CI GATE — ./e2e/suite.json, 4 shards × 4 workers, tags: +smoke -flaky

Suite step (shard 2/4):
  Loaded suite "Pre-deploy E2E" (12 scenarios)
  After tag filter: 9 scenarios (include=[smoke] exclude=[flaky])
  Shard 2/4: 2 scenarios on this machine
  Running 2 scenarios with 4 workers...

    ✓ Login
    ✗ Checkout

  HTML report: /home/runner/work/app/app/webmobai-out/report-1755500000000.html
  JUnit XML:   /home/runner/work/app/app/webmobai-out/junit-1755500000001.xml
  Raw JSON:    /home/runner/work/app/app/webmobai-out/suite-1755500000002.json

  Suite complete: 1/2 scenarios passed; 7/9 steps passed
  → exit 1, build red

Artifacts uploaded (webmobai-shard-2):
  report-*.html, junit-*.xml, suite-*.json
  sessions/webmobai-1755500000-a1b2c3/trace.zip        ← open at trace.playwright.dev
  sessions/webmobai-1755500000-a1b2c3/screenshots/screenshot-4-1755500000123.png
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Executable doesn't exist` / job hangs ~2 min on the first launch | No Playwright engine on the runner; `BrowserManager.launch()` is downloading it inline | Add `npx playwright install --with-deps chromium` (plus `firefox`/`webkit` only if named) before the suite step. `webmobai-doctor` catches this as an `error` and exits 1. |
| Non-zero exit with **no** failed scenarios in the log | Exit **2** = usage error (bad flag, `--workers=4` `=`-form, unknown option, second positional, tag guard). Exit **1** with a `Suite CLI fatal error:` line = a thrown error: malformed `--shard k/n`, unloadable suite JSON, a referenced scenario file that is missing or invalid | Read the stderr line — usage errors print the reason; fatal errors print the exception. Check the `--shard` value is `k/n` with `1 <= k <= n`. |
| `Tag filter matched 0 of N scenarios` → exit 2 | A mistyped tag, or tags on the scenario file instead of the suite entry | Fix the tag spelling; tags live on the **suite entry**. If empty really is valid for this job, add `--allow-empty` (it then exits 0 with `No scenarios to run.`). |
| Shards disagree — a scenario runs twice or never | Different `--tag` flags across shards; filtering happens **before** sharding | Give every shard byte-identical include/exclude flags. |
| Everything redirects to `/login`, assertions time out | Expired or wrong `storageState`; nothing validates expiry at launch — only that the file exists | Run `webmobai-doctor --storage-state ./auth.json`. Its heuristic warns only when there is ≥1 dated cookie **and all** of them are expired, so it can still say `ok` on a stale session — re-capture when in doubt. See `testing-web-authenticated-sessions`. |
| `--storage-state` appears to be ignored in a suite | Suite uses `??=`: scenario field > `defaults.storageState` > flag | Remove the hardcoded `storageState` from the scenario file (or from `defaults`) so the flag can fill it in. |
| Assertions flake in CI but pass locally | Auto-wait window too short for a slower runner. Assertions default to **5000 ms** (polling every 100 ms); `wait` steps default to **10000 ms** | Raise `timeoutMs` on the specific assert step, or insert a `wait` step on a stable selector before it. There is no global timeout flag — it is per step. |
| Suite passes but nothing was tested | An empty suite (`"scenarios": []`) or an empty shard both legitimately exit 0 | Check the `Loaded suite "..." (N scenarios)` line in the log; assert on N in the pipeline if this matters. |
| Build stays green despite obvious problems | `warning`-status results map to `<skipped/>` in JUnit by design, and `webmobai-test` always exits 0 | Gate on `webmobai-suite`'s exit code, never on `webmobai-test`'s. Treat the HTML report, not JUnit, as the place warnings are visible. |
| No `trace.zip` in the uploaded artifacts | Traces are per-scenario in `$TMPDIR`, never copied to `--out` | Copy them via `sessionDir` from `suite-<ts>.json` (step 8). |
| Report ordering changes between runs | Results are pushed in completion order under `--workers > 1` | Expected. Use `--workers 1` only if deterministic ordering genuinely matters. |

## Example Invocations

User: *"We have 12 scenario files. Set them up as a GitHub Actions gate that fails the PR."*
→ Write the suite JSON (path entries + tags), then hand over the workflow above. Explain the three exit codes, point at `--reporter both` for the JUnit the test-reporter step consumes, and note that traces need the `sessionDir` copy step.

User: *"The E2E job takes 20 minutes. Speed it up."*
→ Two axes: `--workers` within a machine (default `min(4, cpus)`, each worker is a full headless browser, so raise it only with a bigger runner) and `--shard k/n` across machines via a matrix. Warn that all shards need identical `--tag` flags and that there is no cross-shard aggregation.

User: *"CI is failing with exit code 2 and I can't see any test failures."*
→ Exit 2 is a usage error, not a test failure. Walk the list: `=`-form flags, unknown option, second positional, bad `--reporter`/`--workers`, and most commonly the v1.4.0 tag guard printing `Tag filter matched 0 of N scenarios`. Check the tag spelling before reaching for `--allow-empty`.

User: *"Our suite is all behind a login. How does that work in CI?"*
→ Capture the session once (that flow lives in `testing-web-authenticated-sessions`), store the JSON as a CI secret, write it to `./auth.json` at job start, preflight with `webmobai-doctor --storage-state ./auth.json`, then pass `--storage-state ./auth.json`. Flag the suite precedence gotcha: a scenario-level `storageState` silently beats the flag.
