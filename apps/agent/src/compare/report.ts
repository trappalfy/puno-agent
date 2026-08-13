import { eq } from "drizzle-orm";
import { schema } from "@puno/shared";
import { db } from "../db/client.js";
import { computeDivergence } from "./replay.js";
import { DecisionOutputSchema } from "../llm/schemas.js";

/// Plan Верификация → "Замер расхождения Haiku / Opus — критерий выхода из
/// фазы 3". Reads whatever purpose='comparison' rows the worker has written
/// (see tick.ts's sampled replay call) and reports the divergence rate that
/// decides whether plan 3.3.1's Opus trial mechanism gets built in Phase 5.
async function main() {
  const comparisons = await db
    .select()
    .from(schema.modelCalls)
    .where(eq(schema.modelCalls.purpose, "comparison"));

  if (comparisons.length === 0) {
    console.log(
      "No comparison model_calls found yet — run the worker (COMPARISON_SAMPLE_RATE > 0, the default) until at least one L2 decision has fired, then re-run this report.",
    );
    return;
  }

  let divergent = 0;
  let actionDiffCount = 0;
  let totalReplayCost = 0;
  let counted = 0;
  const lines: string[] = [];

  for (const cmp of comparisons) {
    if (!cmp.replayOf) continue;
    const [original] = await db
      .select()
      .from(schema.modelCalls)
      .where(eq(schema.modelCalls.id, cmp.replayOf))
      .limit(1);
    if (!original) continue;

    const originalParsed = DecisionOutputSchema.safeParse(
      (original.outputPayload as { parsed?: unknown } | null)?.parsed,
    );
    const replayParsed = DecisionOutputSchema.safeParse(
      (cmp.outputPayload as { parsed?: unknown } | null)?.parsed,
    );
    if (!originalParsed.success || !replayParsed.success) continue;

    const div = computeDivergence(originalParsed.data, replayParsed.data);
    counted++;
    if (div.isDivergent) divergent++;
    if (div.actionDiffers) actionDiffCount++;
    totalReplayCost += Number(cmp.costUsd);

    const o = originalParsed.data;
    const r = replayParsed.data;
    lines.push(
      `${div.isDivergent ? "DIVERGENT" : "agree    "}  action ${o.action}->${r.action}  ` +
        `sizePct ${o.sizePct.toFixed(1)}->${r.sizePct.toFixed(1)}  ` +
        `confidence ${o.confidence.toFixed(2)}->${r.confidence.toFixed(2)}`,
    );
  }

  console.log(`Haiku/Opus divergence report — ${counted} comparison(s)\n`);
  for (const line of lines) console.log(line);
  console.log("");

  if (counted > 0) {
    const pct = (divergent / counted) * 100;
    console.log(`Divergent: ${divergent}/${counted} (${pct.toFixed(1)}%)`);
    console.log(
      `Action differs: ${actionDiffCount}/${counted} (${((actionDiffCount / counted) * 100).toFixed(1)}%)`,
    );
    console.log(
      `Avg replay cost: $${(totalReplayCost / counted).toFixed(5)} (plan estimate: ~$0.045)`,
    );
    console.log("");
    console.log(
      pct >= 15
        ? "Result: >= ~15% — per plan 2.3/3.3.1, the Opus trial mechanism is justified by this measurement."
        : "Result: < ~15% — per plan 2.3/3.3.1, do NOT build the Opus trial mechanism; Haiku is sufficient for this task class, and tier segmentation should shift from model access to agent count / decision frequency / mainnet access.",
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
