import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PRICES_USD,
  decisionsRemaining,
  tokensToUsd,
  usdToTokens,
  formatTokens,
  formatTokensCompact,
  MIN_DEPOSIT_USD,
} from "./pricing.js";

/**
 * These two functions convert between what a user sends and what we credit
 * them, so an error here is an error in someone's balance. The cases below are
 * the ones where the naive float implementation is wrong: amounts past
 * Number.MAX_SAFE_INTEGER, and rounding that lands a quote just under a
 * threshold the contract enforces.
 */
describe("tokensToUsd", () => {
  it("converts a whole-token amount at a whole-dollar price", () => {
    assert.equal(tokensToUsd(100n * 10n ** 18n, 2, 18), 200);
  });

  it("handles a token cheaper than a cent", () => {
    assert.equal(tokensToUsd(1_000_000n * 10n ** 18n, 0.004, 18), 4000);
  });

  it("respects non-18 decimals", () => {
    assert.equal(tokensToUsd(500n * 10n ** 6n, 3, 6), 1500);
  });

  it("keeps precision past Number.MAX_SAFE_INTEGER", () => {
    // 10 million tokens at 18 decimals is 1e25 raw — a float conversion of the
    // raw value alone is already lossy well before this.
    const raw = 10_000_000n * 10n ** 18n;
    assert.equal(tokensToUsd(raw, 1, 18), 10_000_000);
  });

  it("returns zero for zero and negative", () => {
    assert.equal(tokensToUsd(0n, 5, 18), 0);
    assert.equal(tokensToUsd(-1n, 5, 18), 0);
  });
});

describe("usdToTokens", () => {
  it("inverts a whole-dollar conversion", () => {
    assert.equal(usdToTokens(200, 2, 18), 100n * 10n ** 18n);
  });

  it("respects non-18 decimals", () => {
    assert.equal(usdToTokens(1500, 3, 6), 500n * 10n ** 6n);
  });

  it("never quotes less than the requested value", () => {
    // A price that does not divide evenly is where truncation would bite: the
    // quote must cover the dollar amount, not fall a wei short of it.
    for (const price of [0.003, 0.0007, 1 / 3, 7.77]) {
      for (const usd of [MIN_DEPOSIT_USD, 29, 0.5, 123.45]) {
        const raw = usdToTokens(usd, price, 18);
        assert.ok(
          tokensToUsd(raw, price, 18) >= usd - 1e-9,
          `quote for $${usd} at ${price} came back short`,
        );
      }
    }
  });

  it("throws rather than dividing by a zero or missing price", () => {
    assert.throws(() => usdToTokens(10, 0, 18), /positive/);
    assert.throws(() => usdToTokens(10, -1, 18), /positive/);
    assert.throws(() => usdToTokens(10, Number.NaN, 18), /positive/);
  });

  it("returns zero for zero", () => {
    assert.equal(usdToTokens(0, 5, 18), 0n);
  });
});

describe("decisionsRemaining", () => {
  it("floors — a partial decision is not a decision", () => {
    assert.equal(decisionsRemaining(PRICES_USD.decision * 3 + 0.4), 3);
  });

  it("is zero at or below an empty balance", () => {
    assert.equal(decisionsRemaining(0), 0);
    assert.equal(decisionsRemaining(-5), 0);
    assert.equal(decisionsRemaining(PRICES_USD.decision - 0.01), 0);
  });
});

/**
 * Prices are quoted in PUNO on both the product and the marketing site, which
 * is why these live in shared: two formatters would eventually render the same
 * price differently on two pages describing it.
 */
describe("formatTokens", () => {
  const raw = (whole: number, decimals = 18) => BigInt(whole) * 10n ** BigInt(decimals);

  it("groups thousands, because PUNO amounts are large by construction", () => {
    assert.equal(formatTokens(raw(125_000), 18), "125,000");
  });

  it("stays exact past Number.MAX_SAFE_INTEGER", () => {
    // A raw 18-decimal amount passes that at about 0.01 tokens, so any
    // implementation that divides to a float before formatting is wrong for
    // every real value.
    //
    // The whole count must be a bigint literal: written as a number,
    // 9_007_199_254_740_993 is rounded to ...992 before BigInt ever sees it,
    // which is the very failure this is checking for.
    const beyondExactFloats = 9_007_199_254_740_993n;
    assert.equal(formatTokens(beyondExactFloats * 10n ** 18n, 18), "9,007,199,254,740,993");
  });

  it("drops the fraction unless asked", () => {
    assert.equal(formatTokens(raw(1) + 5n * 10n ** 17n, 18), "1");
    assert.equal(formatTokens(raw(1) + 5n * 10n ** 17n, 18, 2), "1.5");
  });

  it("honours a non-18-decimal token", () => {
    assert.equal(formatTokens(raw(1_250, 6), 6), "1,250");
  });
});

describe("formatTokensCompact", () => {
  const raw = (whole: number) => BigInt(whole) * 10n ** 18n;

  it("shortens what would overflow a chip", () => {
    // The three top-up presets at the launch rate: 12,500 / 50,000 / 125,000.
    assert.equal(formatTokensCompact(raw(12_500), 18), "12.5K");
    assert.equal(formatTokensCompact(raw(50_000), 18), "50K");
    assert.equal(formatTokensCompact(raw(125_000), 18), "125K");
  });

  it("leaves four-digit amounts alone, where grouping already fits", () => {
    assert.equal(formatTokensCompact(raw(1_250), 18), "1,250");
    assert.equal(formatTokensCompact(raw(625), 18), "625");
  });

  it("goes to millions rather than printing five digits of thousands", () => {
    assert.equal(formatTokensCompact(raw(2_000_000), 18), "2M");
    assert.equal(formatTokensCompact(raw(1_250_000), 18), "1.3M");
  });
});
