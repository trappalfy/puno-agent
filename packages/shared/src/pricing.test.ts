import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PRICES_USD,
  decisionsRemaining,
  tokensToUsd,
  usdToTokens,
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
