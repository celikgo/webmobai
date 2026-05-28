import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
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
 *
 * Sprint 16 adds **baseline history**: whenever an existing baseline is
 * overwritten, the previous image is archived to
 * `<name>.v<unix-ms>.png` before the new one lands. Up to `maxVersions`
 * archives are kept per snapshot (oldest pruned). Callers can list and
 * promote earlier versions, so an intentional UI change you later regret can
 * be rolled back without git surgery.
 */

export const DEFAULT_MAX_VERSIONS = 5;

export interface BaselineVersion {
  /** Unix milliseconds when the version was archived. */
  timestamp: number;
  /** Absolute filesystem path to the archived PNG. */
  path: string;
}

export class BaselineStore {
  constructor(
    public readonly baseDir: string,
    public readonly maxVersions: number = DEFAULT_MAX_VERSIONS,
  ) {}

  pathFor(name: string, suffix = ""): string {
    const safe = sanitizeName(name);
    return join(this.baseDir, `${safe}${suffix}.png`);
  }

  /** Filesystem path to a specific archived version. */
  versionPathFor(name: string, timestamp: number): string {
    return this.pathFor(name, `.v${timestamp}`);
  }

  hasBaseline(name: string): boolean {
    return existsSync(this.pathFor(name));
  }

  async readBaseline(name: string): Promise<Buffer> {
    return readFile(this.pathFor(name));
  }

  /**
   * Write a baseline. If one already exists at this name, the existing image
   * is first archived to `<name>.v<unix-ms>.png` and oldest archives beyond
   * `maxVersions` are pruned. First-time writes have nothing to archive.
   */
  async writeBaseline(name: string, png: Buffer): Promise<string> {
    const path = this.pathFor(name);
    await mkdir(dirOf(path), { recursive: true });
    if (existsSync(path)) {
      const existing = await readFile(path);
      const ts = Date.now();
      const archivePath = this.versionPathFor(name, ts);
      await writeFile(archivePath, existing);
      await this.pruneOldVersions(name);
    }
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

  /**
   * List archived versions for `name`, newest first. Returns an empty array
   * if the snapshot directory does not yet exist.
   */
  async listVersions(name: string): Promise<BaselineVersion[]> {
    const currentPath = this.pathFor(name);
    const dir = dirOf(currentPath);
    if (!existsSync(dir)) return [];
    const entries = await readdir(dir);
    const fileName = currentPath.slice(dir.length + 1);
    const baseName = fileName.slice(0, -".png".length);
    const prefix = `${baseName}.v`;
    const versions: BaselineVersion[] = [];
    for (const entry of entries) {
      if (!entry.startsWith(prefix) || !entry.endsWith(".png")) continue;
      // Skip `.diff`, `.actual`, and any other unrelated `.<suffix>.png`
      // that happens to share the base name.
      const middle = entry.slice(prefix.length, -".png".length);
      const ts = Number(middle);
      if (!Number.isFinite(ts)) continue;
      versions.push({ timestamp: ts, path: join(dir, entry) });
    }
    return versions.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Promote an archived version to become the current baseline. The
   * previously-current baseline is itself archived first, so the operation
   * is reversible without losing history.
   */
  async restoreVersion(name: string, timestamp: number): Promise<string> {
    const archivePath = this.versionPathFor(name, timestamp);
    if (!existsSync(archivePath)) {
      throw new Error(
        `No archived baseline version ${timestamp} for "${name}". Use listVersions to discover available ones.`,
      );
    }
    const png = await readFile(archivePath);
    return this.writeBaseline(name, png);
  }

  private async pruneOldVersions(name: string): Promise<void> {
    const versions = await this.listVersions(name);
    if (versions.length <= this.maxVersions) return;
    for (const v of versions.slice(this.maxVersions)) {
      await unlink(v.path).catch(() => {
        // Ignore — a missing/locked file is not fatal to the new write.
      });
    }
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
