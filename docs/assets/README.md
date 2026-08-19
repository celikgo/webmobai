# Assets

## `social-preview.png`

The repository's social preview — the card GitHub renders when the repo is linked on
social media, in Slack, or in a chat client. **1280 × 640 at 2× (2560 × 1280)**, which is
GitHub's recommended size.

It is a split frame, because that is the product's whole premise in one picture: a request
made in plain English on the left, and the real browser run with the assertion passing on
the right. Neither half means much alone.

### Regenerating it

The PNG is generated from [`social-preview.html`](./social-preview.html) — kept in the repo
so the image is reproducible and editable, rather than a binary nobody can change. Edit the
HTML, then re-shoot it with the Playwright that already ships in `mcp-server`:

```bash
cd mcp-server
node --input-type=module -e '
import { chromium } from "playwright";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.goto("file://" + process.cwd() + "/../docs/assets/social-preview.html");
await p.screenshot({ path: "../docs/assets/social-preview.png" });
await b.close();
'
```

The image deliberately carries **no counts** (of tools, tests, or binaries). Every other
number this project publishes is verified in CI by `scripts/check-doc-claims.mjs`; a number
baked into a PNG is the one claim that check cannot reach, so the image states none.

### Installing it

GitHub has no API for the social preview — it is upload-only through the web UI:

**Settings → General → Social preview → Edit → Upload an image…**

Then confirm it took effect with a card-preview tool, or by pasting the repo URL into any
chat client.
