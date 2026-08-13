import { usd1e18ToNumber } from "../chain/money.js";
import type { MarketPrice } from "./market.js";

export interface TriggerInput {
  prices: MarketPrice[];
  // token (lowercased) -> price USD/token the last time L1 looked at it.
  // Empty on the very first tick, which is itself a reason to trigger once.
  lastReviewedPricesUsd: ReadonlyMap<string, number>;
  hasOpenPositions: boolean;
  lastL1CallAt: Date | null;
  now: Date;
  quoteBalanceRaw: bigint;
  prevQuoteBalanceRaw: bigint | null;
  quoteDecimals: number;
  quotePriceUsd1e18: bigint;
  priceMoveTriggerBps: number;
  maxReviewIntervalHours: number;
  minFreedQuoteUsd: number;
}

export interface TriggerResult {
  shouldTrigger: boolean;
  reasons: string[];
}

/// Pure decision function — plan 2.3 step 5. This is the dedup/cost gate: L0
/// runs every tick for free, but waking L1 costs real money, so triggering
/// "sometimes" isn't a shortcut, it's the entire reason the three-level
/// architecture is affordable (plan 3.1 — 600 triggers/mo vs. ~2,600-8,600
/// ticks/mo at a 10-30s cadence).
export function evaluateTriggers(input: TriggerInput): TriggerResult {
  const reasons: string[] = [];

  if (input.lastL1CallAt === null) {
    reasons.push("first_tick_ever");
  }

  for (const price of input.prices) {
    if (price.stale) continue;
    const last = input.lastReviewedPricesUsd.get(price.token.toLowerCase());
    if (last === undefined || last <= 0) continue;
    const current = usd1e18ToNumber(price.priceUsd1e18);
    const pctMove = Math.abs(current - last) / last;
    if (pctMove >= input.priceMoveTriggerBps / 10_000) {
      reasons.push(`price_moved:${price.symbol}:${(pctMove * 100).toFixed(2)}%`);
    }
  }

  if (input.lastL1CallAt !== null) {
    const hoursSince = (input.now.getTime() - input.lastL1CallAt.getTime()) / 3_600_000;
    if (hoursSince >= input.maxReviewIntervalHours) {
      reasons.push(`scheduled_review:${hoursSince.toFixed(1)}h`);
    }
  }

  if (input.prevQuoteBalanceRaw !== null && input.quoteBalanceRaw > input.prevQuoteBalanceRaw) {
    const freedRaw = input.quoteBalanceRaw - input.prevQuoteBalanceRaw;
    const freedUsd = usd1e18ToNumber(
      (freedRaw * input.quotePriceUsd1e18) / 10n ** BigInt(input.quoteDecimals),
    );
    if (freedUsd >= input.minFreedQuoteUsd) {
      reasons.push(`quote_freed:$${freedUsd.toFixed(2)}`);
    }
  }

  return { shouldTrigger: reasons.length > 0, reasons };
}
