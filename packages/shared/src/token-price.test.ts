import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveTokenPrice,
  TokenPriceUnavailableError,
  MAX_OVERRIDE_AGE_MS,
} from "./token-price.js";

const now = new Date("2026-08-13T12:00:00.000Z");
const fresh = new Date(now.getTime() - 60_000);

/**
 * Every one of these is a way we could credit someone the wrong number of
 * dollars for real money they sent. The rule under test is that an unusable
 * rate must throw — never degrade into a plausible-looking default, because a
 * failed credit can be replayed from the chain and a wrong one cannot.
 */
describe("resolveTokenPrice", () => {
  it("prefers the pool over the manual rate", () => {
    const price = resolveTokenPrice({
      twap: { priceUsd: 0.042, at: fresh },
      override: { priceUsd: 0.1, at: fresh },
      now,
    });
    assert.equal(price.priceUsd, 0.042);
    assert.equal(price.source, "twap");
  });

  it("falls back to the manual rate when there is no pool", () => {
    const price = resolveTokenPrice({
      twap: null,
      override: { priceUsd: 0.1, at: fresh },
      now,
    });
    assert.equal(price.priceUsd, 0.1);
    assert.equal(price.source, "override");
  });

  it("throws when neither source exists", () => {
    assert.throws(
      () => resolveTokenPrice({ twap: null, override: null, now }),
      TokenPriceUnavailableError,
    );
  });

  it("rejects a manual rate past the staleness window", () => {
    const stale = new Date(now.getTime() - MAX_OVERRIDE_AGE_MS - 1000);
    assert.throws(
      () => resolveTokenPrice({ twap: null, override: { priceUsd: 0.1, at: stale }, now }),
      /stale rate/,
    );
  });

  it("accepts a manual rate right at the edge of the window", () => {
    const edge = new Date(now.getTime() - MAX_OVERRIDE_AGE_MS);
    const price = resolveTokenPrice({ twap: null, override: { priceUsd: 0.1, at: edge }, now });
    assert.equal(price.priceUsd, 0.1);
  });

  it("rejects non-positive and non-finite rates from either source", () => {
    for (const bad of [0, -1, Number.NaN]) {
      assert.throws(
        () => resolveTokenPrice({ twap: null, override: { priceUsd: bad, at: fresh }, now }),
        TokenPriceUnavailableError,
        `override ${bad} should be rejected`,
      );
      assert.throws(
        () => resolveTokenPrice({ twap: { priceUsd: bad, at: fresh }, override: null, now }),
        TokenPriceUnavailableError,
        `twap ${bad} should be rejected`,
      );
    }
  });

  it("does not let a broken pool silently fall through to the manual rate", () => {
    // A zero from the pool means the read is wrong, not that the token is
    // worthless — quietly substituting our own number would hide the fault.
    assert.throws(
      () =>
        resolveTokenPrice({
          twap: { priceUsd: 0, at: fresh },
          override: { priceUsd: 0.1, at: fresh },
          now,
        }),
      /Pool TWAP/,
    );
  });

  it("tolerates a manual rate stamped slightly in the future", () => {
    const skewed = new Date(now.getTime() + 30_000);
    const price = resolveTokenPrice({ twap: null, override: { priceUsd: 0.1, at: skewed }, now });
    assert.equal(price.priceUsd, 0.1);
  });
});
