import test from "node:test";
import assert from "node:assert/strict";
import type { Address } from "viem";
import { protect, type ProtectInput } from "./protect.js";
import type { TokenPosition } from "./portfolio.js";
import type { MarketPrice } from "./market.js";

const QUOTE = "0x000000000000000000000000000000000000aa" as Address;
const STOCK = "0x000000000000000000000000000000000000bb" as Address;

function position(overrides: Partial<TokenPosition> = {}): TokenPosition {
  return {
    token: STOCK,
    symbol: "TSLA",
    decimals: 18,
    rawBalance: 10n * 10n ** 18n,
    valueUsd1e18: 2_500n * 10n ** 18n,
    stalePrice: false,
    ...overrides,
  };
}

function price(overrides: Partial<MarketPrice> = {}): MarketPrice {
  return {
    token: STOCK,
    symbol: "TSLA",
    decimals: 18,
    priceUsd1e18: 250n * 10n ** 18n,
    updatedAt: 0n,
    stale: false,
    ...overrides,
  };
}

function baseInput(overrides: Partial<ProtectInput> = {}): ProtectInput {
  return {
    positions: [position()],
    prices: [price()],
    entryPricesUsd: new Map([[STOCK.toLowerCase(), 250]]),
    quoteToken: QUOTE,
    stopLossBps: 1_000, // 10%
    takeProfitBps: 2_000, // 20%
    ...overrides,
  };
}

test("returns nothing when neither limit is configured", () => {
  const result = protect(baseInput({ stopLossBps: null, takeProfitBps: null }));
  assert.deepEqual(result, []);
});

test("returns nothing when price is within band", () => {
  const result = protect(baseInput({ prices: [price({ priceUsd1e18: 260n * 10n ** 18n })] })); // +4%
  assert.deepEqual(result, []);
});

test("flags a stop-loss breach", () => {
  const result = protect(baseInput({ prices: [price({ priceUsd1e18: 220n * 10n ** 18n })] })); // -12%
  assert.equal(result.length, 1);
  assert.equal(result[0]!.reason, "stop_loss");
  assert.ok(result[0]!.pctChange < -0.1);
});

test("flags a take-profit breach", () => {
  const result = protect(baseInput({ prices: [price({ priceUsd1e18: 310n * 10n ** 18n })] })); // +24%
  assert.equal(result.length, 1);
  assert.equal(result[0]!.reason, "take_profit");
});

test("ignores a position with zero balance", () => {
  const result = protect(
    baseInput({
      positions: [position({ rawBalance: 0n })],
      prices: [price({ priceUsd1e18: 220n * 10n ** 18n })],
    }),
  );
  assert.deepEqual(result, []);
});

test("ignores the quote token itself", () => {
  const result = protect(
    baseInput({
      positions: [position({ token: QUOTE, symbol: "USDG" })],
      prices: [price({ token: QUOTE, symbol: "USDG", priceUsd1e18: 1n * 10n ** 18n })],
      entryPricesUsd: new Map([[QUOTE.toLowerCase(), 1]]),
    }),
  );
  assert.deepEqual(result, []);
});

test("never acts on a stale price, even past the threshold", () => {
  const result = protect(
    baseInput({ prices: [price({ priceUsd1e18: 100n * 10n ** 18n, stale: true })] }),
  );
  assert.deepEqual(result, []);
});

test("does nothing without a recorded entry price", () => {
  const result = protect(
    baseInput({ entryPricesUsd: new Map(), prices: [price({ priceUsd1e18: 100n * 10n ** 18n })] }),
  );
  assert.deepEqual(result, []);
});
