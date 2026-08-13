import { and, eq, gte } from "drizzle-orm";
import {
  schema,
  chargeAccount,
  getBalance,
  PRICES_USD,
  type BillableEvent,
  type ChargeResult,
} from "@puno/shared";
import { db } from "../db/client.js";
import { evaluateBalance, evaluateRateLimit, type BudgetCheck } from "./gate.js";

export interface AccountBilling {
  balanceUsd: number;
  /// Account supplied its own Anthropic key, so we aren't paying for its model
  /// calls and don't charge for them. Trades are still billed — the gas and the
  /// execution path are ours either way.
  usesOwnKey: boolean;
}

export async function getAccountBilling(accountId: string): Promise<AccountBilling> {
  const [row] = await db
    .select({
      balance: schema.accounts.creditBalanceUsd,
      key: schema.accounts.anthropicApiKeyEncrypted,
    })
    .from(schema.accounts)
    .where(eq(schema.accounts.id, accountId))
    .limit(1);

  return {
    balanceUsd: row ? Number(row.balance) : 0,
    usesOwnKey: !!row?.key,
  };
}

/// What this account is actually charged for `event`, after the BYOK waiver.
export function priceFor(event: BillableEvent, billing: AccountBilling): number {
  if (billing.usesOwnKey && event !== "trade") return 0;
  return PRICES_USD[event];
}

/// Pre-call gate. Reads the balance fresh rather than trusting the value
/// carried in `billing`, because earlier charges in the same tick have already
/// moved it.
export async function checkBalanceBeforeCall(
  accountId: string,
  priceUsd: number,
): Promise<BudgetCheck> {
  if (priceUsd === 0) return { allowed: true, reason: null };
  const balanceUsd = await getBalance(db, accountId);
  return evaluateBalance(balanceUsd, priceUsd);
}

export async function checkRateLimitBeforeCall(
  agentId: string,
  maxCallsPerHour: number,
): Promise<BudgetCheck> {
  const oneHourAgo = new Date(Date.now() - 3_600_000);
  const rows = await db
    .select({ id: schema.modelCalls.id })
    .from(schema.modelCalls)
    .where(
      and(eq(schema.modelCalls.agentId, agentId), gte(schema.modelCalls.createdAt, oneHourAgo)),
    );
  return evaluateRateLimit(rows.length, maxCallsPerHour);
}

/// Called AFTER the billable thing happened, keyed to the row that records it.
///
/// The key matters: `refId` makes the charge idempotent, so a tick that crashes
/// between the model call and the charge can be retried without billing twice.
/// Note this debits the *price*, not our cost — `modelCalls.costUsd` still
/// carries what the call cost us, and keeping the two apart is what makes the
/// margin measurable.
export async function chargeForEvent(params: {
  accountId: string;
  event: BillableEvent;
  billing: AccountBilling;
  refType: "model_call" | "trade";
  refId: string;
}): Promise<ChargeResult> {
  const amountUsd = priceFor(params.event, params.billing);
  return chargeAccount(db, {
    accountId: params.accountId,
    amountUsd,
    event: params.event,
    refType: params.refType,
    refId: params.refId,
    // A settled trade is a debt, not a purchase decision: the swap is already
    // on-chain and the gas is already spent, so it gets recorded even if it
    // takes the balance below zero. Model calls are gated beforehand and never
    // need this.
    allowNegative: params.event === "trade",
  });
}
