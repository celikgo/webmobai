import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserManager } from "../src/playwright/browser-manager.js";
import { handleSecurityTool } from "../src/tools/security-tools.js";
import { fixtureUrl } from "./helpers/browser-fixture.js";

let browser: BrowserManager | undefined;
let sessionDir: string | undefined;

async function setup() {
  sessionDir = mkdtempSync(join(tmpdir(), "webmobai-sec-"));
  browser = new BrowserManager(sessionDir);
  await browser.launch({ headless: true });
  return browser;
}

afterEach(async () => {
  if (browser) await browser.close().catch(() => {});
  browser = undefined;
  if (sessionDir) rmSync(sessionDir, { recursive: true, force: true });
  sessionDir = undefined;
});

function getText(r: { content: { type: string; text: string }[] }): string {
  return r.content[0]?.text ?? "";
}

describe("webmobai_security_audit", () => {
  it("flags missing CSP", async () => {
    const b = await setup();
    await b.navigate(fixtureUrl("security-no-csp.html"));
    const r = await handleSecurityTool("webmobai_security_audit", {}, b);
    const out = getText(r);
    expect(out).toMatch(/csp-missing/);
  });

  it("flags unsafe-inline and unsafe-eval in CSP", async () => {
    const b = await setup();
    await b.navigate(fixtureUrl("security-bad-csp.html"));
    const r = await handleSecurityTool("webmobai_security_audit", {}, b);
    const out = getText(r);
    expect(out).toMatch(/csp-unsafe-inline-script-src/);
    expect(out).toMatch(/csp-unsafe-eval-script-src/);
    expect(out).toMatch(/csp-unsafe-inline-style-src/);
  });

  it("flags HTTP page (no HTTPS)", async () => {
    const b = await setup();
    // file:// URL is "served over HTTP" from the audit's POV (it isn't
    // HTTPS). The "https" finding fires.
    await b.navigate(fixtureUrl("security-no-csp.html"));
    const r = await handleSecurityTool("webmobai_security_audit", {}, b);
    const out = getText(r);
    expect(out).toMatch(/\bhttps\b/);
  });

  it("flags cookie missing Secure/HttpOnly/SameSite", async () => {
    const b = await setup();
    // Add a deliberately bad cookie BEFORE navigating, against the same
    // origin as the page we'll visit. Use a data: URL so we have full
    // control of the origin.
    await b.page.context().addCookies([
      {
        name: "session_id",
        value: "abc123",
        url: "http://localhost/",
        // Secure / HttpOnly / SameSite all omitted on purpose.
      },
    ]);
    await b.navigate("http://localhost/").catch(() => {
      // localhost may not respond; we don't actually need the navigation
      // to succeed for the cookie audit, only for cookies to exist in
      // context.
    });
    const r = await handleSecurityTool("webmobai_security_audit", {}, b);
    const out = getText(r);
    expect(out).toMatch(/cookie-attribute-missing/);
  });

  it("returns a clean report on a fully secure page (mocked)", async () => {
    const b = await setup();
    // Inject a strong CSP via meta tag, no cookies, https-like origin.
    await b.page.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'">
        </head>
        <body><h1>Locked down</h1></body>
      </html>
    `);
    const r = await handleSecurityTool("webmobai_security_audit", {}, b);
    const out = getText(r);
    // No CSP findings expected.
    expect(out).not.toMatch(/csp-missing/);
    expect(out).not.toMatch(/csp-unsafe-inline/);
    expect(out).not.toMatch(/csp-unsafe-eval/);
  });
});
