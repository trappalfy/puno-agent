import { and, eq } from "drizzle-orm";
import { formatUnits } from "viem";
import { schema } from "@puno/shared";
import { db } from "../db/client.js";
import type { ModelCallRecord } from "../llm/types.js";
import type { Portfolio } from "./portfolio.js";
import { usd1e18ToDecimalString, rawAmountToDecimalString } from "../chain/money.js";

export async function persistModelCall(
  record: ModelCallRecord,
  agentId: string | null,
  accountId: string | null,
): Promise<string> {
  const [row] = await db
    .insert(schema.modelCalls)
    .values({
      agentId,
      accountId,
      level: record.level,
      model: record.model,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      cacheReadInputTokens: record.cacheReadInputTokens,
      cacheCreationInputTokens: record.cacheCreationInputTokens,
      costUsd: record.costUsd.toFixed(6),
      latencyMs: record.latencyMs,
      inputPayload: record.inputPayload,
      outputPayload: record.outputPayload,
      replayOf: record.replayOf ?? null,
      purpose: record.purpose,
    })
    .returning({ id: schema.modelCalls.id });
  return row!.id;
}

export async function persistSignal(input: {
  agentId: string;
  triggerReasons: string[];
  marketSnapshot: unknown;
  escalate: boolean;
  reason: string;
  modelCallId: string | null;
}): Promise<string> {
  const [row] = await db
    .insert(schema.signals)
    .values({
      agentId: input.agentId,
      triggerReasons: input.triggerReasons,
      marketSnapshot: input.marketSnapshot,
      escalate: input.escalate,
      reason: input.reason,
      modelCallId: input.modelCallId,
    })
    .returning({ id: schema.signals.id });
  return row!.id;
}

export async function persistDecision(input: {
  agentId: string;
  signalId: string;
  action: "buy" | "sell" | "hold";
  ticker: string;
  sizePct: number;
  confidence: number;
  thesis: string;
  riskFlags: string[];
  riskVerdict: "accepted" | "rejected";
  riskReason: string | null;
  modelCallId: string | null;
}): Promise<string> {
  const [row] = await db
    .insert(schema.decisions)
    .values({
      agentId: input.agentId,
      signalId: input.signalId,
      action: input.action,
      ticker: input.ticker,
      sizePct: input.sizePct.toFixed(3),
      confidence: input.confidence.toFixed(4),
      thesis: input.thesis,
      riskFlags: input.riskFlags,
      riskVerdict: input.riskVerdict,
      riskReason: input.riskReason,
      modelCallId: input.modelCallId,
    })
    .returning({ id: schema.decisions.id });
  return row!.id;
}

export async function linkDecisionTrade(decisionId: string, tradeId: string): Promise<void> {
  await db.update(schema.decisions).set({ tradeId }).where(eq(schema.decisions.id, decisionId));
}

export async function persistTrade(input: {
  agentId: string;
  decisionId: string | null;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOut: bigint | null;
  minOut: bigint;
  router: string;
  notionalUsd1e18: bigint;
  status: "dry_run" | "simulated" | "pending" | "confirmed" | "failed" | "reverted";
  txHash: string | null;
  simulateError: string | null;
}): Promise<string> {
  const [row] = await db
    .insert(schema.trades)
    .values({
      agentId: input.agentId,
      decisionId: input.decisionId,
      tokenIn: input.tokenIn,
      tokenOut: input.tokenOut,
      amountIn: rawAmountToDecimalString(input.amountIn),
      amountOut: input.amountOut !== null ? rawAmountToDecimalString(input.amountOut) : null,
      minOut: rawAmountToDecimalString(input.minOut),
      router: input.router,
      notionalUsd: usd1e18ToDecimalString(input.notionalUsd1e18),
      status: input.status,
      txHash: input.txHash,
      simulateError: input.simulateError,
    })
    .returning({ id: schema.trades.id });
  return row!.id;
}

export async function upsertPositions(
  vaultId: string,
  positions: Portfolio["positions"],
): Promise<void> {
  for (const p of positions) {
    await db
      .insert(schema.positions)
      .values({
        vaultId,
        token: p.token,
        tokenSymbol: p.symbol,
        decimals: p.decimals,
        rawBalance: rawAmountToDecimalString(p.rawBalance),
        valueUsd: usd1e18ToDecimalString(p.valueUsd1e18),
      })
      .onConflictDoUpdate({
        target: [schema.positions.vaultId, schema.positions.token],
        set: {
          tokenSymbol: p.symbol,
          decimals: p.decimals,
          rawBalance: rawAmountToDecimalString(p.rawBalance),
          valueUsd: usd1e18ToDecimalString(p.valueUsd1e18),
          updatedAt: new Date(),
        },
      });
  }
}

/// Weighted-average cost basis, updated only for real fills (trade status
/// "confirmed" — a DRY_RUN or "simulated" trade changes nothing on-chain, so
/// the position snapshot won't move either; updating entry price for those
/// would fabricate a cost basis for a trade that never happened).
export async function updateEntryPriceOnBuyFill(input: {
  vaultId: string;
  token: string;
  symbol: string;
  boughtRaw: bigint;
  fillPriceUsd: number;
  decimals: number;
}): Promise<void> {
  const { vaultId, token, symbol, boughtRaw, fillPriceUsd, decimals } = input;

  const [existing] = await db
    .select()
    .from(schema.positions)
    .where(and(eq(schema.positions.vaultId, vaultId), eq(schema.positions.token, token)))
    .limit(1);

  const prevRaw = existing ? BigInt(existing.rawBalance) : 0n;
  const prevEntry = existing?.entryPriceUsd ? Number(existing.entryPriceUsd) : null;
  const prevCostUsd = prevEntry !== null ? prevEntry * Number(formatUnits(prevRaw, decimals)) : 0;
  const addedCostUsd = fillPriceUsd * Number(formatUnits(boughtRaw, decimals));
  const newRaw = prevRaw + boughtRaw;
  const newEntry =
    newRaw > 0n ? (prevCostUsd + addedCostUsd) / Number(formatUnits(newRaw, decimals)) : null;

  await db
    .insert(schema.positions)
    .values({
      vaultId,
      token,
      tokenSymbol: symbol,
      decimals,
      rawBalance: rawAmountToDecimalString(newRaw),
      valueUsd: "0",
      entryPriceUsd: newEntry !== null ? newEntry.toString() : null,
    })
    .onConflictDoUpdate({
      target: [schema.positions.vaultId, schema.positions.token],
      set: { entryPriceUsd: newEntry !== null ? newEntry.toString() : null, updatedAt: new Date() },
    });
}

export async function clearEntryPriceIfFlat(
  vaultId: string,
  token: string,
  remainingRaw: bigint,
): Promise<void> {
  if (remainingRaw > 0n) return;
  await db
    .update(schema.positions)
    .set({ entryPriceUsd: null })
    .where(and(eq(schema.positions.vaultId, vaultId), eq(schema.positions.token, token)));
}

export async function appendAuditLog(input: {
  agentId: string | null;
  actorType: "system" | "owner" | "agent" | "model";
  action: string;
  details?: unknown;
}): Promise<void> {
  await db.insert(schema.auditLog).values({
    agentId: input.agentId,
    actorType: input.actorType,
    action: input.action,
    details: input.details ?? null,
  });
}

type AgentStatus = (typeof schema.agentStatusEnum.enumValues)[number];

export async function touchAgentTick(
  agentId: string,
  fields: { status?: AgentStatus; actionTaken?: boolean },
): Promise<void> {
  const now = new Date();
  await db
    .update(schema.agents)
    .set({
      lastTickAt: now,
      updatedAt: now,
      ...(fields.status ? { status: fields.status } : {}),
      ...(fields.actionTaken ? { lastActionAt: now } : {}),
    })
    .where(eq(schema.agents.id, agentId));
}
