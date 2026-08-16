import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseDryRun } from "./dry-run.js";

/**
 * There were no tests here at all until 2026-08-16, and the code was wrong in
 * the direction that spends money.
 *
 * `DRY_RUN` was parsed with `.transform(v => v === "true" || v === "1")`, which
 * returns a boolean for every input including `undefined`. So the guard that
 * read `env.DRY_RUN === undefined ? true : env.DRY_RUN` could never fire, an
 * unset variable resolved to `false`, and a worker deployed without it would
 * have broadcast real trades — under a comment promising exactly the opposite.
 *
 * The absent case is therefore the first test and the reason this file exists.
 */
describe("parseDryRun", () => {
  it("simulates when the variable is absent — the whole point", () => {
    assert.equal(parseDryRun(undefined), true);
  });

  it("simulates when the variable is present but empty", () => {
    // `.env` files ship keys with no value, and clearing a variable is not a
    // request to start trading.
    assert.equal(parseDryRun(""), true);
    assert.equal(parseDryRun("   "), true);
  });

  it("takes true and 1 as simulate", () => {
    for (const raw of ["true", "1", "TRUE", " True "]) {
      assert.equal(parseDryRun(raw), true, `"${raw}"`);
    }
  });

  it("takes false and 0 as live, since that is what the runbook sets", () => {
    for (const raw of ["false", "0", "FALSE", " false "]) {
      assert.equal(parseDryRun(raw), false, `"${raw}"`);
    }
  });

  it("refuses anything else instead of guessing", () => {
    // The old parser answered every one of these with live trading. Refusing to
    // boot is recoverable in a way that an unintended mainnet trade is not.
    for (const raw of ["yes", "no", "on", "off", "y", "n", "dry", "2", "null"]) {
      assert.throws(() => parseDryRun(raw), /not a value I will guess at/, `"${raw}"`);
    }
  });

  it("never resolves an unrecognised value to live trading", () => {
    // The property, stated independently of the list above: for any input,
    // `false` is only ever reached through an explicit false-y spelling.
    const live = ["false", "0"];
    for (const raw of ["yes", "off", "n", "TrUe", "", "1", " ", "no", "disabled"]) {
      let result: boolean;
      try {
        result = parseDryRun(raw);
      } catch {
        continue; // refusing is a safe outcome
      }
      if (result === false) {
        assert.ok(live.includes(raw.trim().toLowerCase()), `"${raw}" reached live trading`);
      }
    }
  });
});
