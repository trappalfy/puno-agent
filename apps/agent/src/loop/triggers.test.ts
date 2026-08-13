import test from "node:test";
import assert from "node:assert/strict";
import type { Address } from "viem";
import { evaluateTriggers, type TriggerInput } from "./triggers.js";
import type { MarketPrice } from "./market.js";

const QUOTE = "0x000000000000000000000000000000000000aa" as Address;
const STOCK = "0x000000000000000000000000000000000000bb" as Address;

function basePrices(overrides: Partial<MarketPrice> = {}): MarketPrice[] {
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
      ...overrides,
    },
  ];
}

const NOW = new Date("2026-01-01T12:00:00Z");

function baseInput(overrides: Partial<TriggerInput> = {}): TriggerInput {
  return {
    prices: basePrices(),
    lastReviewedPricesUsd: new Map([[STOCK.toLowerCase(), 250]]),
    hasOpenPositions: false,
    lastL1CallAt: new Date(NOW.getTime() - 60 * 60 * 1000), // 1h ago
    now: NOW,
    quoteBalanceRaw: 10_000n * 10n ** 6n,
    prevQuoteBalanceRaw: 10_000n * 10n ** 6n,
    quoteDecimals: 6,
    quotePriceUsd1e18: 1n * 10n ** 18n,
    priceMoveTriggerBps: 300, // 3%
    maxReviewIntervalHours: 24,
    minFreedQuoteUsd: 50,
    ...overrides,
  };
}

test("triggers on the very first tick (no prior L1 call)", () => {
  const result = evaluateTriggers(baseInput({ lastL1CallAt: null }));
  assert.equal(result.shouldTrigger, true);
  assert.ok(result.reasons.some((r) => r.startsWith("first_tick_ever")));
});

test("does not trigger when nothing material changed", () => {
  const result = evaluateTriggers(baseInput());
  assert.equal(result.shouldTrigger, false);
  assert.deepEqual(result.reasons, []);
});

test("triggers when price has moved beyond the threshold", () => {
  const prices = basePrices({ priceUsd1e18: 260n * 10n ** 18n }); // 250 -> 260, 4%
  const result = evaluateTriggers(baseInput({ prices }));
  assert.equal(result.shouldTrigger, true);
  assert.ok(result.reasons.some((r) => r.startsWith("price_moved")));
});

test("does not trigger on a price move within the threshold", () => {
  const prices = basePrices({ priceUsd1e18: 252n * 10n ** 18n }); // 250 -> 252, 0.8%
  const result = evaluateTriggers(baseInput({ prices }));
  assert.equal(result.shouldTrigger, false);
});

test("ignores price moves on a stale feed", () => {
  const prices = basePrices({ priceUsd1e18: 500n * 10n ** 18n, stale: true }); // huge move, but stale
  const result = evaluateTriggers(baseInput({ prices }));
  assert.equal(result.shouldTrigger, false);
});

test("triggers on the scheduled review interval", () => {
  const result = evaluateTriggers(
    baseInput({
      lastL1CallAt: new Date(NOW.getTime() - 25 * 60 * 60 * 1000),
      maxReviewIntervalHours: 24,
    }),
  );
  assert.equal(result.shouldTrigger, true);
  assert.ok(result.reasons.some((r) => r.startsWith("scheduled_review")));
});

test("triggers when quote balance freed up above the minimum", () => {
  const result = evaluateTriggers(
    baseInput({
      prevQuoteBalanceRaw: 9_000n * 10n ** 6n,
      quoteBalanceRaw: 9_100n * 10n ** 6n, // +$100, above the $50 minimum
    }),
  );
  assert.equal(result.shouldTrigger, true);
  assert.ok(result.reasons.some((r) => r.startsWith("quote_freed")));
});

test("does not trigger on a freed-quote amount below the minimum", () => {
  const result = evaluateTriggers(
    baseInput({
      prevQuoteBalanceRaw: 9_000n * 10n ** 6n,
      quoteBalanceRaw: 9_010n * 10n ** 6n, // +$10, below the $50 minimum
    }),
  );
  assert.equal(result.shouldTrigger, false);
});

test("does not trigger on a quote balance decrease", () => {
  const result = evaluateTriggers(
    baseInput({
      prevQuoteBalanceRaw: 9_000n * 10n ** 6n,
      quoteBalanceRaw: 8_000n * 10n ** 6n,
    }),
  );
  assert.equal(result.shouldTrigger, false);
});
