# Designed for agents

Most testing tools are designed for a human to read the failure. WebMobAI is designed for a
**model** to read the failure and do something about it.

The difference is not the presence of AI in the product. It is what a tool response contains
when something goes wrong. This document explains one design decision in detail — what happens
when a selector stops matching — because it is the clearest example of the principle, and
because it is measured rather than asserted.

---

## The problem with `Error: element not found`

A conventional test runner, asked to click `#submit-order` on a page where that element no
longer exists, returns something like:

```
TimeoutError: locator.click: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('#submit-order')
```

Everything a human needs is there: the selector, the operation, the timeout. A human reads it,
opens the page, looks around, finds that a CSS-modules build renamed everything, and updates the
test.

For a model driving the browser through a tool call, that same message is close to useless.
It confirms the failure and supplies nothing to act on. The model's options are to retry the
identical call, to guess a new selector from memory of a page it can no longer see, or to give
up. All three are bad, and the first two are worse than giving up because they look like
progress.

The failure is not the model's. **The tool answered a question nobody asked.** It reported what
did not happen, when the caller needed to know what to do next.

---

## What WebMobAI returns instead

Every successful `click` and `type` records a fingerprint of the element it acted on — before
the action, as a side effect of success. From `element-snapshot.ts`:

```ts
export interface ElementSnapshot {
  tag: string;
  text: string;
  role: string | null;
  accessibleName: string | null;
  testid: string | null;
  ariaLabel: string | null;
  position: { x: number; y: number; width: number; height: number };
  attrs: Record<string, string>;
}
```

The fields are not arbitrary. Each is chosen so that **at least one survives the typical
change**: `text` survives class renames and layout reshuffles, `role` and `accessibleName`
survive most refactors, `testid` survives almost anything when it is present, and `position`
survives a text change on an icon-only control.

That fingerprint costs nothing while tests pass. It is the entire asset when one fails.

On a miss, the tool walks every interactive element on the *current* page, scores each against
the stored fingerprint, and returns the ranked shortlist along with a synthesized selector for
each — preferring stable forms in the order `data-testid` → `id` → `aria-label` → `role`+name →
text.

### A real transcript

Not an illustration — this is the actual output of `BrowserManager`, captured by running the
shipped build against a page that ships a CSS-modules refactor between two navigations.

**1. The flow works. The agent clicks by the selector it was given.**

```
> webmobai_click  { "selector": "#submit-order" }
Clicked element: #submit-order
```

The element fingerprint is recorded here, silently, because the call succeeded.

**2. The app ships a CSS-modules build. Same run, new markup.**

```
> webmobai_click  { "selector": "#submit-order" }

Selector "#submit-order" failed during click: page.click: Timeout 10000ms exceeded.

Prior snapshot of this selector (last time it worked):
  button[data-testid=submit] role=? text="Place order"

Suggested replacements (2, ranked by similarity):
  [score 142] [data-testid="submit"]  — button text="Place order"
  [score 7] [data-testid="cancel"]  — button text="Cancel"

Retry with one of the suggested selectors above.
```

**3. The agent retries with the top-ranked suggestion. No human involved.**

```
> webmobai_click  { "selector": "[data-testid=\"submit\"]" }
Clicked element: [data-testid="submit"]
```

Three things in that middle response make step 3 possible, and each is a deliberate choice:

- **The prior fingerprint.** The model is told what it is looking for — `button`, text
  `"Place order"` — not merely that a string failed to match. It can now reason about identity
  rather than syntax.
- **Ranked candidates with scores.** `142` against `7` is not a tie. The gap is the signal: the
  model can act on the leader confidently, and a narrow gap is itself information — it means
  "these are genuinely ambiguous, look closer."
- **A selector it can actually pass back.** The suggestion is pre-formed in the exact syntax the
  next tool call takes. There is no synthesis step where the model can invent something invalid.

### The page-state triage

Assertion failures add a second bundle, from `failure-triage.ts` — current URL and title,
viewport, the last five console errors, the last five network errors, and a screenshot path.

This exists to answer a question the selector diagnostic cannot. The comment in the source puts
it exactly right:

> Returning a coherent bundle is the difference between "selector not found" and "selector not
> found AND the page navigated to /login because the session expired".

Those are different failures with different fixes, and only one of them is about the selector.
Without the triage, a model cannot tell them apart and will "fix" the wrong thing — burning
retries hunting for a better locator when the real problem is that it got logged out. The
triage is what lets the model *stop* being wrong, which matters more than any single retry.

---

## Why this shape works for a model specifically

A model recovering autonomously needs three things from a failed tool call, and conventional
error messages supply none of them:

1. **Grounding in the present.** The model cannot see the page. Any recovery it attempts from
   memory is a guess about a DOM that has changed. The candidate list is read off the live page
   at the moment of failure, so the model reasons about what is there now.
2. **A decision it is capable of making.** "Pick the best of these five, here are their scores"
   is a ranking problem, which models are good at. "Author a correct CSS selector for a page you
   cannot see" is a generation problem under uncertainty, which they are bad at.
3. **Permission to stop.** When nothing similar exists, the response says so explicitly — *"No
   similar elements found — the page may have navigated away or the element was removed."* An
   agent that knows the element is gone reports a real failure. An agent that only knows its
   selector failed keeps trying.

The third point is the one most often missed. **An API designed for a model must make giving up
correctly as easy as succeeding.** Retry loops that cannot terminate are the characteristic
failure of agentic tooling, and they are caused by tools that never distinguish "you asked
wrongly" from "what you asked for does not exist."

---

## The measured recovery rate

Claiming self-healing works is easy. The repository measures it.

`mcp-server/evals/selector-recovery/` holds a corpus of 18 real-world selector breakages —
pages paired with a mutation that breaks a working selector — the ways selectors break in real codebases: a CSS refactor, a
design-system migration, hashed class names from a bundler, a copy edit, an i18n relabel, a DOM
reshuffle, a wrapper element, a native control swapped for a `div[role]`.

A case counts as **recovered** only when the top-ranked suggestion resolves to **exactly one**
element and that element is the intended target. Uniqueness is part of the bar deliberately: a
selector matching two elements is a Playwright strict-mode violation, so "the right one was
among several" is not a recovery an agent could act on.

Three cases invert the test. The element is genuinely gone, and the correct behaviour is to
offer nothing — so **offering nothing when there is nothing is a pass**, and a confident wrong
suggestion is a failure.

| Case | What changed | Original selector | Expected | Result | Top-ranked suggestion |
| ---- | ------------ | ----------------- | -------- | ------ | --------------------- |
| `class-rename` | CSS refactor renamed the class; id and testid survive | `.btn-primary` | recover | pass | `[data-testid="signup"]` |
| `id-rename` | id renamed by a design-system migration; testid survives | `#signup-btn` | recover | pass | `[data-testid="signup"]` |
| `testid-removed-text-kept` | data-testid stripped in a cleanup; visible text unchanged | `[data-testid=signup]` | recover | pass | `#signup-btn` |
| `hashed-classes` | CSS-modules build produced hashed class names | `.submit-button` | recover | pass | `[data-testid="submit"]` |
| `tag-changed` | button became a styled anchor | `button#checkout` | recover | pass | `[data-testid="checkout"]` |
| `dom-reordered` | layout reshuffle moved the element; nth-of-type now hits the sibling | `form button:nth-of-type(1)` | recover | pass | `[data-testid="save"]` |
| `wrapped-in-container` | element wrapped in new layout divs; descendant path breaks | `body > button` | recover | pass | `[data-testid="subscribe"]` |
| `copy-edit` | copy edit changed the label; text= selector breaks | `text=Sign Up` | recover | pass | `[data-testid="signup"]` |
| `aria-label-only` | icon-only control lost its id; aria-label is the only signal | `#close-modal` | recover | pass | `[aria-label="Close dialog"]` |
| `input-name-kept` | input id changed; name attribute survives | `#email-field` | recover | pass | `#field_0` |
| `role-and-name` | div-with-role replaced the native button | `button[data-testid=next]` | recover | pass | `[data-testid="next"]` |
| `sibling-ambiguity` | a near-identical sibling was added; the right one keeps its testid | `#add-to-cart` | recover | pass | `[data-testid="add-cart"]` |
| `element-removed` | the feature was deleted -- nothing on the page is that control | `#legacy-export` | abstain | pass | _(none offered)_ |
| `navigated-away` | the click navigated to an unrelated page | `#signup-btn` | abstain | pass | _(none offered)_ |
| `identical-siblings` | the testid is gone and an identical-looking sibling exists -- nothing distinguishes them but order | `#confirm` | recover | FAIL | `text=Continue` |
| `i18n-relabel` | UI language switched: the label changed completely and no testid survives | `#save` | recover | pass | `text=Enregistrer` |
| `all-signals-gone` | testid, id, text and role all changed at once -- nothing reliable is left to match on | `[data-testid=export]` | abstain | FAIL | `[data-testid="download"]` |
| `decoy-keeps-old-testid` | an unrelated new control inherited the old testid; the real target was renamed | `[data-testid=submit]` | recover | FAIL | `[data-testid="submit"]` |

- **Top-1 recovery: 86.7%** — 13/15 broken selectors where the highest-ranked suggestion resolved uniquely to the intended element.
- **Top-3 recovery: 93.3%** — 14/15 where a correct replacement appeared in the first three.
- **Correct abstention: 66.7%** — 2/3 where the element was genuinely gone and nothing was offered.
- **Overall: 83.3%** — 15/18.

Reproduce it:

```bash
cd mcp-server
npm run build          # the eval runs against dist/, i.e. what actually ships
npm run eval
```

The eval runs in CI on every push, and fails the build if the overall rate drops below its
floor. The number in this document is therefore a test result, not a claim.

### What the failures mean

The three failing cases are in the corpus on purpose. A suite containing only cases the tool
passes measures the author's taste in examples, not the algorithm's reach — and each failure
names a real limit worth knowing before you rely on this:

- **`identical-siblings`** — when the only surviving signal is visible text and two elements
  share it, the synthesized selector is `text=Continue`, which matches both. The candidate is
  *correct* and *unusable*: selector synthesis does not currently verify that what it proposes
  is unique. This is the most fixable of the three.
- **`all-signals-gone`** — when testid, id, text and role all change at once, the scorer still
  returns its best-scoring element rather than abstaining, because any tag match scores above
  zero and there is no confidence threshold. A score of `2` and a score of `142` are presented
  the same way. An agent reading the score can tell the difference; one reading only the
  ordering cannot.
- **`decoy-keeps-old-testid`** — a `data-testid` match is weighted `+100` against `+30` for
  exact text equality. When an unrelated new control inherits the old testid, that weighting
  picks the decoy over the true target. The weighting is right for the common case and wrong
  for this one, which is the honest trade rather than a bug to paper over.

None of these are hidden by the headline number, because the headline number is computed from
the same table that shows them.

---

## The broader principle

The selector case is one instance of a rule applied throughout the tool surface:

| Conventional response | What WebMobAI returns | Why it matters to a caller that is a model |
| --------------------- | --------------------- | ------------------------------------------ |
| `element not found` | prior fingerprint + ranked candidates + synthesized selectors | turns generation-under-uncertainty into ranking |
| `assertion failed` | the failure + URL, console errors, network errors, screenshot | distinguishes "wrong selector" from "session expired" |
| a11y violation count | per-rule findings with the axe rule id and the failing node | the model can fix a specific node, not a number |
| a screenshot diff percentage | changed regions, plus optional narration of *what* changed | a percentage is not actionable; a region is |
| `browser not launched` | the failure plus the exact tool call that launches one | the recovery path is in the error, not the docs |

The test in every case: **after reading this response, can the caller take a correct next action
without asking a human?** If not, the response is incomplete regardless of how accurate it is.

---

## Related

- [`mcp-server/evals/selector-recovery/`](../mcp-server/evals/selector-recovery/) — the corpus
  and the runner behind the table above.
- [`.claude/skills/debugging-web-selectors/`](../.claude/skills/debugging-web-selectors/SKILL.md)
  — the packaged workflow that drives this diagnostic interactively.
- `webmobai_describe_selector` — inspect what a selector matches right now: match count and a
  per-match summary. The manual counterpart to the automatic triage.
- [SECURITY.md](../SECURITY.md) — the tool drives authenticated browsers; read this before
  pointing it at anything real.
