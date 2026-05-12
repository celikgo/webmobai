import type { Page } from "playwright";
import type { Scenario, ScenarioStep } from "./types.js";

/**
 * Generate a starter scenario by inspecting the page DOM. Designed to be a
 * useful first draft, not a polished test — a human (or Claude) reviews and
 * tightens it.
 *
 * Heuristics applied:
 *   - Assert the <h1> text is present (catches catastrophic content loss)
 *   - For each form: assert it's visible, type sample values into inputs,
 *     mark the submit button as a future click-me-and-assert TODO
 *   - For each top-level nav link (first 3): a navigate + assertVisible
 *     step suggesting the user pick which to follow
 *   - For each prominent CTA button (the first 2 visible buttons with text):
 *     an assertVisible step
 *
 * Returns a JSON-serializable Scenario. The CLI/MCP layer is responsible
 * for writing it to a file or returning it as JSON.
 */
export async function scaffoldScenario(
  page: Page,
  url: string,
  options: { name?: string } = {},
): Promise<Scenario> {
  const inspection = await page.evaluate(() => {
    function trim(s: string | null | undefined, n = 80): string {
      return (s ?? "").trim().slice(0, n);
    }

    function selectorFor(el: Element): string {
      const testid = el.getAttribute("data-testid");
      if (testid) return `[data-testid="${testid}"]`;
      if (el.id) return `#${el.id}`;
      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel) return `[aria-label="${ariaLabel.replace(/"/g, '\\"')}"]`;
      // Fall back to role+text via Playwright's role= syntax.
      const role = el.getAttribute("role") ?? el.tagName.toLowerCase();
      const text = (el.textContent ?? "").trim().slice(0, 40);
      if (text) {
        return `role=${role}[name="${text.replace(/"/g, '\\"')}"]`;
      }
      return `${el.tagName.toLowerCase()}`;
    }

    const h1Text = trim(document.querySelector("h1")?.textContent, 80);

    const forms = Array.from(document.querySelectorAll("form")).slice(0, 2).map((form) => {
      const inputs = Array.from(
        form.querySelectorAll<HTMLInputElement>('input, select, textarea'),
      )
        .filter((i) => {
          if (i instanceof HTMLInputElement) {
            return !["hidden", "submit", "button"].includes(i.type);
          }
          return true;
        })
        .slice(0, 6)
        .map((i) => ({
          selector: selectorFor(i),
          type: (i as HTMLInputElement).type ?? i.tagName.toLowerCase(),
          name: i.getAttribute("name") ?? "",
        }));
      const submit = form.querySelector<HTMLElement>(
        'button[type="submit"], input[type="submit"]',
      );
      return {
        selector: selectorFor(form),
        inputs,
        submitSelector: submit ? selectorFor(submit) : null,
      };
    });

    const navLinks = Array.from(
      document.querySelectorAll<HTMLAnchorElement>("nav a[href], header a[href]"),
    )
      .filter((a) => {
        const href = a.getAttribute("href") ?? "";
        return (
          href.length > 0 &&
          !href.startsWith("#") &&
          !href.startsWith("javascript:") &&
          !href.startsWith("mailto:")
        );
      })
      .slice(0, 3)
      .map((a) => ({
        selector: selectorFor(a),
        text: trim(a.textContent),
        href: a.href,
      }));

    const ctas = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button, [role="button"], a.btn, a.button, [class*="cta" i]',
      ),
    )
      .filter((b) => {
        const rect = b.getBoundingClientRect();
        // Skip 0x0 hidden buttons.
        return rect.width > 0 && rect.height > 0 && trim(b.textContent).length > 0;
      })
      .slice(0, 2)
      .map((b) => ({ selector: selectorFor(b), text: trim(b.textContent) }));

    return { h1Text, forms, navLinks, ctas };
  });

  const steps: ScenarioStep[] = [];

  // Always start with a sanity check on the H1 if there is one.
  if (inspection.h1Text) {
    steps.push({
      type: "assertText",
      selector: "h1",
      expected: inspection.h1Text,
      description: `H1 still says "${inspection.h1Text}"`,
    });
  }

  // CTAs — visible-assert as a smoke check.
  for (const cta of inspection.ctas) {
    steps.push({
      type: "assertVisible",
      selector: cta.selector,
      description: `CTA visible: "${cta.text}"`,
    });
  }

  // Forms — assert visible + type sample values into each input.
  let formIndex = 0;
  for (const form of inspection.forms) {
    steps.push({
      type: "assertVisible",
      selector: form.selector,
      description: `Form ${formIndex + 1} is on the page`,
    });
    for (const input of form.inputs) {
      const sample = sampleValueFor(input.type, input.name);
      if (sample == null) continue;
      steps.push({
        type: "type",
        selector: input.selector,
        text: sample,
        description: `Fill ${input.name || input.selector} with sample value`,
      });
    }
    if (form.submitSelector) {
      steps.push({
        type: "screenshot",
        description: `Form ${formIndex + 1} filled — review before adding submit step`,
      });
    }
    formIndex++;
  }

  // Nav links — navigate + assertVisible scaffolding so the user can extend.
  for (const link of inspection.navLinks) {
    steps.push({
      type: "click",
      selector: link.selector,
      description: `Follow nav link "${link.text}"`,
    });
    steps.push({
      type: "assertUrl",
      contains: new URL(link.href).pathname,
      description: `Landed on ${new URL(link.href).pathname}`,
    });
    // After exercising one link, navigate back to the start so the rest of
    // the scaffold runs against the home page.
    steps.push({
      type: "navigate",
      url,
    });
  }

  return {
    name: options.name ?? `Generated scenario for ${url}`,
    description:
      "Auto-generated from page inspection. Review and tighten before checking in.",
    url,
    steps,
    continueOnFailure: false,
  };
}

function sampleValueFor(type: string, name: string): string | null {
  const n = name.toLowerCase();
  switch (type) {
    case "email":
      return "test@example.com";
    case "password":
      return "Password123!";
    case "tel":
      return "+15555550100";
    case "url":
      return "https://example.com";
    case "number":
      return "1";
    case "checkbox":
    case "radio":
    case "file":
    case "submit":
    case "button":
      return null;
    case "search":
      return "test";
    default:
      if (n.includes("email")) return "test@example.com";
      if (n.includes("phone")) return "+15555550100";
      if (n.includes("name")) return "Test User";
      if (n.includes("zip") || n.includes("postal")) return "94103";
      return "sample";
  }
}
