#!/usr/bin/env node

/**
 * webmobai-codegen — open a browser, watch the user interact, emit a
 * starter scenario JSON they can save and replay with webmobai-scenario.
 *
 * Usage:
 *   webmobai-codegen <url> [-o output.json]
 *
 * Implementation: launches a headed Chromium, hooks page events
 * (click / fill / press) to translate Playwright actions into scenario
 * steps. Recording stops when the user closes the browser window.
 *
 * Output:
 *   - JSON scenario printed to stdout if -o is omitted
 *   - or written to the given path
 */

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import type { Scenario, ScenarioStep } from "./scenario/types.js";

interface Args {
  url: string;
  outPath?: string;
}

function parseArgs(argv: string[]): Args {
  let url: string | undefined;
  let outPath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "-o" || a === "--out") {
      outPath = argv[++i];
    } else if (a === "-h" || a === "--help") {
      console.log(
        "Usage: webmobai-codegen <url> [-o output.json]\n\n" +
          "Open a browser at <url>, record user interactions, and emit\n" +
          "a starter scenario JSON. Close the window to stop recording.",
      );
      process.exit(0);
    } else if (!url) {
      url = a;
    } else {
      console.error(`Unexpected arg: ${a}`);
      process.exit(2);
    }
  }
  if (!url) {
    console.error("Usage: webmobai-codegen <url> [-o output.json]");
    process.exit(2);
  }
  return { url, outPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  const steps: ScenarioStep[] = [];

  // Initial navigate is implicit — the scenario starts at this URL.
  await page.goto(args.url, { waitUntil: "domcontentloaded" });

  // Inject a recorder script that listens to clicks, inputs, and key
  // presses, then surfaces them via console messages we can parse on
  // the Node side. We use console because Playwright doesn't have an
  // event hook for "user clicked something natively". Each captured
  // event is JSON-encoded with a sentinel prefix so we can parse it
  // back unambiguously.
  await context.addInitScript(() => {
    function selectorFor(el: Element): string {
      const testid = el.getAttribute("data-testid");
      if (testid) return `[data-testid="${testid}"]`;
      if (el.id) return `#${el.id}`;
      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel) return `[aria-label="${ariaLabel.replace(/"/g, '\\"')}"]`;
      const text = (el.textContent ?? "").trim().slice(0, 40);
      if (text && /button|a|[role="button"]/i.test(el.tagName + (el.getAttribute("role") ?? ""))) {
        return `role=${el.getAttribute("role") ?? el.tagName.toLowerCase()}[name="${text.replace(/"/g, '\\"')}"]`;
      }
      // Fall back to a tag+nth path that, while ugly, uniquely identifies
      // the element in the current DOM.
      const same = Array.from(document.querySelectorAll(el.tagName));
      return `${el.tagName.toLowerCase()}:nth-of-type(${same.indexOf(el) + 1})`;
    }

    document.addEventListener(
      "click",
      (e) => {
        const target = e.target;
        if (!(target instanceof Element)) return;
        // Closest interactive ancestor (handle clicks on icons inside buttons).
        const interactive =
          target.closest("a, button, [role=button], input, label") ?? target;
        const selector = selectorFor(interactive);
        console.info(
          "__WEBMOBAI_EVENT__" +
            JSON.stringify({ type: "click", selector }),
        );
      },
      true,
    );

    document.addEventListener(
      "change",
      (e) => {
        const target = e.target;
        if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) return;
        const selector = selectorFor(target);
        const value = target.value ?? "";
        if (target instanceof HTMLSelectElement) {
          console.info(
            "__WEBMOBAI_EVENT__" +
              JSON.stringify({ type: "select", selector, value }),
          );
        } else if (target.type !== "password") {
          // Don't record password values — emit a placeholder instead so
          // the codegen output is safe to share.
          console.info(
            "__WEBMOBAI_EVENT__" +
              JSON.stringify({ type: "type", selector, text: value }),
          );
        } else {
          console.info(
            "__WEBMOBAI_EVENT__" +
              JSON.stringify({
                type: "type",
                selector,
                text: "<REDACTED — password field>",
              }),
          );
        }
      },
      true,
    );

    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        console.info(
          "__WEBMOBAI_EVENT__" +
            JSON.stringify({ type: "navigate", url: location.href }),
        );
        lastUrl = location.href;
      }
    }, 250);
  });

  // Reload so the init script applies to the current page too.
  await page.reload({ waitUntil: "domcontentloaded" });

  page.on("console", (msg) => {
    const text = msg.text();
    if (!text.startsWith("__WEBMOBAI_EVENT__")) return;
    try {
      const event = JSON.parse(text.slice("__WEBMOBAI_EVENT__".length)) as {
        type: string;
        selector?: string;
        text?: string;
        value?: string;
        url?: string;
      };
      switch (event.type) {
        case "click":
          if (event.selector) steps.push({ type: "click", selector: event.selector });
          break;
        case "type":
          if (event.selector)
            steps.push({
              type: "type",
              selector: event.selector,
              text: event.text ?? "",
            });
          break;
        case "select":
          if (event.selector)
            steps.push({
              type: "select",
              selector: event.selector,
              value: event.value ?? "",
            });
          break;
        case "navigate":
          if (event.url) steps.push({ type: "navigate", url: event.url });
          break;
      }
    } catch {
      // Malformed event — ignore.
    }
  });

  console.error(
    `[codegen] Recording at ${args.url}. Interact with the browser; close the window to finish.`,
  );

  // Wait until the user closes the page.
  await new Promise<void>((resolve) => {
    page.on("close", () => resolve());
    context.on("close", () => resolve());
  });

  await browser.close().catch(() => {});

  const scenario: Scenario = {
    name: `Recorded scenario for ${args.url}`,
    description: "Generated by webmobai-codegen — review, name, and tighten before checking in.",
    url: args.url,
    steps,
  };

  const json = JSON.stringify(scenario, null, 2);
  if (args.outPath) {
    const abs = resolve(args.outPath);
    await writeFile(abs, json, "utf-8");
    console.error(`[codegen] Wrote ${steps.length} steps to ${abs}`);
  } else {
    process.stdout.write(json + "\n");
  }
}

main().catch((err) => {
  console.error("Codegen CLI fatal error:", err);
  process.exit(1);
});
