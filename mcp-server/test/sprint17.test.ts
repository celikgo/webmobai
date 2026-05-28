import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseInterval,
  parseArgs,
  runMonitorLoop,
} from "../src/monitor-cli.js";
import { BrowserManager } from "../src/playwright/browser-manager.js";

describe("monitor-cli — parseInterval", () => {
  it("parses seconds, minutes, hours", () => {
    expect(parseInterval("30s")).toBe(30_000);
    expect(parseInterval("5m")).toBe(300_000);
    expect(parseInterval("1h")).toBe(3_600_000);
  });

  it("parses milliseconds and decimals", () => {
    expect(parseInterval("250ms")).toBe(250);
    expect(parseInterval("1.5s")).toBe(1500);
    expect(parseInterval("0.5h")).toBe(1_800_000);
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseInterval(" 10s ")).toBe(10_000);
  });

  it("rejects malformed values", () => {
    expect(() => parseInterval("five")).toThrow(/Bad interval/);
    expect(() => parseInterval("5x")).toThrow(/Bad interval/);
    expect(() => parseInterval("")).toThrow(/Bad interval/);
  });
});

describe("monitor-cli — parseArgs", () => {
  it("requires a URL", () => {
    expect(() => parseArgs([])).toThrow(/Usage/);
    expect(() => parseArgs(["--once"])).toThrow(/Usage/);
  });

  it("parses URL, interval, and --once", () => {
    const opts = parseArgs([
      "https://example.com",
      "--interval=30s",
      "--once",
    ]);
    expect(opts.url).toBe("https://example.com");
    expect(opts.intervalMs).toBe(30_000);
    expect(opts.once).toBe(true);
  });

  it("supports --flag value form alongside --flag=value", () => {
    const opts = parseArgs([
      "https://example.com",
      "--interval",
      "1m",
      "--alert-webhook",
      "https://hooks.example.com/x",
    ]);
    expect(opts.intervalMs).toBe(60_000);
    expect(opts.webhook).toBe("https://hooks.example.com/x");
  });

  it("accepts a positional config JSON or --config", () => {
    const positional = parseArgs([
      "https://example.com",
      '{"maxPages":3}',
    ]);
    expect(positional.configJson).toBe('{"maxPages":3}');
    const named = parseArgs([
      "https://example.com",
      "--config",
      '{"maxPages":7}',
    ]);
    expect(named.configJson).toBe('{"maxPages":7}');
  });

  it("rejects unknown flags", () => {
    expect(() => parseArgs(["https://example.com", "--bogus"])).toThrow(
      /Unknown flag/,
    );
  });

  it("defaults to 5m, not --once, no webhook", () => {
    const opts = parseArgs(["https://example.com"]);
    expect(opts.intervalMs).toBe(300_000);
    expect(opts.once).toBe(false);
    expect(opts.webhook).toBeUndefined();
  });
});

describe("monitor-cli — runMonitorLoop", () => {
  it("with --once runs exactly one iteration and stops", async () => {
    let runs = 0;
    let afterRuns = 0;
    await runMonitorLoop(
      {
        url: "https://example.com",
        configJson: "{}",
        intervalMs: 60_000,
        once: true,
      },
      {
        runOnce: async () => {
          runs++;
          return 0;
        },
        afterRun: async () => {
          afterRuns++;
        },
        isStopping: () => false,
      },
    );
    expect(runs).toBe(1);
    expect(afterRuns).toBe(1);
  });

  it("stops when isStopping flips between iterations", async () => {
    let runs = 0;
    let stop = false;
    await runMonitorLoop(
      {
        url: "https://example.com",
        configJson: "{}",
        // 1ms interval — sleepInTicks resolves immediately, so this is fast.
        intervalMs: 1,
        once: false,
      },
      {
        runOnce: async () => {
          runs++;
          if (runs >= 2) stop = true;
          return 0;
        },
        isStopping: () => stop,
      },
    );
    expect(runs).toBe(2);
  });
});

describe("BrowserManager — idle close (Sprint 17)", () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("setIdleTimeout(null) clears any armed timer", async () => {
    dir = mkdtempSync(join(tmpdir(), "webmobai-idle-"));
    const bm = new BrowserManager(dir);
    // No browser launched — methods should not throw.
    bm.setIdleTimeout(5_000);
    bm.setIdleTimeout(null);
    bm.bumpIdleTimer(); // no-op with no timeout configured
    expect(bm.idleTimeoutMs).toBeNull();
  });

  it("idleTimeoutMs reflects the configured value", async () => {
    dir = mkdtempSync(join(tmpdir(), "webmobai-idle-"));
    const bm = new BrowserManager(dir);
    bm.setIdleTimeout(60_000);
    expect(bm.idleTimeoutMs).toBe(60_000);
    bm.setIdleTimeout(0); // 0 means disable
    expect(bm.idleTimeoutMs).toBeNull();
    bm.setIdleTimeout(-100); // negatives also disable
    expect(bm.idleTimeoutMs).toBeNull();
  });
});
