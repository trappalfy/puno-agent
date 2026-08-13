// @anthropic-ai/sdk's zodOutputFormat() helper types against zod/v4's
// ZodType internals specifically (checked against the installed SDK's
// helpers/zod.d.ts) — importing the classic top-level "zod" export here
// produces a structurally different ZodObject that fails to satisfy it.
import { z } from "zod/v4";

// L1 (Haiku) screening output — plan 2.3 step 6. One job only: does this
// trigger deserve a full L2 decision? Kept deliberately tiny; the cost
// asymmetry between L1 and L2 only works if L1 stays cheap.
export const ScreenOutputSchema = z.object({
  escalate: z.boolean(),
  reason: z.string().min(1).max(280),
});
export type ScreenOutput = z.infer<typeof ScreenOutputSchema>;

// L2 (Opus) decision output — plan 2.3 step 7. Also reused, unchanged, as
// the schema for the Haiku/Opus divergence replay (plan 3.3.1 / phase-3
// measurement): both models are asked to fill the same shape from the same
// input, so their answers are directly comparable field-by-field.
export const DecisionOutputSchema = z.object({
  action: z.enum(["buy", "sell", "hold"]),
  ticker: z.string().min(1).max(16),
  sizePct: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  thesis: z.string().min(1).max(600),
  riskFlags: z.array(z.string().max(64)).max(8),
});
export type DecisionOutput = z.infer<typeof DecisionOutputSchema>;
