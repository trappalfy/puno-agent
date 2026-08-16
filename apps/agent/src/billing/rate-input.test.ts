import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PRICES_USD, MIN_DEPOSIT_USD, usdToTokens } from "@puno/shared";
import {
  parseSetRateArgs,
  checkRateChange,
  ratePreview,
  MAX_RATE_JUMP,
  MIN_REPRESENTABLE_USD,
} from "./rate-input.js";

const DECIMALS = 18;

function expectOk<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  assert.ok(result.ok, `expected ok, got: ${result.ok ? "" : result.error}`);
  return result.value;
}

/**
 * This number decides how much credit real money buys, it is typed by hand, and
 * nothing else in the system holds a second opinion to disagree with it. Every
 * check here is the only one of its kind.
 */
describe("parseSetRateArgs", () => {
  it("reads a price and a note", () => {
    const args = expectOk(parseSetRateArgs(["0.001", "--note", "launch price"]));
    assert.equal(args.priceUsd, 0.001);
    assert.equal(args.note, "launch price");
    assert.equal(args.force, false);
  });

  it("accepts --note=value, which is what shell history produces", () => {
    const args = expectOk(parseSetRateArgs(["0.001", "--note=pool seeded"]));
    assert.equal(args.note, "pool seeded");
  });

  it("survives the `--` pnpm forwards instead of consuming", () => {
    // The documented command is `pnpm ... set-rate -- 0.001 --note "x"`, and
    // pnpm passes the separator straight through. Without this the one
    // invocation printed in every warning message fails with "unknown flag --".
    const args = expectOk(parseSetRateArgs(["--", "0.001", "--note", "launch"]));
    assert.equal(args.priceUsd, 0.001);
    assert.equal(args.note, "launch");
  });

  it("still reads flags that follow the separator", () => {
    const args = expectOk(parseSetRateArgs(["--", "0.001", "--note", "x", "--force"]));
    assert.equal(args.force, true);
  });

  it("accepts scientific notation", () => {
    const args = expectOk(parseSetRateArgs(["1e-4", "--note", "x"]));
    assert.equal(args.priceUsd, 0.0001);
  });

  it("requires a note", () => {
    const result = parseSetRateArgs(["0.001"]);
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, /--note is required/);
  });

  it("rejects a whitespace-only note", () => {
    // An append-only audit trail whose reason column reads "   " is the same as
    // one with no reason column.
    const result = parseSetRateArgs(["0.001", "--note", "   "]);
    assert.equal(result.ok, false);
  });

  it("rejects non-numeric, zero and negative prices", () => {
    for (const bad of ["abc", "0", "-1"]) {
      const result = parseSetRateArgs([bad, "--note", "x"]);
      assert.equal(result.ok, false, `"${bad}" should be rejected`);
    }
  });

  it("rejects a price the column would round to zero", () => {
    // numeric(24, 12). Below the scale this stores as 0, and the failure would
    // surface on the first deposit as "not a usable price" — a long way from
    // the keystroke that caused it.
    const result = parseSetRateArgs([String(MIN_REPRESENTABLE_USD / 10), "--note", "x"]);
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, /round to zero/);
  });

  it("rejects unknown flags rather than ignoring them", () => {
    // Silently ignoring --dry-run would be the worst possible reading of it.
    const result = parseSetRateArgs(["0.001", "--note", "x", "--dry-run"]);
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, /unknown flag/);
  });

  it("rejects a second positional rather than guessing which is the price", () => {
    const result = parseSetRateArgs(["0.001", "0.002", "--note", "x"]);
    assert.equal(result.ok, false);
  });

  it("does not swallow the next flag as the note's value", () => {
    const result = parseSetRateArgs(["0.001", "--note", "--force"]);
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, /--note needs a value/);
  });
});

describe("checkRateChange", () => {
  it("allows the first rate, having nothing to compare against", () => {
    const result = checkRateChange({ priceUsd: 0.001, previousUsd: null, force: false });
    assert.ok(result.ok);
  });

  it("refuses a dropped zero in either direction", () => {
    // The mistake this exists for. A factor of ten is what a decimal slip
    // always produces, and it would mis-credit every deposit by the same
    // factor until someone noticed.
    for (const priceUsd of [0.0001, 0.01]) {
      const result = checkRateChange({ priceUsd, previousUsd: 0.001, force: false });
      assert.equal(result.ok, false, `${priceUsd} should be refused`);
      assert.match(result.ok ? "" : result.error, /dropped or added zero/);
    }
  });

  it("allows a real move inside the limit", () => {
    // A launching token halving inside a day is unremarkable; refusing it would
    // train whoever runs this to reach for --force by reflex, which destroys
    // the check.
    const result = checkRateChange({ priceUsd: 0.0005, previousUsd: 0.001, force: false });
    assert.ok(result.ok);
    assert.equal(result.ok ? result.warning : "", null);
  });

  it("allows exactly the limit", () => {
    const result = checkRateChange({
      priceUsd: 0.001 * MAX_RATE_JUMP,
      previousUsd: 0.001,
      force: false,
    });
    assert.ok(result.ok);
  });

  it("lets --force through but never silently", () => {
    const result = checkRateChange({ priceUsd: 0.01, previousUsd: 0.001, force: true });
    assert.ok(result.ok);
    assert.match(result.ok ? (result.warning ?? "") : "", /10\.0x up/);
  });

  it("treats a non-positive previous rate as no previous rate", () => {
    // Rather than dividing by it.
    const result = checkRateChange({ priceUsd: 0.001, previousUsd: 0, force: false });
    assert.ok(result.ok);
  });
});

describe("ratePreview", () => {
  it("uses the same conversion that bills, not a second formula", () => {
    // The point of the preview is that what it shows is what will be charged.
    // A re-implementation would drop the round-up correction on usdToTokens'
    // last line and quote a hair under the minimum.
    const rows = ratePreview(0.001, DECIMALS);
    const decision = rows.find((r) => r.label === "Decision");
    assert.ok(decision);
    assert.equal(decision.tokens, usdToTokens(PRICES_USD.decision, 0.001, DECIMALS));
  });

  it("covers the numbers a person actually judges the rate by", () => {
    const labels = ratePreview(0.001, DECIMALS).map((r) => r.label);
    assert.ok(labels.includes("Market check"), "the cheapest action sets the readable floor");
    assert.ok(labels.includes("Minimum deposit"));
    assert.ok(labels.includes("Top-up"));
  });

  it("shows each amount once", () => {
    // The first top-up preset is MIN_DEPOSIT_USD, so an unfiltered list prints
    // the same $5 row twice under two different labels.
    const amounts = ratePreview(0.001, DECIMALS).map((r) => r.usd);
    assert.equal(new Set(amounts).size, amounts.length);
  });

  it("produces the round numbers that make $0.001 the recommended rate", () => {
    const rows = ratePreview(0.001, DECIMALS);
    const whole = (label: string) => {
      const row = rows.find((r) => r.label === label);
      assert.ok(row, `missing row ${label}`);
      return row.tokens / 10n ** BigInt(DECIMALS);
    };
    assert.equal(whole("Market check"), 10n);
    assert.equal(whole("Decision"), 500n);
    assert.equal(whole("Executed trade"), 250n);
    assert.equal(whole("Minimum deposit"), 5_000n);
  });

  it("scales with the rate, so a cheaper token shows larger amounts", () => {
    const cheap = ratePreview(0.0001, DECIMALS).find((r) => r.label === "Decision");
    assert.ok(cheap);
    assert.equal(cheap.tokens / 10n ** BigInt(DECIMALS), 5_000n);
  });

  it("honours a non-18-decimal token", () => {
    // punoDecimals is a config value precisely because nothing reads decimals()
    // off the token. A preview that assumed 18 would be wrong exactly when it
    // mattered most.
    const rows = ratePreview(0.001, 6);
    const min = rows.find((r) => r.label === "Minimum deposit");
    assert.ok(min);
    assert.equal(min.tokens, usdToTokens(MIN_DEPOSIT_USD, 0.001, 6));
  });
});
