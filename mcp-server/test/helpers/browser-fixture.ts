import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { afterAll, beforeAll, beforeEach, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, "..", "fixtures");

let browser: Browser | undefined;
let context: BrowserContext | undefined;

interface PageBag {
  page: Page;
}

/**
 * Test scaffolding: one Chromium per test file, fresh BrowserContext per test
 * so console/error state never leaks between cases.
 *
 * Usage:
 *   const ctx = setupPage();
 *   it("...", async () => {
 *     await ctx.page.goto(fixtureUrl("a11y-issues.html"));
 *     // assertions
 *   });
 */
export function setupPage(): PageBag {
  // `page` is replaced before each test. The bag holds a live reference so
  // tests can read `ctx.page` and always see the current page.
  const bag = { page: undefined as unknown as Page };

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
    browser = undefined;
  });

  beforeEach(async () => {
    if (!browser) throw new Error("browser not launched");
    context = await browser.newContext();
    bag.page = await context.newPage();
  });

  afterEach(async () => {
    await context?.close();
    context = undefined;
  });

  return bag;
}

export function fixtureUrl(name: string): string {
  return "file://" + resolve(fixturesDir, name);
}
