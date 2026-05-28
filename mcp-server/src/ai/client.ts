/**
 * Thin wrapper around @anthropic-ai/sdk. The only place in the server that
 * talks to the Anthropic API; every AI-backed tool funnels through `complete()`.
 *
 * Design rules:
 *   - Never throw when the AI is simply disabled — callers check `isAiEnabled()`
 *     first and return a graceful "set the API key" message.
 *   - Always cache the system prompt (cache_control: ephemeral) so repeated
 *     calls of the same task type pay only one cache-write and many cache-reads.
 *   - The SDK client is lazy-instantiated and memoized so tests can reset it.
 */

import Anthropic from "@anthropic-ai/sdk";
import { getAiConfig, AI_DISABLED_MESSAGE, type AiConfig } from "./config.js";
import { logger } from "../utils/logger.js";

export type TextBlock = { type: "text"; text: string };
export type ImageBlock = {
  type: "image";
  source: { type: "base64"; media_type: "image/png" | "image/jpeg"; data: string };
};
export type UserBlock = TextBlock | ImageBlock;

export interface CompleteOptions {
  /** System prompt — task description, output format. Always cached. */
  system: string;
  /** User message: a plain string, or a sequence of text + image blocks. */
  userContent: string | UserBlock[];
  /** Override model from env config. */
  model?: string;
  /** Override max_tokens from env config. */
  maxTokens?: number;
}

export interface CompleteResult {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
  };
}

export class AiDisabledError extends Error {
  constructor() {
    super(AI_DISABLED_MESSAGE);
    this.name = "AiDisabledError";
  }
}

let _client: Anthropic | null = null;
let _lastCfg: AiConfig | null = null;

function getClient(cfg: AiConfig): Anthropic {
  // If the config changed (e.g. a test set a different key), rebuild.
  if (_client && _lastCfg && _lastCfg.apiKey === cfg.apiKey) return _client;
  if (!cfg.apiKey) throw new AiDisabledError();
  _client = new Anthropic({ apiKey: cfg.apiKey });
  _lastCfg = cfg;
  return _client;
}

export function isAiEnabled(): boolean {
  return getAiConfig().enabled;
}

/** Reset the memoized client. Used by tests; not normally needed at runtime. */
export function resetAiClientForTesting(): void {
  _client = null;
  _lastCfg = null;
}

/**
 * Send a single user turn to Claude with the configured model and a cached
 * system prompt. Concatenates the text blocks of the response into a string.
 */
export async function complete(opts: CompleteOptions): Promise<CompleteResult> {
  const cfg = getAiConfig();
  if (!cfg.enabled) throw new AiDisabledError();
  const client = getClient(cfg);

  const userBlocks: UserBlock[] =
    typeof opts.userContent === "string"
      ? [{ type: "text", text: opts.userContent }]
      : opts.userContent;

  // System prompt as a single text block with cache_control so repeat tasks of
  // the same kind hit the prompt cache. ~90% input cost reduction on hits.
  const system = [
    {
      type: "text" as const,
      text: opts.system,
      cache_control: { type: "ephemeral" as const },
    },
  ];

  const model = opts.model ?? cfg.model;
  const maxTokens = opts.maxTokens ?? cfg.maxTokens;

  // Cast to the SDK's input types — our discriminated unions are structurally
  // compatible but the SDK types are deeply nested.
  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: system as unknown as Anthropic.Messages.TextBlockParam[],
    messages: [
      {
        role: "user",
        content: userBlocks as unknown as Anthropic.Messages.ContentBlockParam[],
      },
    ],
  });

  const text = message.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const usage = message.usage;
  const result: CompleteResult = {
    text,
    usage: {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
    },
  };
  logger.info(
    `AI call ok (model=${model}, in=${result.usage.inputTokens}, out=${result.usage.outputTokens}, cache_read=${result.usage.cacheReadInputTokens})`,
  );
  return result;
}
