import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  getAiConfig,
  AI_DISABLED_MESSAGE,
} from "../src/ai/config.js";
import {
  isAiEnabled,
  resetAiClientForTesting,
} from "../src/ai/client.js";
import { parseAndValidateScenarioJson } from "../src/ai/scenario-generator.js";
import { handleAiTool } from "../src/tools/ai-tools.js";
import { renderMarkdown } from "../src/utils/report-generator.js";
import type { BrowserManager } from "../src/playwright/browser-manager.js";

// Tests must not depend on the host's real environment.
const ORIGINAL_ENV = {
  key: process.env.WEBMOBAI_ANTHROPIC_API_KEY,
  model: process.env.WEBMOBAI_AI_MODEL,
  maxTokens: process.env.WEBMOBAI_AI_MAX_TOKENS,
};

beforeEach(() => {
  delete process.env.WEBMOBAI_ANTHROPIC_API_KEY;
  delete process.env.WEBMOBAI_AI_MODEL;
  delete process.env.WEBMOBAI_AI_MAX_TOKENS;
  resetAiClientForTesting();
});

afterEach(() => {
  // Restore whatever the user had set, so the test process doesn't leak state.
  if (ORIGINAL_ENV.key === undefined) {
    delete process.env.WEBMOBAI_ANTHROPIC_API_KEY;
  } else {
    process.env.WEBMOBAI_ANTHROPIC_API_KEY = ORIGINAL_ENV.key;
  }
  if (ORIGINAL_ENV.model === undefined) {
    delete process.env.WEBMOBAI_AI_MODEL;
  } else {
    process.env.WEBMOBAI_AI_MODEL = ORIGINAL_ENV.model;
  }
  if (ORIGINAL_ENV.maxTokens === undefined) {
    delete process.env.WEBMOBAI_AI_MAX_TOKENS;
  } else {
    process.env.WEBMOBAI_AI_MAX_TOKENS = ORIGINAL_ENV.maxTokens;
  }
  resetAiClientForTesting();
});

describe("AI config", () => {
  it("is disabled when no API key is set", () => {
    expect(getAiConfig().enabled).toBe(false);
    expect(isAiEnabled()).toBe(false);
  });

  it("is enabled when an API key is set", () => {
    process.env.WEBMOBAI_ANTHROPIC_API_KEY = "sk-test-not-real";
    expect(getAiConfig().enabled).toBe(true);
    expect(isAiEnabled()).toBe(true);
  });

  it("treats whitespace-only keys as disabled", () => {
    process.env.WEBMOBAI_ANTHROPIC_API_KEY = "   ";
    expect(isAiEnabled()).toBe(false);
  });

  it("uses claude-opus-4-8 as the default model", () => {
    process.env.WEBMOBAI_ANTHROPIC_API_KEY = "sk-test";
    expect(getAiConfig().model).toBe("claude-opus-4-8");
  });

  it("respects WEBMOBAI_AI_MODEL and WEBMOBAI_AI_MAX_TOKENS overrides", () => {
    process.env.WEBMOBAI_ANTHROPIC_API_KEY = "sk-test";
    process.env.WEBMOBAI_AI_MODEL = "claude-sonnet-4-6";
    process.env.WEBMOBAI_AI_MAX_TOKENS = "512";
    const cfg = getAiConfig();
    expect(cfg.model).toBe("claude-sonnet-4-6");
    expect(cfg.maxTokens).toBe(512);
  });

  it("falls back to the default max_tokens on invalid values", () => {
    process.env.WEBMOBAI_ANTHROPIC_API_KEY = "sk-test";
    process.env.WEBMOBAI_AI_MAX_TOKENS = "garbage";
    expect(getAiConfig().maxTokens).toBe(2048);
  });
});

describe("ai-tools — disabled path", () => {
  const fakeBrowser = { isLaunched: false } as unknown as BrowserManager;

  it("returns the disabled message for every AI tool when no key", async () => {
    for (const name of [
      "webmobai_explain_visual_diff",
      "webmobai_summarize_audit",
      "webmobai_generate_scenario_from_prompt",
    ]) {
      const res = await handleAiTool(name, {}, fakeBrowser);
      expect(res.content[0]?.text).toBe(AI_DISABLED_MESSAGE);
    }
  });
});

describe("Scenario JSON validation", () => {
  const valid = JSON.stringify({
    name: "Login with bad password",
    url: "https://example.com/login",
    description: "Verify the inline error shows up",
    steps: [
      { type: "type", selector: "#email", text: "u@example.com" },
      { type: "type", selector: "#password", text: "wrong" },
      { type: "click", selector: "[data-testid=submit]" },
      {
        type: "assertVisible",
        selector: ".error",
        timeoutMs: 3000,
      },
    ],
  });

  it("parses a plain JSON document", () => {
    const scenario = parseAndValidateScenarioJson(valid);
    expect(scenario.steps).toHaveLength(4);
    expect(scenario.steps[0]).toMatchObject({ type: "type", selector: "#email" });
  });

  it("strips code fences if the model wraps the JSON", () => {
    const scenario = parseAndValidateScenarioJson("```json\n" + valid + "\n```");
    expect(scenario.name).toContain("Login");
  });

  it("rejects non-JSON output", () => {
    expect(() =>
      parseAndValidateScenarioJson("here's the scenario: maybe later"),
    ).toThrow(/non-JSON/);
  });

  it("rejects an unknown step type", () => {
    const bad = JSON.stringify({
      name: "x",
      url: "https://x",
      steps: [{ type: "teleport", selector: "#nope" }],
    });
    expect(() => parseAndValidateScenarioJson(bad)).toThrow();
  });

  it("rejects missing required step fields", () => {
    const bad = JSON.stringify({
      name: "x",
      url: "https://x",
      steps: [{ type: "click" }], // missing selector
    });
    expect(() => parseAndValidateScenarioJson(bad)).toThrow();
  });
});

describe("AI summary markdown renderer", () => {
  it("converts ## headings to <h3>", () => {
    expect(renderMarkdown("## Headline")).toBe("<h3>Headline</h3>");
  });

  it("renders bullets as <ul><li>", () => {
    const html = renderMarkdown("- one\n- two");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>two</li>");
    expect(html).toContain("</ul>");
  });

  it("renders **bold** and *italic* inline", () => {
    const html = renderMarkdown("a **bold** and *italic* word");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("escapes HTML inside paragraphs to prevent injection", () => {
    const html = renderMarkdown("hello <script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("ends an open list before a heading", () => {
    const html = renderMarkdown("- one\n## Next");
    // The </ul> must appear before the <h3>.
    expect(html.indexOf("</ul>")).toBeLessThan(html.indexOf("<h3>"));
  });
});
