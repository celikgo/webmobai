import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

/**
 * Subprocess smoke test for webmobai-suite exit codes (B4). The exit-code paths
 * live in main() and were previously untested, which is how "exit 0 on a
 * tag filter matching zero scenarios" (green CI on an untested build) shipped.
 */
const pexec = promisify(execFile);
const CLI = fileURLToPath(new URL("../src/suite-cli.ts", import.meta.url));
const TSX = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));

let dir: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function writeSuite(): string {
  dir = mkdtempSync(join(tmpdir(), "webmobai-suitecli-"));
  const suite = {
    name: "t",
    scenarios: [
      { scenario: { name: "a", url: "https://example.com", steps: [] }, tags: ["real"] },
    ],
  };
  const p = join(dir, "suite.json");
  writeFileSync(p, JSON.stringify(suite), "utf-8");
  return p;
}

async function run(
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await pexec(TSX, [CLI, ...args], { cwd: dir });
    return { code: 0, stdout, stderr };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { code: err.code ?? 1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

describe("webmobai-suite exit codes (B4)", () => {
  it("exits 2 when a tag filter matches zero of a non-empty suite", async () => {
    const p = writeSuite();
    const r = await run([p, "--tag", "nonexistent", "--reporter", "none"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("matched 0");
  }, 20_000);

  it("exits 0 with --allow-empty when a tag filter matches zero", async () => {
    const p = writeSuite();
    const r = await run([
      p,
      "--tag",
      "nonexistent",
      "--allow-empty",
      "--reporter",
      "none",
    ]);
    expect(r.code).toBe(0);
  }, 20_000);
});
