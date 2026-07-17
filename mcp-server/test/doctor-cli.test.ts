import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

/**
 * Subprocess tests for webmobai-doctor (Feat 3). Chromium is installed in the
 * test environment, so the base run must exit 0; a missing storageState file
 * is a hard error (exit 1).
 */
const pexec = promisify(execFile);
const CLI = fileURLToPath(new URL("../src/doctor-cli.ts", import.meta.url));
const TSX = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

async function run(args: string[] = []): Promise<{ code: number; stdout: string }> {
  try {
    const { stdout } = await pexec(TSX, [CLI, ...args]);
    return { code: 0, stdout };
  } catch (e) {
    const err = e as { code?: number; stdout?: string };
    return { code: err.code ?? 1, stdout: err.stdout ?? "" };
  }
}

describe("webmobai-doctor (Feat 3)", () => {
  it("exits 0 and reports chromium installed when the env is ready", async () => {
    const r = await run();
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("environment check");
    expect(r.stdout).toMatch(/chromium: installed/);
  }, 20_000);

  it("exits 1 when a --storage-state file is missing", async () => {
    const r = await run(["--storage-state", "/no/such/auth.json"]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("file not found");
  }, 20_000);

  it("accepts a valid storageState file", async () => {
    dir = mkdtempSync(join(tmpdir(), "webmobai-doctor-"));
    const p = join(dir, "auth.json");
    writeFileSync(p, JSON.stringify({ cookies: [], origins: [] }), "utf-8");
    const r = await run(["--storage-state", p]);
    // No hard errors → exit 0 even with optional warnings.
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Auth storageState:/);
  }, 20_000);
});
