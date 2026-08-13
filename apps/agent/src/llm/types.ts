/// Everything persist.ts needs to write one model_calls row — deliberately
/// ignorant of agentId/accountId, which belong to the caller (tick.ts), not
/// to the LLM layer.
export interface ModelCallRecord {
  level: "L1" | "L2";
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  costUsd: number;
  latencyMs: number;
  inputPayload: unknown;
  outputPayload: unknown;
  purpose: "decision" | "comparison";
  replayOf?: string;
}
