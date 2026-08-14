// @anthropic-ai/sdk's zodOutputFormat() helper types against zod/v4's
// ZodType internals specifically (checked against the installed SDK's
// helpers/zod.d.ts) — importing the classic top-level "zod" export here
// produces a structurally different ZodObject that fails to satisfy it.
import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

// Length caps on the models' free text. These shape the output; they are not
// storage limits — decisions.thesis and signals.reason are `text`, and
// decisions.risk_flags is `jsonb` (packages/shared/src/db/schema.ts), so
// nothing downstream cares how long they are. They live in the schema because
// that is the only place the model is told about them, and they are enforced
// by clamping rather than rejection — see clampText().
export const SCREEN_REASON_MAX = 280;
export const THESIS_MAX = 600;
export const RISK_FLAG_MAX = 64;
export const RISK_FLAGS_MAX = 8;

// L1 (Haiku) screening output — plan 2.3 step 6. One job only: does this
// trigger deserve a full L2 decision? Kept deliberately tiny; the cost
// asymmetry between L1 and L2 only works if L1 stays cheap.
export const ScreenOutputSchema = z.object({
  escalate: z.boolean(),
  reason: z.string().min(1).max(SCREEN_REASON_MAX),
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
  thesis: z.string().min(1).max(THESIS_MAX),
  riskFlags: z.array(z.string().max(RISK_FLAG_MAX)).max(RISK_FLAGS_MAX),
});
export type DecisionOutput = z.infer<typeof DecisionOutputSchema>;

// ---------------------------------------------------------------------------
// Parsing — why these schemas are not handed to zodOutputFormat() directly
//
// Structured output constrains the *shape* of the response, not the length of
// its strings: the API will return a 90-character riskFlag against a JSON
// Schema that says `maxLength: 64`. Meanwhile zodOutputFormat()'s own parse is
// a hard safeParse that throws on the first issue (helpers/zod.js), so an
// over-long string destroys the entire call.
//
// Observed 2026-08-14: `riskFlags.2: Too big: expected string to have <=64
// characters` — Haiku wrote one long label and the whole comparison replay was
// discarded. The same schema backs the real L2 decision, so the same violation
// from Opus aborts a tick the user has already paid the screening fee for.
//
// Throwing away a decision over the length of a label is disproportionate:
// action, ticker, sizePct and confidence — everything that actually drives a
// trade — were valid in that response. So prose is clamped to its cap and
// everything semantic (enums, ranges, missing fields) still fails loudly.
//
// The caps stay in the JSON Schema on purpose. The model should be asked for
// terse output; it just must not be punished for missing by a few characters.
// ---------------------------------------------------------------------------

function clampText(value: unknown, max: number, path: string): unknown {
  if (typeof value !== "string" || value.length <= max) return value;
  let cut = value.slice(0, max - 1);
  // A UTF-16 slice can land in the middle of a surrogate pair, and a lone
  // surrogate is not valid JSON text — Postgres rejects it on the way into
  // jsonb, which would turn a cosmetic overrun into a write failure.
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
  console.warn(`[llm] ${path}: truncated ${value.length} chars to ${max}`);
  return `${cut.trimEnd()}…`;
}

function clampScreenOutput(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const obj = raw as Record<string, unknown>;
  return { ...obj, reason: clampText(obj.reason, SCREEN_REASON_MAX, "screen.reason") };
}

function clampDecisionOutput(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const obj = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {
    ...obj,
    thesis: clampText(obj.thesis, THESIS_MAX, "decision.thesis"),
  };
  if (Array.isArray(obj.riskFlags)) {
    if (obj.riskFlags.length > RISK_FLAGS_MAX) {
      console.warn(
        `[llm] decision.riskFlags: dropped ${obj.riskFlags.length - RISK_FLAGS_MAX} flag(s) over the limit of ${RISK_FLAGS_MAX}`,
      );
    }
    out.riskFlags = obj.riskFlags
      .slice(0, RISK_FLAGS_MAX)
      .map((flag, i) => clampText(flag, RISK_FLAG_MAX, `decision.riskFlags[${i}]`));
  }
  return out;
}

function parseJson(content: string, what: string): unknown {
  try {
    return JSON.parse(content);
  } catch (err) {
    throw new Error(
      `${what}: model output was not valid JSON — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function parseClamped<T>(
  schema: z.ZodType<T>,
  clamp: (raw: unknown) => unknown,
  content: string,
  what: string,
): T {
  const result = schema.safeParse(clamp(parseJson(content, what)));
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("; ");
    throw new Error(`${what}: ${issues}`);
  }
  return result.data;
}

/// `output_config.format` for the L1 screening call. Same JSON Schema
/// zodOutputFormat() would produce, with a parse step that clamps prose
/// instead of discarding the response.
export function screenOutputFormat() {
  return {
    ...zodOutputFormat(ScreenOutputSchema),
    parse: (content: string): ScreenOutput =>
      parseClamped(ScreenOutputSchema, clampScreenOutput, content, "L1 screen output"),
  };
}

/// `output_config.format` for the L2 decision call and its comparison replay.
export function decisionOutputFormat() {
  return {
    ...zodOutputFormat(DecisionOutputSchema),
    parse: (content: string): DecisionOutput =>
      parseClamped(DecisionOutputSchema, clampDecisionOutput, content, "L2 decision output"),
  };
}
