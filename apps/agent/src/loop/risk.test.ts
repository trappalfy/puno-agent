import test from "node:test";
import assert from "node:assert/strict";
import type { Address } from "viem";
import { assessRisk } from "./risk.js";
import type { VaultPolicy } from "../chain/vault.js";
import type { Portfolio } from "./portfolio.js";
import type { MarketPrice } from "./market.js";
import type { DecisionOutput } from "../llm/schemas.js";

const QUOTE = "0x000000000000000000000000000000000000aa" as Address;
const STOCK = "0x000000000000000000000000000000000000bb" as Address;
const ROUTER = "0x000000000000000000000000000000000000cc" as Address;

function basePolicy(overrides: Partial<VaultPolicy> = {}): VaultPolicy {
  return {
    maxNotionalPerTrade: 5_000n * 10n ** 18n,
    maxDailyNotional: 10_000n * 10n ** 18n,
    maxPositionBps: 8_000n,
    minSecondsBetweenTrades: 60n,
    maxSlippageBps: 100n,
    lastTradeTimestamp: 0n,
    allowedTokens: [QUOTE, STOCK],
    allowedRouters: [ROUTER],
    ...overrides,
  };
}

function basePrices(): MarketPrice[] {
  return [
    {
      token: QUOTE,
      symbol: "USDG",
      decimals: 6,
      priceUsd1e18: 1n * 10n ** 18n,
      updatedAt: 0n,
      stale: false,
    },
    {
      token: STOCK,
      symbol: "TSLA",
      decimals: 18,
      priceUsd1e18: 250n * 10n ** 18n,
      updatedAt: 0n,
      stale: false,
    },
  ];
}

function basePortfolio(overrides: Partial<Portfolio> = {}): Portfolio {
  return {
    navUsd1e18: 10_000n * 10n ** 18n,
    navError: null,
    quoteToken: QUOTE,
    quoteBalance: 10_000n * 10n ** 6n,
    positions: [
      {
        token: QUOTE,
        symbol: "USDG",
        decimals: 6,
        rawBalance: 10_000n * 10n ** 6n,
        valueUsd1e18: 10_000n * 10n ** 18n,
        stalePrice: false,
      },
      {
        token: STOCK,
        symbol: "TSLA",
        decimals: 18,
        rawBalance: 0n,
        valueUsd1e18: 0n,
        stalePrice: false,
      },
    ],
    ...overrides,
  };
}

function baseDecision(overrides: Partial<DecisionOutput> = {}): DecisionOutput {
  return {
    action: "buy",
    ticker: "TSLA",
    sizePct: 10,
    confidence: 0.8,
    thesis: "test",
    riskFlags: [],
    ...overrides,
  };
}

const NOW = 1_000_000n;

test("hold is always accepted with no trade constructed", () => {
  const result = assessRisk({
    decision: baseDecision({ action: "hold" }),
    policy: basePolicy(),
    portfolio: basePortfolio(),
    prices: basePrices(),
    quoteToken: QUOTE,
    quoteDecimals: 6,
    nowSec: NOW,
  });
  assert.equal(result.verdict, "accepted");
  assert.equal(result.verdict === "accepted" ? result.trade : "n/a", null);
});

test("rejects when NAV is unavailable (a stale feed would revert on-chain nav())", () => {
  const result = assessRisk({
    decision: baseDecision(),
    policy: basePolicy(),
    portfolio: basePortfolio({ navUsd1e18: null, navError: "stale price" }),
    prices: basePrices(),
    quoteToken: QUOTE,
    quoteDecimals: 6,
    nowSec: NOW,
  });
  assert.equal(result.verdict, "rejected");
});

test("rejects an unknown ticker", () => {
  const result = assessRisk({
    decision: baseDecision({ ticker: "AAPL" }),
    policy: basePolicy(),
    portfolio: basePortfolio(),
    prices: basePrices(),
    quoteToken: QUOTE,
    quoteDecimals: 6,
    nowSec: NOW,
  });
  assert.equal(result.verdict, "rejected");
});

test("rejects a token not in the vault's allowlist", () => {
  const result = assessRisk({
    decision: baseDecision(),
    policy: basePolicy({ allowedTokens: [QUOTE] }), // TSLA removed
    portfolio: basePortfolio(),
    prices: basePrices(),
    quoteToken: QUOTE,
    quoteDecimals: 6,
    nowSec: NOW,
  });
  assert.equal(result.verdict, "rejected");
});

test("rejects a stale ticker price", () => {
  const prices = basePrices();
  prices[1]!.stale = true;
  const result = assessRisk({
    decision: baseDecision(),
    policy: basePolicy(),
    portfolio: basePortfolio(),
    prices,
    quoteToken: QUOTE,
    quoteDecimals: 6,
    nowSec: NOW,
  });
  assert.equal(result.verdict, "rejected");
});

test("rejects while the on-chain cooldown has not elapsed", () => {
  const result = assessRisk({
    decision: baseDecision(),
    policy: basePolicy({ lastTradeTimestamp: NOW - 10n, minSecondsBetweenTrades: 60n }),
    portfolio: basePortfolio(),
    prices: basePrices(),
    quoteToken: QUOTE,
    quoteDecimals: 6,
    nowSec: NOW,
  });
  assert.equal(result.verdict, "rejected");
});

test("rejects a non-positive sizePct", () => {
  const result = assessRisk({
    decision: baseDecision({ sizePct: 0 }),
    policy: basePolicy(),
    portfolio: basePortfolio(),
    prices: basePrices(),
    quoteToken: QUOTE,
    quoteDecimals: 6,
    nowSec: NOW,
  });
  assert.equal(result.verdict, "rejected");
});

test("rejects a sell with zero balance of the source token", () => {
  const result = assessRisk({
    decision: baseDecision({ action: "sell", ticker: "TSLA", sizePct: 50 }),
    policy: basePolicy(),
    portfolio: basePortfolio(), // TSLA balance is 0
    prices: basePrices(),
    quoteToken: QUOTE,
    quoteDecimals: 6,
    nowSec: NOW,
  });
  assert.equal(result.verdict, "rejected");
});

test("rejects when notional exceeds the per-trade cap", () => {
  const result = assessRisk({
    decision: baseDecision({ sizePct: 100 }), // 100% of 10,000 USDG = $10,000
    policy: basePolicy({ maxNotionalPerTrade: 100n * 10n ** 18n }), // $100 cap
    portfolio: basePortfolio(),
    prices: basePrices(),
    quoteToken: QUOTE,
    quoteDecimals: 6,
    nowSec: NOW,
  });
  assert.equal(result.verdict, "rejected");
});

test("rejects when the estimated post-trade position share exceeds the cap", () => {
  // Buying exactly $5,000 (the default per-trade cap, so that check passes)
  // against a 10% position-share cap on a $10,000 NAV ($1,000 max) must
  // still be rejected by the position-share check specifically.
  const result = assessRisk({
    decision: baseDecision({ sizePct: 50 }), // 50% of 10,000 USDG = $5,000
    policy: basePolicy({ maxPositionBps: 1_000n }), // 10%
    portfolio: basePortfolio(),
    prices: basePrices(),
    quoteToken: QUOTE,
    quoteDecimals: 6,
    nowSec: NOW,
  });
  assert.equal(result.verdict, "rejected");
});

test("accepts a valid buy and computes exact trade amounts", () => {
  const result = assessRisk({
    decision: baseDecision({ action: "buy", ticker: "TSLA", sizePct: 10 }), // 10% of 10,000 USDG
    policy: basePolicy(),
    portfolio: basePortfolio(),
    prices: basePrices(),
    quoteToken: QUOTE,
    quoteDecimals: 6,
    nowSec: NOW,
  });
  assert.equal(result.verdict, "accepted");
  if (result.verdict !== "accepted" || !result.trade) throw new Error("expected a trade");
  const { trade } = result;

  assert.equal(trade.tokenIn, QUOTE);
  assert.equal(trade.tokenOut, STOCK);
  assert.equal(trade.router, ROUTER);
  assert.equal(trade.amountIn, 1_000n * 10n ** 6n); // 1,000 USDG
  assert.equal(trade.notionalUsd1e18, 1_000n * 10n ** 18n); // $1,000
  assert.equal(trade.amountOut, 4n * 10n ** 18n); // $1,000 / $250 = 4 TSLA
  assert.equal(trade.minOut, (4n * 10n ** 18n * 9_900n) / 10_000n); // 1% slippage floor
});

test("accepts a valid sell and computes exact trade amounts", () => {
  const portfolio = basePortfolio({
    quoteBalance: 5_000n * 10n ** 6n,
    positions: [
      {
        token: QUOTE,
        symbol: "USDG",
        decimals: 6,
        rawBalance: 5_000n * 10n ** 6n,
        valueUsd1e18: 5_000n * 10n ** 18n,
        stalePrice: false,
      },
      {
        token: STOCK,
        symbol: "TSLA",
        decimals: 18,
        rawBalance: 20n * 10n ** 18n,
        valueUsd1e18: 5_000n * 10n ** 18n,
        stalePrice: false,
      },
    ],
  });

  const result = assessRisk({
    decision: baseDecision({ action: "sell", ticker: "TSLA", sizePct: 50 }), // sell 10 of 20 TSLA
    policy: basePolicy(),
    portfolio,
    prices: basePrices(),
    quoteToken: QUOTE,
    quoteDecimals: 6,
    nowSec: NOW,
  });
  assert.equal(result.verdict, "accepted");
  if (result.verdict !== "accepted" || !result.trade) throw new Error("expected a trade");
  const { trade } = result;

  assert.equal(trade.tokenIn, STOCK);
  assert.equal(trade.tokenOut, QUOTE);
  assert.equal(trade.amountIn, 10n * 10n ** 18n); // 10 TSLA
  assert.equal(trade.notionalUsd1e18, 2_500n * 10n ** 18n); // $2,500
  assert.equal(trade.amountOut, 2_500n * 10n ** 6n); // 2,500 USDG
  assert.ok(trade.minOut < trade.amountOut);
});
