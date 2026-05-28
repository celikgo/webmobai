/**
 * Plain-English narration of a visual-regression diff. Closes the
 * "what visually changed" item that FEATURES.md §3 had previously listed as
 * out-of-scope: with the AI client now opt-in (Sprint 15), we ship it.
 *
 * Inputs: paths to the baseline PNG, actual PNG, and (optional) diff mask PNG
 * (the red-highlighted overlay pixelmatch produces on mismatches).
 *
 * Output: a short markdown narration in 2–6 bullets followed by a severity
 * tag (cosmetic / content / structural).
 */

import { readFile } from "node:fs/promises";
import { complete, type UserBlock } from "./client.js";

const NARRATOR_SYSTEM = `You are a senior frontend QA engineer reviewing a visual regression diff.

You will receive up to three PNG screenshots:
  1. "baseline" — the previous (expected) state
  2. "actual"   — the current state under test
  3. "diff"     — a mask where red pixels mark regions that changed (optional)

Describe what visibly changed in 2–6 short markdown bullets. Be specific:
  - "Hero heading changed from 'Welcome back' to 'Welcome'"
  - "Submit button moved 16px lower and switched from blue to purple"
  - "Sidebar nav has a new 'Settings' item between 'Account' and 'Help'"

Avoid vague phrasing ("colors changed", "things shifted"). Skip differences
that look like anti-aliasing, font-rendering jitter, or animation frames —
call them out as "likely render noise" instead of treating them as real
regressions.

End with one final line:
  Severity: cosmetic | content | structural

Where:
  - cosmetic   = pixel-level differences only (anti-aliasing, minor color)
  - content    = visible text or imagery changed
  - structural = layout / position / element add or remove`;

export interface NarrateVisualDiffInput {
  baselinePath: string;
  actualPath: string;
  diffPath?: string;
  /** Optional snapshot name for the user prompt context. */
  snapshotName?: string;
}

export async function narrateVisualDiff(
  input: NarrateVisualDiffInput,
): Promise<string> {
  const baselineB64 = (await readFile(input.baselinePath)).toString("base64");
  const actualB64 = (await readFile(input.actualPath)).toString("base64");
  const diffB64 = input.diffPath
    ? (await readFile(input.diffPath)).toString("base64")
    : null;

  const blocks: UserBlock[] = [
    {
      type: "text",
      text: input.snapshotName
        ? `Snapshot name: ${input.snapshotName}\n\nBaseline (previous state):`
        : "Baseline (previous state):",
    },
    {
      type: "image",
      source: { type: "base64", media_type: "image/png", data: baselineB64 },
    },
    { type: "text", text: "Actual (current state):" },
    {
      type: "image",
      source: { type: "base64", media_type: "image/png", data: actualB64 },
    },
  ];
  if (diffB64) {
    blocks.push({
      type: "text",
      text: "Diff mask (red = changed pixels):",
    });
    blocks.push({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: diffB64 },
    });
  }

  const { text } = await complete({
    system: NARRATOR_SYSTEM,
    userContent: blocks,
    maxTokens: 1024,
  });
  return text.trim();
}
