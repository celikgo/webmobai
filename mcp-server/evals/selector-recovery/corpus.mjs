/**
 * The selector-recovery corpus.
 *
 * Each case is a page an agent successfully interacted with (`v1`), the
 * selector it used, and the same page after a change that breaks that selector
 * (`v2`). The element the agent *meant* is marked in `v2` with
 * `data-eval-target="1"`.
 *
 * The marker is inert with respect to the algorithm under test: scoring
 * compares tag, text, role, accessible name, `id`, `name`, `data-testid` and
 * position, and selector synthesis prefers testid -> id -> aria-label ->
 * role+text -> text. Nothing reads `data-eval-target`, and because it is placed
 * only on elements that are already interactive it does not enlarge the
 * candidate set either.
 *
 * The mutations are the ways selectors actually break in real codebases -- a
 * CSS refactor, a design-system migration, a framework's hashed class names, a
 * copy edit -- not synthetic scrambles.
 *
 * `expect`:
 *   "recover" -- a correct replacement exists and the tool should rank it first.
 *   "abstain" -- the element is genuinely gone; the right behaviour is to offer
 *                nothing, so the agent stops instead of clicking something wrong.
 *
 * Plain ESM on purpose: the runner imports the COMPILED module from dist/, so
 * the eval measures the code that actually ships. Running the TypeScript
 * sources through a loader is not equivalent -- esbuild's keepNames transform
 * injects a `__name` helper that is undefined inside `page.evaluate`, which
 * makes every lookup throw. That is a property of the loader, not of the
 * product, and an eval that hit it would be measuring the harness.
 */

const page = (body, title = "App") =>
  `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;

export const CORPUS = [
  {
    id: "class-rename",
    mutation: "CSS refactor renamed the class; id and testid survive",
    selector: ".btn-primary",
    expect: "recover",
    v1: page(`
      <button id="signup-btn" data-testid="signup" class="btn-primary">Sign Up</button>
      <button id="login-btn" data-testid="login" class="btn-secondary">Log In</button>`),
    v2: page(`
      <button id="signup-btn" data-testid="signup" class="cta cta--primary" data-eval-target="1">Sign Up</button>
      <button id="login-btn" data-testid="login" class="cta cta--secondary">Log In</button>`),
  },
  {
    id: "id-rename",
    mutation: "id renamed by a design-system migration; testid survives",
    selector: "#signup-btn",
    expect: "recover",
    v1: page(`
      <button id="signup-btn" data-testid="signup" class="btn-primary">Sign Up</button>
      <button id="login-btn" data-testid="login" class="btn-secondary">Log In</button>`),
    v2: page(`
      <button id="cta-primary" data-testid="signup" class="cta" data-eval-target="1">Sign Up</button>
      <button id="cta-secondary" data-testid="login" class="cta">Log In</button>`),
  },
  {
    id: "testid-removed-text-kept",
    mutation: "data-testid stripped in a cleanup; visible text unchanged",
    selector: "[data-testid=signup]",
    expect: "recover",
    v1: page(`
      <button id="signup-btn" data-testid="signup" class="btn-primary">Sign Up</button>
      <button id="login-btn" data-testid="login" class="btn-secondary">Log In</button>`),
    v2: page(`
      <button id="signup-btn" class="btn-primary" data-eval-target="1">Sign Up</button>
      <button id="login-btn" class="btn-secondary">Log In</button>`),
  },
  {
    id: "hashed-classes",
    mutation: "CSS-modules build produced hashed class names",
    selector: ".submit-button",
    expect: "recover",
    v1: page(`
      <button class="submit-button" data-testid="submit">Place order</button>
      <button class="cancel-button" data-testid="cancel">Cancel</button>`),
    v2: page(`
      <button class="Button_root__3xK9a" data-testid="submit" data-eval-target="1">Place order</button>
      <button class="Button_root__7bQ2z" data-testid="cancel">Cancel</button>`),
  },
  {
    id: "tag-changed",
    mutation: "button became a styled anchor",
    selector: "button#checkout",
    expect: "recover",
    v1: page(`
      <button id="checkout" data-testid="checkout">Checkout</button>
      <button id="back" data-testid="back">Back</button>`),
    v2: page(`
      <a href="/checkout" id="checkout" data-testid="checkout" role="button" data-eval-target="1">Checkout</a>
      <button id="back" data-testid="back">Back</button>`),
  },
  {
    id: "dom-reordered",
    mutation: "layout reshuffle moved the element; nth-of-type now hits the sibling",
    selector: "form button:nth-of-type(1)",
    expect: "recover",
    v1: page(`<form>
      <button data-testid="save">Save changes</button>
      <button data-testid="discard">Discard</button>
    </form>`),
    v2: page(`<form>
      <button data-testid="discard">Discard</button>
      <button data-testid="save" data-eval-target="1">Save changes</button>
    </form>`),
  },
  {
    id: "wrapped-in-container",
    mutation: "element wrapped in new layout divs; descendant path breaks",
    selector: "body > button",
    expect: "recover",
    v1: page(`<button data-testid="subscribe" id="sub">Subscribe</button>`),
    v2: page(`<div class="shell"><main class="col"><div class="card">
      <button data-testid="subscribe" id="sub" data-eval-target="1">Subscribe</button>
    </div></main></div>`),
  },
  {
    id: "copy-edit",
    mutation: "copy edit changed the label; text= selector breaks",
    selector: "text=Sign Up",
    expect: "recover",
    v1: page(`
      <button id="signup-btn" data-testid="signup">Sign Up</button>
      <button id="login-btn" data-testid="login">Log In</button>`),
    v2: page(`
      <button id="signup-btn" data-testid="signup" data-eval-target="1">Create account</button>
      <button id="login-btn" data-testid="login">Log In</button>`),
  },
  {
    id: "aria-label-only",
    mutation: "icon-only control lost its id; aria-label is the only signal",
    selector: "#close-modal",
    expect: "recover",
    v1: page(`
      <button id="close-modal" aria-label="Close dialog">X</button>
      <button id="help" aria-label="Open help">?</button>`),
    v2: page(`
      <button class="icon" aria-label="Close dialog" data-eval-target="1">X</button>
      <button class="icon" aria-label="Open help">?</button>`),
  },
  {
    id: "input-name-kept",
    mutation: "input id changed; name attribute survives",
    selector: "#email-field",
    expect: "recover",
    v1: page(`<form>
      <input id="email-field" name="email" type="email">
      <input id="pw-field" name="password" type="password">
    </form>`),
    v2: page(`<form>
      <input id="field_0" name="email" type="email" data-eval-target="1">
      <input id="field_1" name="password" type="password">
    </form>`),
  },
  {
    id: "role-and-name",
    mutation: "div-with-role replaced the native button",
    selector: "button[data-testid=next]",
    expect: "recover",
    v1: page(`
      <button data-testid="next">Next step</button>
      <button data-testid="prev">Previous step</button>`),
    v2: page(`
      <div role="button" tabindex="0" data-testid="next" data-eval-target="1">Next step</div>
      <div role="button" tabindex="0" data-testid="prev">Previous step</div>`),
  },
  {
    id: "sibling-ambiguity",
    mutation: "a near-identical sibling was added; the right one keeps its testid",
    selector: "#add-to-cart",
    expect: "recover",
    v1: page(`<button id="add-to-cart" data-testid="add-cart">Add to cart</button>`),
    v2: page(`
      <button class="buy" data-testid="add-cart" data-eval-target="1">Add to cart</button>
      <button class="buy" data-testid="add-wishlist">Add to cart</button>`),
  },
  {
    id: "element-removed",
    mutation: "the feature was deleted -- nothing on the page is that control",
    selector: "#legacy-export",
    expect: "abstain",
    v1: page(`<button id="legacy-export" data-testid="legacy-export">Export to CSV (legacy)</button>`),
    v2: page(`<p>This feature has been removed.</p>`),
  },
  {
    id: "navigated-away",
    mutation: "the click navigated to an unrelated page",
    selector: "#signup-btn",
    expect: "abstain",
    v1: page(`<button id="signup-btn" data-testid="signup">Sign Up</button>`),
    v2: page(`<h1>404 -- Not found</h1><p>Nothing here.</p>`),
  },
  // ---------------------------------------------------------------------
  // Adversarial cases.
  //
  // The twelve above are the mutations self-healing is designed for, and it
  // handles them. These are the ones where the signal is genuinely weak or
  // absent. They are in the corpus precisely because a suite that only
  // contains cases the tool passes measures nothing -- it reports the author's
  // taste in examples, not the algorithm's reach.
  // ---------------------------------------------------------------------
  {
    id: "identical-siblings",
    mutation: "the testid is gone and an identical-looking sibling exists -- nothing distinguishes them but order",
    selector: "#confirm",
    expect: "recover",
    v1: page(`
      <button id="confirm" class="b">Continue</button>
      <button id="other" class="b">Continue</button>`),
    v2: page(`
      <button class="b" data-eval-target="1">Continue</button>
      <button class="b">Continue</button>`),
  },
  {
    id: "i18n-relabel",
    mutation: "UI language switched: the label changed completely and no testid survives",
    selector: "#save",
    expect: "recover",
    v1: page(`
      <button id="save" class="p">Save</button>
      <button id="cancel" class="s">Cancel</button>`),
    v2: page(`
      <button class="p" data-eval-target="1">Enregistrer</button>
      <button class="s">Annuler</button>`),
  },
  {
    id: "all-signals-gone",
    mutation: "testid, id, text and role all changed at once -- nothing reliable is left to match on",
    selector: "[data-testid=export]",
    expect: "abstain",
    v1: page(`<button data-testid="export" id="exp" aria-label="Export data">Export</button>`),
    v2: page(`
      <a href="/d" id="dl" data-testid="download" aria-label="Download archive">Download archive</a>
      <button id="pr" data-testid="print" aria-label="Print page">Print page</button>`),
  },
  {
    id: "decoy-keeps-old-testid",
    mutation: "an unrelated new control inherited the old testid; the real target was renamed",
    selector: "[data-testid=submit]",
    expect: "recover",
    v1: page(`<button data-testid="submit" id="s1">Submit application</button>`),
    v2: page(`
      <button data-testid="submit" id="newsletter">Submit newsletter signup</button>
      <button data-testid="submit-application" id="s1" data-eval-target="1">Submit application</button>`),
  },
];
