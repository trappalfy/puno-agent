export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

// $/1M tokens — verified against the claude-api skill's model catalog
// (cached 2026-06-24), matches the estimates in the design plan (3.1)
// exactly: Haiku 4.5 $1/$5, Opus 5 $5/$25.
export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-haiku-4-5": { inputPerMTok: 1.0, outputPerMTok: 5.0 },
  "claude-haiku-4-5-20251001": { inputPerMTok: 1.0, outputPerMTok: 5.0 },
  "claude-opus-5": { inputPerMTok: 5.0, outputPerMTok: 25.0 },
};

const CACHE_READ_MULTIPLIER = 0.1;
// The runtime always requests ttl:"1h" on the decision path (plan 2.3 — the
// trigger cadence means gaps between calls routinely exceed the 5-minute
// default), so the write premium is always the 1h rate. The replay path
// never sets cache_control at all (see llm/decide.ts), so its
// cache_creation_input_tokens is always 0 and this constant is simply unused
// for those calls — not a special case here.
const CACHE_WRITE_MULTIPLIER_1H = 2.0;

/// Computes cost from the API's own reported usage — never an estimate.
/// Mirrors the verification checklist's own instruction (plan, Верификация
/// → Экономика): "фактическая сумма cost_usd из model_calls", not a guess.
export function calculateCostUsd(model: string, usage: Usage): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    throw new Error(`Unknown model for cost calculation: ${model}`);
  }

  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;

  const inputCost = (usage.input_tokens / 1_000_000) * pricing.inputPerMTok;
  const outputCost = (usage.output_tokens / 1_000_000) * pricing.outputPerMTok;
  const cacheReadCost = (cacheRead / 1_000_000) * pricing.inputPerMTok * CACHE_READ_MULTIPLIER;
  const cacheWriteCost =
    (cacheWrite / 1_000_000) * pricing.inputPerMTok * CACHE_WRITE_MULTIPLIER_1H;

  return inputCost + outputCost + cacheReadCost + cacheWriteCost;
}
