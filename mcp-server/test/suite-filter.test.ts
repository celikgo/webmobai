import { describe, expect, it } from "vitest";
import {
  applyShard,
  filterByTags,
  parseShard,
} from "../src/suite/filter.js";
import type { RunnableScenario } from "../src/suite/types.js";

function r(name: string, tags: string[] = []): RunnableScenario {
  return {
    scenario: { name, url: "https://example.com", steps: [] },
    tags,
  };
}

describe("filterByTags", () => {
  const items = [
    r("login", ["smoke", "auth"]),
    r("signup", ["e2e", "auth"]),
    r("checkout", ["e2e", "slow"]),
    r("profile", []),
  ];

  it("returns everything when no filters are set", () => {
    expect(filterByTags(items)).toHaveLength(4);
  });

  it("includeTags filters to scenarios with ANY matching tag", () => {
    expect(filterByTags(items, { includeTags: ["smoke"] }).map((r) => r.scenario.name)).toEqual(
      ["login"],
    );
    expect(
      filterByTags(items, { includeTags: ["auth"] }).map((r) => r.scenario.name),
    ).toEqual(["login", "signup"]);
  });

  it("excludeTags drops scenarios with ANY listed tag", () => {
    expect(
      filterByTags(items, { excludeTags: ["slow"] }).map((r) => r.scenario.name),
    ).toEqual(["login", "signup", "profile"]);
  });

  it("exclude wins over include", () => {
    expect(
      filterByTags(items, {
        includeTags: ["e2e"],
        excludeTags: ["slow"],
      }).map((r) => r.scenario.name),
    ).toEqual(["signup"]);
  });

  it("untagged scenarios are dropped when includeTags is set", () => {
    const result = filterByTags(items, { includeTags: ["any"] });
    expect(result).toHaveLength(0);
  });

  it("multiple includeTags is OR, not AND", () => {
    const result = filterByTags(items, { includeTags: ["smoke", "slow"] });
    expect(result.map((r) => r.scenario.name)).toEqual(["login", "checkout"]);
  });
});

describe("applyShard", () => {
  const items = ["a", "b", "c", "d", "e", "f", "g", "h"];

  it("stripes across shards evenly", () => {
    expect(applyShard(items, { index: 1, total: 4 })).toEqual(["a", "e"]);
    expect(applyShard(items, { index: 2, total: 4 })).toEqual(["b", "f"]);
    expect(applyShard(items, { index: 3, total: 4 })).toEqual(["c", "g"]);
    expect(applyShard(items, { index: 4, total: 4 })).toEqual(["d", "h"]);
  });

  it("union of all shards covers every item exactly once", () => {
    const total = 3;
    const union: string[] = [];
    for (let i = 1; i <= total; i++) {
      union.push(...applyShard(items, { index: i, total }));
    }
    expect(union.sort()).toEqual([...items].sort());
  });

  it("returns [] when shard is bigger than items", () => {
    expect(applyShard(["a"], { index: 4, total: 4 })).toEqual([]);
  });

  it("rejects shards out of range", () => {
    expect(() => applyShard(items, { index: 5, total: 4 })).toThrow(/Invalid shard/);
    expect(() => applyShard(items, { index: 0, total: 4 })).toThrow(/Invalid shard/);
    expect(() => applyShard(items, { index: 1, total: 0 })).toThrow(/Invalid shard/);
  });
});

describe("parseShard", () => {
  it("parses k/n", () => {
    expect(parseShard("1/4")).toEqual({ index: 1, total: 4 });
    expect(parseShard("12/100")).toEqual({ index: 12, total: 100 });
  });

  it("tolerates whitespace", () => {
    expect(parseShard("2 / 5")).toEqual({ index: 2, total: 5 });
  });

  it("rejects malformed", () => {
    expect(() => parseShard("1-of-4")).toThrow();
    expect(() => parseShard("4")).toThrow();
    expect(() => parseShard("a/b")).toThrow();
  });
});
