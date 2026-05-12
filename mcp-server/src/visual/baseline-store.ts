import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Storage for visual-regression baselines: one PNG per named snapshot. The
 * caller picks the directory — typically a path checked into the repo
 * (`./visual-baselines/`) so baselines version alongside the code that
 * produced them.
 *
 * Filenames are derived from the snapshot name with a deterministic
 * sanitizer. Slashes in the name produce nested subdirectories, which lets
 * the caller organize baselines by feature/page without extra plumbing:
 *
 *   name "checkout/cart-empty" → <dir>/checkout/cart-empty.png
 */
export class BaselineStore {
  constructor(public readonly baseDir: string) {}

  pathFor(name: string, suffix = ""): string {
    const safe = sanitizeName(name);
    return join(this.baseDir, `${safe}${suffix}.png`);
  }

  hasBaseline(name: string): boolean {
    return existsSync(this.pathFor(name));
  }

  async readBaseline(name: string): Promise<Buffer> {
    return readFile(this.pathFor(name));
  }

  async writeBaseline(name: string, png: Buffer): Promise<string> {
    const path = this.pathFor(name);
    await mkdir(dirOf(path), { recursive: true });
    await writeFile(path, png);
    return path;
  }

  async writeDiff(name: string, png: Buffer): Promise<string> {
    const path = this.pathFor(name, ".diff");
    await mkdir(dirOf(path), { recursive: true });
    await writeFile(path, png);
    return path;
  }

  async writeActual(name: string, png: Buffer): Promise<string> {
    const path = this.pathFor(name, ".actual");
    await mkdir(dirOf(path), { recursive: true });
    await writeFile(path, png);
    return path;
  }
}

function sanitizeName(name: string): string {
  // Replace path-unfriendly chars with `-`, collapse runs, trim. Forward
  // slashes pass through so the caller can use them as folder separators.
  return name
    .split("/")
    .map((seg) =>
      seg
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase(),
    )
    .filter((seg) => seg.length > 0)
    .join("/");
}

function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "." : path.slice(0, i);
}
