/**
 * AI feature configuration. Sprint 15 introduced an optional Claude API layer;
 * every AI-backed tool is gated behind WEBMOBAI_ANTHROPIC_API_KEY so the server
 * keeps working with no external calls when no key is present.
 *
 * Env vars:
 *   WEBMOBAI_ANTHROPIC_API_KEY  — required to enable AI features
 *   WEBMOBAI_AI_MODEL           — model ID (default: claude-opus-4-8)
 *   WEBMOBAI_AI_MAX_TOKENS      — default max_tokens per call (default: 2048)
 */

export interface AiConfig {
  enabled: boolean;
  apiKey: string | null;
  model: string;
  maxTokens: number;
}

export function getAiConfig(): AiConfig {
  const rawKey = process.env.WEBMOBAI_ANTHROPIC_API_KEY?.trim() ?? "";
  const apiKey = rawKey.length > 0 ? rawKey : null;
  const model =
    process.env.WEBMOBAI_AI_MODEL?.trim() || "claude-opus-4-8";
  const maxTokens = Number.parseInt(
    process.env.WEBMOBAI_AI_MAX_TOKENS ?? "2048",
    10,
  );
  return {
    enabled: apiKey !== null,
    apiKey,
    model,
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 2048,
  };
}

export const AI_DISABLED_MESSAGE =
  "AI features are disabled. Set WEBMOBAI_ANTHROPIC_API_KEY (and optionally WEBMOBAI_AI_MODEL) to enable.";
