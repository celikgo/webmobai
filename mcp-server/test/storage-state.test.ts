import { describe, expect, it, afterEach, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserManager } from "../src/playwright/browser-manager.js";
import { handleBrowserTool } from "../src/tools/browser-tools.js";
import { runScenario } from "../src/scenario/runner.js";
import type { Scenario } from "../src/scenario/types.js";
import { startLocalServer, html, type LocalServer } from "./helpers/local-server.js";

/**
 * Sprint 18 — storageState authentication + pauseForManual.
 * Uses a real in-process HTTP origin so cookies/localStorage actually persist
 * through the storageState round-trip (a file:// origin can't).
 */
let server: LocalServer;
const dirs: string[] = [];

beforeAll(async () => {
  server = await startLocalServer({ "/": html("<h1>login area</h1>") });
});
afterAll(async () => {
  await server.close();
});
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function newManager(): BrowserManager {
  const dir = mkdtempSync(join(tmpdir(), "webmobai-ss-"));
  dirs.push(dir);
  return new BrowserManager(dir);
}

describe("storageState authentication (Feat 1)", () => {
  it("saves a session and replays it authenticated on the next launch", async () => {
    const authPath = join(mkdtempSync(join(tmpdir(), "webmobai-auth-")), "auth.json");
    dirs.push(authPath.replace(/\/auth\.json$/, ""));

    // Session 1: establish a "logged-in" marker and save the session.
    const b1 = newManager();
    await b1.launch({ headless: true });
    await b1.navigate(server.url("/"));
    await b1.page.evaluate(() => localStorage.setItem("webmobai_session", "logged-in-token"));
    await b1.saveStorageState(authPath);
    await b1.close();

    // The saved file is valid storageState JSON.
    const saved = JSON.parse(readFileSync(authPath, "utf-8"));
    expect(saved).toHaveProperty("cookies");
    expect(saved).toHaveProperty("origins");

    // Session 2: launch from the saved state — the marker is restored, i.e.
    // the new context started already authenticated.
    const b2 = newManager();
    await b2.launch({ headless: true, storageStatePath: authPath });
    await b2.navigate(server.url("/"));
    const restored = await b2.page.evaluate(() => localStorage.getItem("webmobai_session"));
    await b2.close();
    expect(restored).toBe("logged-in-token");
  });

  it("throws a clear error when the storageState file does not exist", async () => {
    const b = newManager();
    await expect(
      b.launch({ headless: true, storageStatePath: "/no/such/auth.json" }),
    ).rejects.toThrow(/storageState file not found/);
    await b.close().catch(() => {});
  });

  it("webmobai_save_storage_state refuses when no browser is launched", async () => {
    const b = newManager();
    const r = await handleBrowserTool("webmobai_save_storage_state", { path: "x.json" }, b);
    expect(r.content[0]?.text).toContain("no browser is launched");
  });

  it("webmobai_save_storage_state saves without ever echoing session contents", async () => {
    const authPath = join(mkdtempSync(join(tmpdir(), "webmobai-auth2-")), "auth.json");
    dirs.push(authPath.replace(/\/auth\.json$/, ""));
    const b = newManager();
    await b.launch({ headless: true });
    await b.navigate(server.url("/"));
    await b.page.evaluate(() => localStorage.setItem("secret_token", "SUPER_SECRET_VALUE"));
    const r = await handleBrowserTool("webmobai_save_storage_state", { path: authPath }, b);
    await b.close();
    const msg = r.content[0]?.text ?? "";
    expect(msg).toContain("Saved the current session");
    expect(msg).toContain(".gitignore");
    // The secret must never leak into the tool response.
    expect(msg).not.toContain("SUPER_SECRET_VALUE");
  });
});

describe("pauseForManual step (Feat 2)", () => {
  it("is a fast no-op in headless mode (does not block for its timeout)", async () => {
    const b = newManager();
    await b.launch({ headless: true });
    const scenario: Scenario = {
      name: "auth with a manual pause",
      url: server.url("/"),
      steps: [
        { type: "assertVisible", selector: "h1" },
        // A 60s pause would hang the test if it actually waited headless.
        { type: "pauseForManual", prompt: "solve MFA", timeoutMs: 60_000 },
        { type: "assertVisible", selector: "h1" },
      ],
    };
    const start = Date.now();
    const result = await runScenario(scenario, b);
    const elapsed = Date.now() - start;
    await b.close();

    expect(result.summary.failed).toBe(0);
    expect(result.summary.passed).toBe(3);
    // Headless skips the wait entirely — nowhere near the 60s timeout.
    expect(elapsed).toBeLessThan(15_000);
  });
});
