import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createAgentVerdict, parseCreateAgentBody } from "./createAgent.js";

const OWNER = "0xAAaAaA00000000000000000000000000000000aA";
const STRANGER = "0xbBbBbB11111111111111111111111111111111bB";
const SERVICE = "0x389AA9c066854a1e1A62a9F49910760a8D010adD";
const VAULT = "0xcFA434255f47F4C8777043540d253CEDFb36B5e9";

const limits = {
  stopLossBps: 500,
  takeProfitBps: null,
  maxReviewIntervalHours: 6,
  priceMoveTriggerBps: 200,
  maxCallsPerHour: 4,
};

function body(overrides: Record<string, unknown> = {}) {
  return {
    vaultAddress: VAULT,
    quoteToken: "0x5fecF7bA6365E6763b8984c43307B417A498aD40",
    network: "testnet",
    agentName: "  Scout  ",
    agentAddress: SERVICE,
    offChainLimits: limits,
    ...overrides,
  };
}

describe("parseCreateAgentBody", () => {
  it("accepts a well-formed body and trims the name", () => {
    const parsed = parseCreateAgentBody(body());
    assert.ok(parsed.ok);
    assert.equal(parsed.value.agentName, "Scout");
    assert.equal(parsed.value.network, "testnet");
  });

  it("rejects a network that is not one of ours", () => {
    const parsed = parseCreateAgentBody(body({ network: "polygon" }));
    assert.equal(parsed.ok, false);
  });

  it("rejects a malformed vault address", () => {
    assert.equal(parseCreateAgentBody(body({ vaultAddress: "0xdeadbeef" })).ok, false);
  });

  it("rejects a name that is only whitespace", () => {
    assert.equal(parseCreateAgentBody(body({ agentName: "   " })).ok, false);
  });

  it("rejects null, a string and a missing limits object without throwing", () => {
    assert.equal(parseCreateAgentBody(null).ok, false);
    assert.equal(parseCreateAgentBody("nope").ok, false);
    assert.equal(parseCreateAgentBody(body({ offChainLimits: undefined })).ok, false);
  });
});

/**
 * Each of these is a way the old route could be made to hand someone a vault
 * that was not theirs. The route wrote `ownerAddress` from the session onto
 * whatever `vaultAddress` the caller supplied, and every read path authorizes
 * on that column.
 */
describe("createAgentVerdict", () => {
  const base = {
    whyClosed: null,
    sessionAddress: OWNER,
    onChainOwner: OWNER,
    claimedAgentAddress: SERVICE,
    serviceAgent: SERVICE,
    networkName: "Robinhood Chain Testnet",
  };

  it("allows the wallet the chain says owns the vault", () => {
    assert.deepEqual(createAgentVerdict(base), { ok: true });
  });

  it("compares addresses case-insensitively", () => {
    // Wallets, explorers and viem disagree on checksum casing constantly; a
    // case-sensitive compare here would lock people out of their own vaults.
    const verdict = createAgentVerdict({ ...base, onChainOwner: OWNER.toLowerCase() });
    assert.deepEqual(verdict, { ok: true });
  });

  it("refuses to register a vault owned by someone else", () => {
    // The land-grab. A legitimate sign-in plus a stranger's vault address used
    // to produce a row naming the attacker as owner.
    const verdict = createAgentVerdict({ ...base, onChainOwner: STRANGER });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.ok === false && verdict.status, 403);
  });

  it("refuses an address with no contract on the claimed network", () => {
    // Also the network check: a testnet vault claimed as mainnet reads back as
    // nothing deployed, because the claim is verified over the claimed
    // network's own RPC.
    const verdict = createAgentVerdict({ ...base, onChainOwner: null });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.ok === false && verdict.status, 400);
  });

  it("refuses a network that is not open for business, before anything else", () => {
    const verdict = createAgentVerdict({
      ...base,
      whyClosed: "PUNO has not launched on Robinhood Chain",
      onChainOwner: STRANGER,
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.ok === false && verdict.status, 403);
    assert.match(verdict.ok === false ? verdict.error : "", /PUNO/);
  });

  it("refuses an agent armed with anything but the service key", () => {
    const verdict = createAgentVerdict({ ...base, claimedAgentAddress: STRANGER });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.ok === false && verdict.status, 400);
  });

  it("refuses when the network has no service key at all", () => {
    const verdict = createAgentVerdict({ ...base, serviceAgent: null });
    assert.equal(verdict.ok, false);
  });
});
