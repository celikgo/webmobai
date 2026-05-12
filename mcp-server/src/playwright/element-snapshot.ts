import type { Page } from "playwright";

/**
 * An element snapshot is a stable fingerprint we keep for each selector we
 * successfully interacted with. When that selector later misses, we use the
 * snapshot to find probable replacements: the element that moved, got
 * renamed, or had its class string changed.
 *
 * Fields are chosen so that *at least one* survives the typical change:
 *  - text: survives class renames, layout reshuffles
 *  - role + accessibleName: survives class renames and most refactors
 *  - testid: survives almost any change (when present)
 *  - position: survives text changes for icon-only elements
 *  - attrs: secondary signal for ambiguous matches
 */
export interface ElementSnapshot {
  tag: string;
  text: string;
  role: string | null;
  accessibleName: string | null;
  testid: string | null;
  ariaLabel: string | null;
  position: { x: number; y: number; width: number; height: number };
  attrs: Record<string, string>;
}

/**
 * Capture a snapshot of the first element matching `selector`. Returns null
 * if no element matches (caller should treat that as "nothing to remember").
 */
export async function snapshotElement(
  page: Page,
  selector: string,
): Promise<ElementSnapshot | null> {
  try {
    return await page.$eval(selector, (el) => {
      const rect = el.getBoundingClientRect();
      const attrs: Record<string, string> = {};
      for (const attr of el.attributes) {
        if (
          attr.name === "id" ||
          attr.name === "name" ||
          attr.name === "type" ||
          attr.name.startsWith("data-")
        ) {
          attrs[attr.name] = attr.value;
        }
      }
      return {
        tag: el.tagName.toLowerCase(),
        text: (el.textContent ?? "").trim().slice(0, 200),
        role: el.getAttribute("role"),
        accessibleName:
          el.getAttribute("aria-label") ??
          el.getAttribute("aria-labelledby") ??
          (el as HTMLImageElement).alt ??
          null,
        testid: el.getAttribute("data-testid"),
        ariaLabel: el.getAttribute("aria-label"),
        position: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        attrs,
      };
    });
  } catch {
    return null;
  }
}

/**
 * Score candidate elements on the page by similarity to a prior snapshot.
 * Returns up to `max` candidates ordered most-similar-first, each with a
 * suggested selector that's likely to be stable.
 */
export async function findSimilarElements(
  page: Page,
  prior: ElementSnapshot,
  max = 5,
): Promise<
  {
    score: number;
    snapshot: ElementSnapshot;
    suggestedSelector: string;
  }[]
> {
  return await page.evaluate(
    ({ prior, max }) => {
      // Walk every interactive-ish element on the page and score it.
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(
          "a, button, input, select, textarea, [role], [data-testid], [tabindex]",
        ),
      );

      function buildSnapshot(el: HTMLElement) {
        const rect = el.getBoundingClientRect();
        const attrs: Record<string, string> = {};
        for (const attr of el.attributes) {
          if (
            attr.name === "id" ||
            attr.name === "name" ||
            attr.name === "type" ||
            attr.name.startsWith("data-")
          ) {
            attrs[attr.name] = attr.value;
          }
        }
        return {
          tag: el.tagName.toLowerCase(),
          text: (el.textContent ?? "").trim().slice(0, 200),
          role: el.getAttribute("role"),
          accessibleName:
            el.getAttribute("aria-label") ??
            el.getAttribute("aria-labelledby") ??
            (el as HTMLImageElement).alt ??
            null,
          testid: el.getAttribute("data-testid"),
          ariaLabel: el.getAttribute("aria-label"),
          position: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          attrs,
        };
      }

      function pickSelector(el: HTMLElement, snap: ReturnType<typeof buildSnapshot>): string {
        // Prefer stable selectors in this priority order:
        if (snap.testid) return `[data-testid="${snap.testid}"]`;
        if (snap.attrs.id) return `#${snap.attrs.id}`;
        if (snap.ariaLabel) return `[aria-label="${snap.ariaLabel.replace(/"/g, '\\"')}"]`;
        if (snap.role && snap.text) {
          // role + accessible text — what Playwright's getByRole accepts.
          return `role=${snap.role}[name="${snap.text.slice(0, 60).replace(/"/g, '\\"')}"]`;
        }
        if (snap.text) return `text=${snap.text.slice(0, 60)}`;
        // Fall back to tag + nth-of-type using DOM position.
        const sameTag = Array.from(document.querySelectorAll(snap.tag));
        const index = sameTag.indexOf(el);
        return `${snap.tag}:nth-of-type(${index + 1})`;
      }

      function score(snap: ReturnType<typeof buildSnapshot>): number {
        let s = 0;
        // testid match is a near-certain identity — heavy weight.
        if (snap.testid && snap.testid === prior.testid) s += 100;
        // Same role + same accessible text is very strong.
        if (snap.role && snap.role === prior.role) s += 10;
        if (
          snap.accessibleName &&
          snap.accessibleName === prior.accessibleName
        )
          s += 20;
        // Tag match is weak but a baseline.
        if (snap.tag === prior.tag) s += 2;
        // Text equality is strong.
        if (snap.text && prior.text && snap.text === prior.text) s += 30;
        // Text substring match is medium.
        else if (
          snap.text &&
          prior.text &&
          (snap.text.includes(prior.text) || prior.text.includes(snap.text))
        )
          s += 12;
        // Same id / name attribute.
        if (snap.attrs.id && snap.attrs.id === prior.attrs.id) s += 25;
        if (snap.attrs.name && snap.attrs.name === prior.attrs.name) s += 15;
        // Position proximity — same x/y within 100px is +5, within 50px +10.
        const dx = Math.abs(snap.position.x - prior.position.x);
        const dy = Math.abs(snap.position.y - prior.position.y);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 50) s += 10;
        else if (dist < 200) s += 5;
        return s;
      }

      const scored = candidates
        .map((el) => {
          const snap = buildSnapshot(el);
          return { score: score(snap), snapshot: snap, el };
        })
        .filter((c) => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, max);

      return scored.map((c) => ({
        score: c.score,
        snapshot: c.snapshot,
        suggestedSelector: pickSelector(c.el, c.snapshot),
      }));
    },
    { prior, max },
  );
}
