import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { classifyMarket, describeMarket, shouldSkipTick } from "./session.js";

const fresh = (symbol: string) => ({ symbol, stale: false });
const stale = (symbol: string) => ({ symbol, stale: true });

describe("classifyMarket", () => {
  test("all equity feeds current is an open market", () => {
    const s = classifyMarket({ quoteStale: false, equities: [fresh("AAPL"), fresh("TSLA")] });

    assert.equal(s.state, "open");
  });

  test("every equity stale while the quote is fine reads as a closed session", () => {
    // The exact shape measured on Saturday 2026-08-15: five equity feeds 25–30h
    // old, USDG four hours old. See EQUITY-FEED-HOURS-2026-08-15.md.
    const s = classifyMarket({
      quoteStale: false,
      equities: [stale("AAPL"), stale("TSLA"), stale("NVDA")],
    });

    assert.equal(s.state, "closed");
    assert.deepEqual(s.staleSymbols, ["AAPL", "TSLA", "NVDA"]);
  });

  test("everything stale is degraded, never closed", () => {
    // The distinction the whole module exists for. If the quote feed died too,
    // this is an oracle problem, and telling someone "market closed" would send
    // them to look at a clock instead of at the feeds.
    const s = classifyMarket({ quoteStale: true, equities: [stale("AAPL"), stale("TSLA")] });

    assert.equal(s.state, "degraded");
  });

  test("a single dead feed among healthy ones is degraded, not closed", () => {
    const s = classifyMarket({
      quoteStale: false,
      equities: [fresh("AAPL"), stale("TSLA"), fresh("NVDA")],
    });

    assert.equal(s.state, "degraded");
    assert.deepEqual(s.staleSymbols, ["TSLA"]);
    assert.deepEqual(s.freshSymbols, ["AAPL", "NVDA"]);
  });

  test("a vault with no equities is a configuration state, not a closed market", () => {
    const s = classifyMarket({ quoteStale: false, equities: [] });

    assert.equal(s.state, "no-equities");
  });
});

describe("shouldSkipTick", () => {
  test("skips a closed market before it costs a screening call", () => {
    // No decision the model could reach survives risk.ts here — _nav() reverts
    // on a stale feed. Charging for the screen would bill the user for our own
    // failure to look.
    assert.equal(
      shouldSkipTick(classifyMarket({ quoteStale: false, equities: [stale("AAPL")] })),
      true,
    );
  });

  test("skips a vault that allows no equities", () => {
    assert.equal(shouldSkipTick(classifyMarket({ quoteStale: false, equities: [] })), true);
  });

  test("still ticks when only some feeds are down", () => {
    // Three equities and one dead feed can legitimately trade the other two.
    const s = classifyMarket({ quoteStale: false, equities: [fresh("AAPL"), stale("TSLA")] });

    assert.equal(shouldSkipTick(s), false);
  });

  test("still ticks on an open market", () => {
    assert.equal(
      shouldSkipTick(classifyMarket({ quoteStale: false, equities: [fresh("AAPL")] })),
      false,
    );
  });
});

describe("describeMarket", () => {
  test("a closed market never says NAV or revert", () => {
    // The sentence being replaced was "NAV unavailable — on-chain nav() would
    // currently revert": accurate, useless, and reads as our bug rather than a
    // Saturday.
    const text = describeMarket(classifyMarket({ quoteStale: false, equities: [stale("AAPL")] }));

    assert.match(text, /Market closed/);
    assert.doesNotMatch(text, /NAV|revert/i);
  });

  test("names the one ticker that is down", () => {
    const text = describeMarket(
      classifyMarket({ quoteStale: false, equities: [fresh("AAPL"), stale("TSLA")] }),
    );

    assert.match(text, /TSLA/);
    assert.doesNotMatch(text, /AAPL/);
  });

  test("names all of them when several are down", () => {
    const text = describeMarket(
      classifyMarket({ quoteStale: true, equities: [stale("AAPL"), stale("TSLA")] }),
    );

    assert.match(text, /AAPL, TSLA/);
  });
});
