import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveTokenPrice,
  rateStalenessWarning,
  TokenPriceUnavailableError,
  MAX_OVERRIDE_AGE_MS,
  MAX_DISPLAY_AGE_MS,
  OVERRIDE_WARNING_AGE_MS,
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

/**
 * The two windows exist because the cost of being wrong is not the same on the
 * two paths: crediting at a drifted rate mis-prices real money, while refusing
 * to *display* one only blanks the public pricing page. These tests pin the
 * asymmetry — without them the natural "simplification" is to collapse the two
 * back into one constant, which silently re-couples them.
 */
describe("resolveTokenPrice — crediting window vs display window", () => {
  const betweenTheWindows = new Date(now.getTime() - MAX_OVERRIDE_AGE_MS - 60_000);

  it("is the whole point: display accepts what crediting refuses", () => {
    assert.throws(
      () =>
        resolveTokenPrice({ twap: null, override: { priceUsd: 0.1, at: betweenTheWindows }, now }),
      TokenPriceUnavailableError,
      "the money path must refuse a rate this old",
    );

    const shown = resolveTokenPrice({
      twap: null,
      override: { priceUsd: 0.1, at: betweenTheWindows },
      now,
      maxOverrideAgeMs: MAX_DISPLAY_AGE_MS,
    });
    assert.equal(shown.priceUsd, 0.1);
  });

  it("marks a display-only rate as not usable for credit", () => {
    // The flag is what stops the top-up card quoting "send this much for $5"
    // off a rate the indexer would decline to credit at.
    const shown = resolveTokenPrice({
      twap: null,
      override: { priceUsd: 0.1, at: betweenTheWindows },
      now,
      maxOverrideAgeMs: MAX_DISPLAY_AGE_MS,
    });
    assert.equal(shown.usableForCredit, false);
  });

  it("marks a fresh rate as usable for credit, on either window", () => {
    for (const maxOverrideAgeMs of [undefined, MAX_DISPLAY_AGE_MS]) {
      const price = resolveTokenPrice({
        twap: null,
        override: { priceUsd: 0.1, at: fresh },
        now,
        maxOverrideAgeMs,
      });
      assert.equal(price.usableForCredit, true, `window ${maxOverrideAgeMs}`);
    }
  });

  it("still refuses a rate past the display window", () => {
    const ancient = new Date(now.getTime() - MAX_DISPLAY_AGE_MS - 60_000);
    assert.throws(
      () =>
        resolveTokenPrice({
          twap: null,
          override: { priceUsd: 0.1, at: ancient },
          now,
          maxOverrideAgeMs: MAX_DISPLAY_AGE_MS,
        }),
      TokenPriceUnavailableError,
    );
  });

  it("defaults to the strict window when the caller says nothing", () => {
    // A caller that has not thought about staleness gets the answer that
    // protects money, not the permissive one.
    assert.ok(MAX_OVERRIDE_AGE_MS < MAX_DISPLAY_AGE_MS, "the strict window must be the shorter");
    assert.throws(
      () =>
        resolveTokenPrice({ twap: null, override: { priceUsd: 0.1, at: betweenTheWindows }, now }),
      TokenPriceUnavailableError,
    );
  });

  it("reports a sub-two-day age in hours, not as '1 days'", () => {
    const stale = new Date(now.getTime() - 26 * 3_600_000);
    assert.throws(
      () => resolveTokenPrice({ twap: null, override: { priceUsd: 0.1, at: stale }, now }),
      /26 hours old \(max 24 hours\)/,
    );
  });

  it("treats a pool read as always usable for credit", () => {
    const price = resolveTokenPrice({
      twap: { priceUsd: 0.042, at: betweenTheWindows },
      override: null,
      now,
    });
    assert.equal(price.usableForCredit, true);
  });
});

/**
 * The warning exists because the expiry is knowable in advance and nothing else
 * in the system says so: the crediting path only mentions the rate at the
 * moment it has already failed to value someone's deposit. A week after launch,
 * in a quiet period, that failure is the first anyone would hear of it.
 */
describe("rateStalenessWarning", () => {
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("says nothing while the rate is comfortably fresh", () => {
    assert.equal(rateStalenessWarning({ priceUsd: 0.001, at: ago(60_000) }, now), null);
  });

  it("warns before the rate expires, not after", () => {
    const justInsideTheWarning = MAX_OVERRIDE_AGE_MS - OVERRIDE_WARNING_AGE_MS + 60_000;
    const warning = rateStalenessWarning({ priceUsd: 0.001, at: ago(justInsideTheWarning) }, now);
    assert.match(warning ?? "", /expires in/);
    // The whole value of the warning is the lead time — an alert that only
    // fires once crediting has already stopped is a report, not a warning.
    assert.doesNotMatch(warning ?? "", /expired/);
  });

  it("stays quiet on the far side of the warning threshold", () => {
    const justOutside = MAX_OVERRIDE_AGE_MS - OVERRIDE_WARNING_AGE_MS - 60_000;
    assert.equal(rateStalenessWarning({ priceUsd: 0.001, at: ago(justOutside) }, now), null);
  });

  it("reports an expired rate and what it means, not just that it is old", () => {
    const warning = rateStalenessWarning(
      { priceUsd: 0.001, at: ago(MAX_OVERRIDE_AGE_MS + 3 * 3_600_000) },
      now,
    );
    assert.match(warning ?? "", /expired 3 hours ago/);
    assert.match(warning ?? "", /NOT being credited/);
    // Deposits are safe, and saying so is what stops the reaction being panic.
    assert.match(warning ?? "", /replay/);
  });

  it("names the command when no rate has ever been set", () => {
    const warning = rateStalenessWarning(null, now);
    assert.match(warning ?? "", /set-rate/);
  });

  it("keeps the warning window shorter than the crediting window", () => {
    // If these ever cross, the "warning" fires only after crediting has already
    // stopped, and the lead time it exists to provide is gone.
    assert.ok(OVERRIDE_WARNING_AGE_MS < MAX_OVERRIDE_AGE_MS);
  });
});
