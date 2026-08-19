import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Subprocess tests for the `webmobai-mcp` entrypoint.
 *
 * These exist because of a specific defect: the entrypoint had no argv
 * handling at all, so `webmobai-mcp --help` — a command the README's install
 * instructions tell people to run to check their install — did not print help
 * and did not exit. It connected the stdio MCP transport and blocked forever
 * waiting for a protocol handshake on stdin. A hang is worse than an error,
 * because it reads as "the tool is broken" with nothing to search for.
 *
 * Every assertion here therefore has a timeout: a regression would hang, and a
 * hanging test that eventually fails is the correct signal.
 */
const pexec = promisify(execFile);
const CLI = fileURLToPath(new URL("../src/index.ts", import.meta.url));
const TSX = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));
const PKG = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
);

async function run(args: string[]): Promise<{ code: number; stdout: string }> {
  try {
    // `timeout` here is the guard against the original bug: if the process
    // does not exit on its own, kill it and let the assertion fail.
    const { stdout } = await pexec(TSX, [CLI, ...args], { timeout: 20_000 });
    return { code: 0, stdout };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; killed?: boolean };
    if (err.killed) throw new Error(`webmobai-mcp ${args.join(" ")} did not exit — it hung`);
    return { code: err.code ?? 1, stdout: err.stdout ?? "" };
  }
}

describe("webmobai-mcp entrypoint", () => {
  for (const flag of ["--help", "-h"]) {
    it(`exits 0 and prints usage for ${flag} instead of blocking on stdin`, async () => {
      const r = await run([flag]);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain("webmobai-mcp");
      expect(r.stdout).toContain("Usage: webmobai-mcp");
      // The help must name the stdio nature of the server: the most common
      // support question is "I ran it and nothing happened".
      expect(r.stdout).toMatch(/stdio/i);
    }, 25_000);
  }

  for (const flag of ["--version", "-V"]) {
    it(`prints the package version for ${flag}`, async () => {
      const r = await run([flag]);
      expect(r.code).toBe(0);
      expect(r.stdout.trim()).toBe(PKG.version);
    }, 25_000);
  }

  it("reports the version from package.json, not a hardcoded literal", async () => {
    // The startup banner used to read "v1.2.0" while the package was at 1.4.0.
    // Asserting they agree keeps the two from drifting apart again.
    const r = await run(["--version"]);
    expect(r.stdout.trim()).toBe(PKG.version);
    expect(r.stdout.trim()).not.toBe("1.2.0");
  }, 25_000);
});
