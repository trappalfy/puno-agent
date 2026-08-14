import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { schema, decisionsRemaining } from "@puno/shared";
import { db } from "@/lib/db";
import { requireAccount } from "@/lib/auth";
import { checkTrialAvailability, latestTrialRun, TRIAL_COST_USD } from "@/lib/trial";

/// Everything the trial console needs in one poll: whether a run may be
/// started, what the in-flight one is doing, and what the last one produced.
///
/// Deliberately one endpoint rather than three. The console polls this every
/// second or two while a run is in flight, and three round trips per tick would
/// let the screening verdict, the decision and the trade arrive out of step —
/// the user would watch the panel contradict itself.
export async function GET() {
  const auth = await requireAccount();
  if (!auth.ok) return auth.response;
  const { account } = auth;

  const balanceUsd = Number(account.creditBalanceUsd);
  const availability = await checkTrialAvailability(account.id, balanceUsd);
  const run = await latestTrialRun(account.id);
  const { agentId } = availability;

  const signal = agentId
    ? (
        await db
          .select({
            escalate: schema.signals.escalate,
            reason: schema.signals.reason,
            triggerReasons: schema.signals.triggerReasons,
            createdAt: schema.signals.createdAt,
          })
          .from(schema.signals)
          .where(eq(schema.signals.agentId, agentId))
          .orderBy(desc(schema.signals.createdAt))
          .limit(1)
      )[0]
    : undefined;

  const decision = agentId
    ? (
        await db
          .select({
            action: schema.decisions.action,
            ticker: schema.decisions.ticker,
            sizePct: schema.decisions.sizePct,
            confidence: schema.decisions.confidence,
            thesis: schema.decisions.thesis,
            riskFlags: schema.decisions.riskFlags,
            riskVerdict: schema.decisions.riskVerdict,
            riskReason: schema.decisions.riskReason,
            createdAt: schema.decisions.createdAt,
          })
          .from(schema.decisions)
          .where(eq(schema.decisions.agentId, agentId))
          .orderBy(desc(schema.decisions.createdAt))
          .limit(1)
      )[0]
    : undefined;

  const trade = agentId
    ? (
        await db
          .select({
            status: schema.trades.status,
            tokenIn: schema.trades.tokenIn,
            tokenOut: schema.trades.tokenOut,
            amountIn: schema.trades.amountIn,
            minOut: schema.trades.minOut,
            simulateError: schema.trades.simulateError,
          })
          .from(schema.trades)
          .where(eq(schema.trades.agentId, agentId))
          .orderBy(desc(schema.trades.createdAt))
          .limit(1)
      )[0]
    : undefined;

  return NextResponse.json({
    canRun: availability.available,
    reason: availability.available ? null : availability.reason,
    costUsd: TRIAL_COST_USD,
    balanceUsd,
    decisionsRemaining: decisionsRemaining(balanceUsd),
    run: run
      ? { id: run.id, status: run.status, error: run.error, createdAt: run.createdAt }
      : null,
    // amountIn/minOut are numeric(78,0) and come back as strings. Left as
    // strings on purpose — they are raw token units and would lose precision
    // the moment anything parsed them as a JS number.
    signal: signal ?? null,
    decision: decision ?? null,
    trade: trade ?? null,
  });
}
