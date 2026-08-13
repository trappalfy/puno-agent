import type { Address } from "viem";
import { usd1e18ToNumber } from "../chain/money.js";
import type { TokenPosition } from "./portfolio.js";
import type { MarketPrice } from "./market.js";

export interface ProtectInput {
  positions: TokenPosition[];
  prices: MarketPrice[];
  // token (lowercased) -> entry price in USD per whole token, from
  // positions.entryPriceUsd. Absent for tokens the agent never bought
  // (e.g. the quote token, or a position opened before tracking existed).
  entryPricesUsd: ReadonlyMap<string, number>;
  quoteToken: Address;
  stopLossBps: number | null;
  takeProfitBps: number | null;
}

export interface ProtectBreach {
  token: Address;
  symbol: string;
  reason: "stop_loss" | "take_profit";
  entryPriceUsd: number;
  currentPriceUsd: number;
  pctChange: number;
  rawBalance: bigint;
}

/// Pure and synchronous by design: this is the one piece of the loop that
/// MUST run every tick regardless of LLM availability (plan 2.3 step 4 —
/// "обязан работать всегда"), so it has to be trivially unit-testable without
/// a live chain or a mocked Anthropic client. Only compares numbers; the
/// caller (tick.ts) is responsible for turning a breach into a real trade via
/// risk.ts -> simulate.ts -> execute.ts, same as any L2-originated decision.
export function protect(input: ProtectInput): ProtectBreach[] {
  const { positions, prices, entryPricesUsd, quoteToken, stopLossBps, takeProfitBps } = input;
  if (!stopLossBps && !takeProfitBps) return [];

  const priceByToken = new Map(prices.map((p) => [p.token.toLowerCase(), p]));
  const breaches: ProtectBreach[] = [];

  for (const position of positions) {
    if (position.token.toLowerCase() === quoteToken.toLowerCase()) continue;
    if (position.rawBalance === 0n) continue;

    const price = priceByToken.get(position.token.toLowerCase());
    if (!price || price.stale) continue; // never act on a stale/missing price

    const entryPriceUsd = entryPricesUsd.get(position.token.toLowerCase());
    if (entryPriceUsd === undefined || entryPriceUsd <= 0) continue; // no cost basis recorded yet

    const currentPriceUsd = usd1e18ToNumber(price.priceUsd1e18);
    const pctChange = (currentPriceUsd - entryPriceUsd) / entryPriceUsd;

    if (stopLossBps && pctChange <= -stopLossBps / 10_000) {
      breaches.push({
        token: position.token,
        symbol: position.symbol,
        reason: "stop_loss",
        entryPriceUsd,
        currentPriceUsd,
        pctChange,
        rawBalance: position.rawBalance,
      });
    } else if (takeProfitBps && pctChange >= takeProfitBps / 10_000) {
      breaches.push({
        token: position.token,
        symbol: position.symbol,
        reason: "take_profit",
        entryPriceUsd,
        currentPriceUsd,
        pctChange,
        rawBalance: position.rawBalance,
      });
    }
  }

  return breaches;
}
