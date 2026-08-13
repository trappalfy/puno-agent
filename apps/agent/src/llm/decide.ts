import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropicClient } from "./client.js";
import { DECIDE_SYSTEM_PROMPT } from "./prompts.js";
import { DecisionOutputSchema, type DecisionOutput } from "./schemas.js";
import { buildContextMessage, type DecisionContext } from "./context.js";
import { calculateCostUsd } from "./cost.js";
import type { ModelCallRecord } from "./types.js";

export const DECIDE_MODEL = "claude-opus-5";

export interface DecideOptions {
  model: string;
  /// Real L2 decision-path calls cache the (frozen) system prompt at 1h TTL
  /// — see shared/prompt-caching.md. Replay calls (llm/replay.ts) must NOT
  /// set this: they're one-off by design, and a cache write that's never
  /// read is a pure loss (plan 3.3.1 "Кэширование на реплее выключается").
  useCache: boolean;
  /// Adaptive thinking — meaningful only for models that support it (Opus).
  /// Left off for the Haiku comparison replay, matching how Free-tier Haiku
  /// decisions actually run (plan 3.3.1: Haiku never gets a "thinking mode").
  useThinking: boolean;
  purpose: "decision" | "comparison";
  replayOf?: string;
}

export interface DecideResult {
  output: DecisionOutput;
  modelCall: ModelCallRecord;
}

/// Plan 2.3 step 7 (L2), and — with useCache:false, useThinking:false, a
/// different model, and purpose:"comparison" — the exact same function
/// serves the Haiku/Opus divergence replay (plan 2.3 "Замер расхождения" /
/// 3.3.1's "Показать, что скажет Opus 5" button). One implementation for
/// both, per the plan's explicit "реализуется один раз".
export async function decide(ctx: DecisionContext, opts: DecideOptions): Promise<DecideResult> {
  const userMessage = buildContextMessage(ctx);
  const client = getAnthropicClient();
  const start = Date.now();

  const systemBlock = opts.useCache
    ? {
        type: "text" as const,
        text: DECIDE_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" as const, ttl: "1h" as const },
      }
    : { type: "text" as const, text: DECIDE_SYSTEM_PROMPT };

  const response = await client.messages.parse({
    model: opts.model,
    max_tokens: 4096,
    ...(opts.useThinking ? { thinking: { type: "adaptive" as const } } : {}),
    system: [systemBlock],
    messages: [{ role: "user", content: userMessage }],
    output_config: {
      format: zodOutputFormat(DecisionOutputSchema),
      ...(opts.useThinking ? { effort: "medium" as const } : {}),
    },
  });

  const latencyMs = Date.now() - start;

  if (!response.parsed_output) {
    throw new Error(
      `decide() call (${opts.purpose}, model ${opts.model}) did not produce parseable output (stop_reason: ${response.stop_reason})`,
    );
  }

  const inputPayload = { system: DECIDE_SYSTEM_PROMPT, context: ctx, model: opts.model };
  const outputPayload = { parsed: response.parsed_output, stop_reason: response.stop_reason };

  const modelCall: ModelCallRecord = {
    level: "L2",
    model: opts.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
    costUsd: calculateCostUsd(opts.model, response.usage),
    latencyMs,
    inputPayload,
    outputPayload,
    purpose: opts.purpose,
    ...(opts.replayOf ? { replayOf: opts.replayOf } : {}),
  };

  return { output: response.parsed_output, modelCall };
}
