import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Address } from "viem";

import { serviceAgentMismatch } from "./serviceAgent.js";

const CONFIGURED = "0x389AA9c066854a1e1A62a9F49910760a8D010adD" as Address;
const OTHER = "0x7b22e721AeE49C4306699a5E77243372FA6afBDa" as Address;

/**
 * The failure this guards against is slow and expensive rather than loud: a
 * worker holding the wrong key screens, decides, bills the user for the
 * decision, passes risk, and only then reverts on chain. These lock the cases
 * where it must refuse to start, and equally the cases where it must not — a
 * boot check that cries wolf gets deleted.
 */
describe("serviceAgentMismatch", () => {
  it("passes when the derived address matches", () => {
    assert.equal(serviceAgentMismatch(CONFIGURED, CONFIGURED, { dryRun: false }), null);
  });

  // Addresses arrive from two different places — a hand-maintained config file
  // and viem's checksummed derivation — so case is not something to compare on.
  it("compares case-insensitively", () => {
    const lower = CONFIGURED.toLowerCase() as Address;
    assert.equal(serviceAgentMismatch(CONFIGURED, lower, { dryRun: false }), null);
  });

  it("reports a mismatch, naming both addresses", () => {
    const msg = serviceAgentMismatch(CONFIGURED, OTHER, { dryRun: false });
    assert.ok(msg, "expected a mismatch message");
    assert.ok(msg.includes(CONFIGURED), "message must name the configured address");
    assert.ok(msg.includes(OTHER), "message must name the derived address");
  });

  // Paper mode still catches this, because a worker left in paper for a week
  // and then switched to live should not discover the mismatch at that moment.
  it("reports a mismatch in paper mode too", () => {
    assert.ok(serviceAgentMismatch(CONFIGURED, OTHER, { dryRun: true }));
  });

  it("says nothing when the network has no service agent configured", () => {
    assert.equal(serviceAgentMismatch(null, OTHER, { dryRun: false }), null);
    assert.equal(serviceAgentMismatch(null, null, { dryRun: true }), null);
  });

  // A paper worker signs nothing, so a missing key is a normal state, not a
  // misconfiguration. Live with no key is caught in config.ts before this runs.
  it("tolerates a missing key in paper mode but not in live", () => {
    assert.equal(serviceAgentMismatch(CONFIGURED, null, { dryRun: true }), null);
    assert.ok(serviceAgentMismatch(CONFIGURED, null, { dryRun: false }));
  });
});
