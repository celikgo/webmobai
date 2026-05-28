import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BaselineStore } from "../src/visual/baseline-store.js";
import {
  formatLighthouseMarkdown,
  LighthouseUnavailableError,
} from "../src/perf/lighthouse.js";

const PNG_A = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const PNG_B = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
  "base64",
);
const PNG_C = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgYPj/HwADAgH/eL5GtQAAAABJRU5ErkJggg==",
  "base64",
);

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "webmobai-baseline-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// Vitest's auto-fake-timers don't reach Date.now() inside our store because we
// use real Date.now. We instead nudge the timestamp by awaiting a short tick
// between writes so each archived version gets a distinct ms.
async function tick(): Promise<void> {
  await new Promise((r) => setTimeout(r, 5));
}

describe("BaselineStore — versioning (Sprint 16)", () => {
  it("first write does not archive anything", async () => {
    const store = new BaselineStore(dir);
    await store.writeBaseline("button", PNG_A);
    const versions = await store.listVersions("button");
    expect(versions).toHaveLength(0);
    expect(readFileSync(store.pathFor("button"))).toEqual(PNG_A);
  });

  it("overwriting an existing baseline archives the previous one", async () => {
    const store = new BaselineStore(dir);
    await store.writeBaseline("button", PNG_A);
    await tick();
    await store.writeBaseline("button", PNG_B);

    const versions = await store.listVersions("button");
    expect(versions).toHaveLength(1);
    expect(readFileSync(versions[0]!.path)).toEqual(PNG_A);
    expect(readFileSync(store.pathFor("button"))).toEqual(PNG_B);
  });

  it("lists versions newest-first", async () => {
    const store = new BaselineStore(dir);
    await store.writeBaseline("button", PNG_A);
    await tick();
    await store.writeBaseline("button", PNG_B);
    await tick();
    await store.writeBaseline("button", PNG_C);

    const versions = await store.listVersions("button");
    expect(versions).toHaveLength(2);
    expect(versions[0]!.timestamp).toBeGreaterThan(versions[1]!.timestamp);
  });

  it("prunes the oldest archives beyond maxVersions", async () => {
    const store = new BaselineStore(dir, 2);
    await store.writeBaseline("button", PNG_A);
    await tick();
    await store.writeBaseline("button", PNG_B);
    await tick();
    await store.writeBaseline("button", PNG_C);
    await tick();
    await store.writeBaseline("button", PNG_A);

    const versions = await store.listVersions("button");
    expect(versions).toHaveLength(2);
  });

  it("nested snapshot names (forward slashes) version per leaf", async () => {
    const store = new BaselineStore(dir);
    await store.writeBaseline("checkout/cart-empty", PNG_A);
    await tick();
    await store.writeBaseline("checkout/cart-empty", PNG_B);

    const versions = await store.listVersions("checkout/cart-empty");
    expect(versions).toHaveLength(1);
    expect(readFileSync(versions[0]!.path)).toEqual(PNG_A);
    // The sibling "checkout/cart-full" sees no versions.
    expect(await store.listVersions("checkout/cart-full")).toHaveLength(0);
  });

  it("restoreVersion swaps in an archived image and archives the current one", async () => {
    const store = new BaselineStore(dir);
    await store.writeBaseline("button", PNG_A);
    await tick();
    await store.writeBaseline("button", PNG_B);
    const versions = await store.listVersions("button");
    expect(versions).toHaveLength(1);
    const archivedA = versions[0]!.timestamp;

    await store.restoreVersion("button", archivedA);
    // After restore: current is A again; B is now archived.
    expect(readFileSync(store.pathFor("button"))).toEqual(PNG_A);
    const after = await store.listVersions("button");
    expect(after.length).toBeGreaterThanOrEqual(1);
  });

  it("restoreVersion throws for unknown timestamps", async () => {
    const store = new BaselineStore(dir);
    await store.writeBaseline("button", PNG_A);
    await expect(store.restoreVersion("button", 12345)).rejects.toThrow(
      /No archived baseline version/,
    );
  });
});

describe("Lighthouse — formatter and error class (Sprint 16)", () => {
  it("LighthouseUnavailableError carries install instructions", () => {
    const err = new LighthouseUnavailableError();
    expect(err.name).toBe("LighthouseUnavailableError");
    expect(err.message).toMatch(/npm install/);
    expect(err.message).toMatch(/lighthouse/);
  });

  it("formats a Lighthouse result into a readable markdown table", () => {
    const md = formatLighthouseMarkdown({
      url: "https://example.com",
      fetchedUrl: "https://example.com/",
      scores: {
        performance: 0.85,
        accessibility: 1.0,
        bestPractices: 0.45,
        seo: null,
      },
      lowestAudits: [
        { id: "uses-text-compression", title: "Enable text compression", score: 0 },
        { id: "render-blocking-resources", title: "Eliminate render-blocking resources", score: 0.4 },
      ],
    });

    expect(md).toContain("Lighthouse");
    expect(md).toContain("| Performance | 85 | Needs Improvement |");
    expect(md).toContain("| Accessibility | 100 | Good |");
    expect(md).toContain("| Best Practices | 45 | Poor |");
    expect(md).toContain("| SEO | n/a | — |");
    expect(md).toContain("Enable text compression");
    expect(md).toContain("`uses-text-compression`");
  });
});
