import { getAnthropicClient } from "./client.js";
import { SCREEN_SYSTEM_PROMPT } from "./prompts.js";
import { screenOutputFormat, type ScreenOutput } from "./schemas.js";
import { buildContextMessage, type DecisionContext } from "./context.js";
import { calculateCostUsd } from "./cost.js";
import type { ModelCallRecord } from "./types.js";

export const SCREEN_MODEL = "claude-haiku-4-5";

export interface ScreenResult {
  output: ScreenOutput;
  modelCall: ModelCallRecord;
}

/// Plan 2.3 step 6 (L1). The system prompt carries cache_control ttl:"1h"
/// (see shared/prompt-caching.md — the trigger cadence means gaps between
/// calls routinely exceed the 5-minute default). See prompts.ts for the
/// known limitation: Haiku 4.5's 4096-token cache minimum is not cleared by
/// this prompt as written, so cache_creation_input_tokens will read 0 here
/// until it's fleshed out further — tracked, not silently assumed away.
export async function screen(ctx: DecisionContext): Promise<ScreenResult> {
  const userMessage = buildContextMessage(ctx);
  const client = getAnthropicClient();
  const start = Date.now();

  const response = await client.messages.parse({
    model: SCREEN_MODEL,
    max_tokens: 512,
    system: [
      { type: "text", text: SCREEN_SYSTEM_PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } },
    ],
    messages: [{ role: "user", content: userMessage }],
    output_config: { format: screenOutputFormat() },
  });

  const latencyMs = Date.now() - start;

  if (!response.parsed_output) {
    throw new Error(
      `L1 screen call did not produce parseable output (stop_reason: ${response.stop_reason})`,
    );
  }

  const inputPayload = { system: SCREEN_SYSTEM_PROMPT, context: ctx };
  const outputPayload = { parsed: response.parsed_output, stop_reason: response.stop_reason };

  const modelCall: ModelCallRecord = {
    level: "L1",
    model: SCREEN_MODEL,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
    costUsd: calculateCostUsd(SCREEN_MODEL, response.usage),
    latencyMs,
    inputPayload,
    outputPayload,
    purpose: "decision",
  };

  return { output: response.parsed_output, modelCall };
}
