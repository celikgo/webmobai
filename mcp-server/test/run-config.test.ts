import { describe, expect, it } from "vitest";
import { DEFAULT_RUN_CONFIG, parseRunConfig } from "../src/run-config.js";

describe("parseRunConfig", () => {
  it("returns defaults for undefined input", () => {
    expect(parseRunConfig(undefined)).toEqual(DEFAULT_RUN_CONFIG);
  });

  it("returns defaults for empty string input", () => {
    expect(parseRunConfig("")).toEqual(DEFAULT_RUN_CONFIG);
  });

  it("returns defaults and warns for malformed JSON", () => {
    const cfg = parseRunConfig("{ this is not json");
    expect(cfg).toEqual(DEFAULT_RUN_CONFIG);
  });

  it("merges partial overrides over defaults", () => {
    const cfg = parseRunConfig(JSON.stringify({ maxPages: 12 }));
    expect(cfg.maxPages).toBe(12);
    expect(cfg.enableA11y).toBe(true); // unchanged
  });

  it("respects feature toggles set to false", () => {
    const cfg = parseRunConfig(
      JSON.stringify({ enableA11y: false, enablePerformance: false }),
    );
    expect(cfg.enableA11y).toBe(false);
    expect(cfg.enablePerformance).toBe(false);
    expect(cfg.enableVisualRegression).toBe(false); // default
  });

  it("accepts custom viewport", () => {
    const cfg = parseRunConfig(
      JSON.stringify({ viewport: { width: 1920, height: 1080 } }),
    );
    expect(cfg.viewport).toEqual({ width: 1920, height: 1080 });
  });

  it("accepts custom responsive breakpoints", () => {
    const bps = [
      { name: "Phone", width: 320, height: 568 },
      { name: "Desktop", width: 1920, height: 1080 },
    ];
    const cfg = parseRunConfig(JSON.stringify({ responsiveBreakpoints: bps }));
    expect(cfg.responsiveBreakpoints).toEqual(bps);
  });

  it("passes credentials through", () => {
    const creds = { username: "test@example.com", password: "demo123" };
    const cfg = parseRunConfig(JSON.stringify({ credentials: creds }));
    expect(cfg.credentials).toEqual(creds);
  });
});
