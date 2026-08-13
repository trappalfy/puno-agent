import { decide, type DecideResult } from "../llm/decide.js";
import { SCREEN_MODEL } from "../llm/screen.js";
import type { DecisionContext } from "../llm/context.js";
import type { DecisionOutput } from "../llm/schemas.js";

/// The Haiku/Opus divergence harness — plan 2.3 ("Замер расхождения...
/// здесь, а не в фазе 5") AND plan 3.3.1 (the Free-trial "show me what Opus
/// would say" button). Same function serves both: the only difference
/// between the phase-3 measurement and the future production feature is who
/// calls it and what happens to the result, never how the replay itself
/// works. No cache_control (see llm/decide.ts) — a replay is one-off by
/// construction, so a cache write here would never be read.
export async function replayWithHaiku(
  ctx: DecisionContext,
  originalModelCallId: string,
): Promise<DecideResult> {
  return decide(ctx, {
    model: SCREEN_MODEL,
    useCache: false,
    useThinking: false,
    purpose: "comparison",
    replayOf: originalModelCallId,
  });
}

export interface DivergenceResult {
  actionDiffers: boolean;
  sizePctDiff: number;
  confidenceDiff: number;
  isDivergent: boolean;
}

// Placeholder tolerances — plan 2.3/Верификация explicitly defers the actual
// threshold to "заданный допуск", calibrated once real comparison data
// exists. These are a reasonable starting point, not a measured constant.
export const SIZE_PCT_TOLERANCE = 15;
export const CONFIDENCE_TOLERANCE = 0.15;

export function computeDivergence(
  original: DecisionOutput,
  replay: DecisionOutput,
): DivergenceResult {
  const actionDiffers = original.action !== replay.action;
  const sizePctDiff = Math.abs(original.sizePct - replay.sizePct);
  const confidenceDiff = Math.abs(original.confidence - replay.confidence);
  const isDivergent =
    actionDiffers || sizePctDiff > SIZE_PCT_TOLERANCE || confidenceDiff > CONFIDENCE_TOLERANCE;
  return { actionDiffers, sizePctDiff, confidenceDiff, isDivergent };
}
