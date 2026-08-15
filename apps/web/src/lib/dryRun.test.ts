import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { dryRunFromCreateBody, dryRunFromPatchBody } from "./dryRun.js";

/**
 * `dryRun` is the flag that decides whether an agent's trades reach the chain,
 * so what these lock is not the happy path — it is which way each function
 * falls when the input is junk. Both directions are covered explicitly for the
 * same reason session.test.ts covers forged tokens: the dangerous outcome here
 * is a bad body being *silently accepted* as a request to trade for real.
 */
describe("dryRunFromCreateBody", () => {
  it("honours an explicit false — the only way to ask for live", () => {
    assert.equal(dryRunFromCreateBody(false), false);
  });

  it("honours an explicit true", () => {
    assert.equal(dryRunFromCreateBody(true), true);
  });

  it("defaults to paper when the field is absent", () => {
    assert.equal(dryRunFromCreateBody(undefined), true);
  });

  // The whole point of `!== false` rather than a truthiness check. A client
  // that serialises booleans as strings sends "false", which is truthy in JS
  // and would have read as "live" under `Boolean(value)`.
  it('treats the string "false" as paper, not as a request to go live', () => {
    assert.equal(dryRunFromCreateBody("false"), true);
  });

  it("treats null, 0 and an empty string as paper", () => {
    assert.equal(dryRunFromCreateBody(null), true);
    assert.equal(dryRunFromCreateBody(0), true);
    assert.equal(dryRunFromCreateBody(""), true);
  });
});

describe("dryRunFromPatchBody", () => {
  it("passes booleans through in both directions", () => {
    assert.equal(dryRunFromPatchBody(true), true);
    assert.equal(dryRunFromPatchBody(false), false);
  });

  // Unlike creation, absence is not a safe default: the agent already has a
  // mode, and defaulting either way would change it on a malformed request.
  it("rejects anything that is not a boolean", () => {
    assert.equal(dryRunFromPatchBody(undefined), null);
    assert.equal(dryRunFromPatchBody(null), null);
    assert.equal(dryRunFromPatchBody("true"), null);
    assert.equal(dryRunFromPatchBody("false"), null);
    assert.equal(dryRunFromPatchBody(1), null);
    assert.equal(dryRunFromPatchBody({}), null);
  });
});
