import type { RunnableScenario } from "./types.js";

/**
 * Apply --tag and --exclude-tag filters to a list of runnable scenarios.
 *
 * Include semantics (OR within tag list): if includeTags is non-empty, a
 * scenario passes if it has ANY of those tags. Empty includeTags means
 * "everything passes the include check".
 *
 * Exclude semantics (OR within tag list): if a scenario has ANY excludeTag,
 * it's dropped. Empty excludeTags means "no exclusions".
 *
 * Exclude wins over include — a scenario tagged ["smoke", "slow"] with
 * include=["smoke"] and exclude=["slow"] is dropped.
 */
export function filterByTags(
  scenarios: RunnableScenario[],
  options: { includeTags?: string[]; excludeTags?: string[] } = {},
): RunnableScenario[] {
  const include = options.includeTags ?? [];
  const exclude = options.excludeTags ?? [];

  return scenarios.filter((s) => {
    const tagSet = new Set(s.tags);

    if (include.length > 0) {
      const matchesInclude = include.some((t) => tagSet.has(t));
      if (!matchesInclude) return false;
    }

    if (exclude.length > 0) {
      const matchesExclude = exclude.some((t) => tagSet.has(t));
      if (matchesExclude) return false;
    }

    return true;
  });
}

/**
 * Split a list into a single shard via modular striping. `index` is
 * 1-based: shard 1 of 3 returns entries 0, 3, 6, ... Shard 3 of 3 returns
 * entries 2, 5, 8, ...
 *
 * Striping (vs contiguous chunking) keeps load balanced across shards even
 * when scenarios have wildly different durations — adjacent scenarios in
 * the file rarely all take the same time.
 *
 * Throws on out-of-range indices so a typo (`--shard 5/4`) fails fast.
 */
export function applyShard<T>(
  items: T[],
  shard: { index: number; total: number },
): T[] {
  if (
    !Number.isInteger(shard.index) ||
    !Number.isInteger(shard.total) ||
    shard.total < 1 ||
    shard.index < 1 ||
    shard.index > shard.total
  ) {
    throw new Error(
      `Invalid shard ${shard.index}/${shard.total} — index must be in 1..total and total >= 1`,
    );
  }
  return items.filter((_, i) => i % shard.total === shard.index - 1);
}

/**
 * Parse a CLI shard string like "1/4" into the {index, total} shape.
 * Throws on malformed input.
 */
export function parseShard(raw: string): { index: number; total: number } {
  const match = raw.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) {
    throw new Error(
      `--shard expects "k/n" (got "${raw}"). Example: --shard 1/4`,
    );
  }
  return {
    index: Number(match[1]),
    total: Number(match[2]),
  };
}
