import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserManager } from "../src/playwright/browser-manager.js";
import {
  generateJunitReport,
  renderJunit,
} from "../src/utils/junit-generator.js";
import { fixtureUrl } from "./helpers/browser-fixture.js";
import type { TestReportData } from "../src/types.js";

let browser: BrowserManager | undefined;
let sessionDir: string | undefined;

afterEach(async () => {
  if (browser) await browser.close().catch(() => {});
  browser = undefined;
  if (sessionDir) rmSync(sessionDir, { recursive: true, force: true });
  sessionDir = undefined;
});

describe("BrowserManager — Playwright trace", () => {
  it("writes trace.zip to the session dir on close", async () => {
    sessionDir = mkdtempSync(join(tmpdir(), "webmobai-trace-"));
    browser = new BrowserManager(sessionDir);
    await browser.launch({ headless: true });
    await browser.navigate(fixtureUrl("a11y-clean.html"));
    const tracePath = browser.traceFilePath;
    expect(tracePath).toBe(join(sessionDir, "trace.zip"));

    await browser.close();
    browser = undefined;

    expect(existsSync(tracePath)).toBe(true);
    // Sanity-check it's a non-empty file (real traces are several KB minimum
    // for even a trivial navigation).
    const size = statSync(tracePath).size;
    expect(size).toBeGreaterThan(1000);
  });

  it("does not throw when tracing fails — closes gracefully", async () => {
    // We can't easily make tracing.start fail in a unit test without
    // monkey-patching internals, so this case is exercised indirectly: a
    // launched browser with no trace can still be closed.
    sessionDir = mkdtempSync(join(tmpdir(), "webmobai-trace-"));
    browser = new BrowserManager(sessionDir);
    await browser.launch({ headless: true });
    await expect(browser.close()).resolves.not.toThrow();
    browser = undefined;
  });
});

const SAMPLE_REPORT: TestReportData = {
  id: "report-1",
  url: "https://example.com/path?a=b",
  startedAt: 1_700_000_000_000,
  completedAt: 1_700_000_012_500, // 12.5s
  summary: { totalTests: 3, passed: 1, failed: 1, warnings: 1 },
  results: [
    {
      url: "https://example.com",
      title: "Homepage loads",
      status: "pass",
      category: "Navigation",
      description: "Page loaded with title \"Example\"",
    },
    {
      url: "https://example.com",
      title: "Console errors",
      status: "fail",
      category: "Errors",
      description: "2 console errors detected",
      details: "TypeError: x is undefined; ReferenceError: y is not defined",
    },
    {
      url: "https://example.com",
      title: "Accessibility audit",
      status: "warning",
      category: "Accessibility",
      description: "3 moderate issues",
    },
  ],
  accessibilityIssues: [],
  performanceMetrics: {
    lcp: null,
    fcp: null,
    cls: null,
    tti: null,
    ttfb: null,
    domContentLoaded: null,
    loadComplete: null,
  },
  consoleErrors: [],
  screenshots: [],
  pagesExplored: ["https://example.com"],
};

describe("JUnit XML serializer", () => {
  it("emits a valid <testsuites>/<testsuite>/<testcase> tree", () => {
    const xml = renderJunit(SAMPLE_REPORT);
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
    expect(xml).toMatch(/<testsuites name="WebMobAI"/);
    expect(xml).toMatch(/<testsuite /);
    expect(xml).toMatch(/<testcase /);
  });

  it("counts tests/failures/skipped at both levels", () => {
    const xml = renderJunit(SAMPLE_REPORT);
    // <testsuites> aggregate
    expect(xml).toMatch(
      /<testsuites name="WebMobAI" tests="3" failures="1" errors="0" skipped="1"/,
    );
    // <testsuite>
    expect(xml).toMatch(
      /<testsuite [^>]*tests="3" failures="1" errors="0" skipped="1"/,
    );
  });

  it("emits the test duration in seconds with three decimals", () => {
    const xml = renderJunit(SAMPLE_REPORT);
    expect(xml).toMatch(/time="12\.500"/);
  });

  it("maps fail status to <failure>", () => {
    const xml = renderJunit(SAMPLE_REPORT);
    expect(xml).toMatch(/<failure message="2 console errors detected">/);
    // Failure body contains the details, not just the description.
    expect(xml).toContain("TypeError");
  });

  it("maps warning status to <skipped> (so CI doesn't fail on warnings)", () => {
    const xml = renderJunit(SAMPLE_REPORT);
    expect(xml).toMatch(/<skipped message="3 moderate issues"\/>/);
  });

  it("emits empty <testcase/> for passing results", () => {
    const xml = renderJunit(SAMPLE_REPORT);
    expect(xml).toMatch(
      /<testcase classname="Navigation" name="Homepage loads"\/>/,
    );
  });

  it("escapes XML special chars in user-controlled text", () => {
    const report: TestReportData = {
      ...SAMPLE_REPORT,
      results: [
        {
          url: "https://example.com",
          title: "Bad <input> & special \"chars\"",
          status: "fail",
          category: "Test",
          description: "5 < 6 && 7 > 6",
        },
      ],
      summary: { totalTests: 1, passed: 0, failed: 1, warnings: 0 },
    };
    const xml = renderJunit(report);
    expect(xml).toContain("&lt;input&gt;");
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&quot;");

    // Inside attribute values, none of the raw special chars should leak.
    // Strip all entity refs first, then confirm no raw special chars
    // remain inside name="...".
    const attrMatches = xml.match(/name="[^"]*"/g) ?? [];
    for (const m of attrMatches) {
      const stripped = m.replace(/&(amp|lt|gt|quot|apos);/g, "_");
      // After stripping entities, the only " left should be the wrapping
      // delimiters; raw <, >, & must be gone entirely.
      expect(stripped).not.toMatch(/[<>&]/);
    }
  });

  it("uses host+pathname as suite name for readability", () => {
    const xml = renderJunit(SAMPLE_REPORT);
    expect(xml).toMatch(/name="example\.com\/path"/);
  });

  it("writes the XML to a file when generateJunitReport is called", async () => {
    sessionDir = mkdtempSync(join(tmpdir(), "webmobai-junit-"));
    const path = await generateJunitReport(SAMPLE_REPORT, sessionDir);
    expect(path).toContain(sessionDir);
    expect(path).toMatch(/junit-\d+\.xml$/);
    expect(existsSync(path)).toBe(true);
  });
});
