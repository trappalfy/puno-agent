import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NETWORKS, type NetworkConfig, type NetworkKey } from "./config.js";
import { creditsNetworkFrom, isOpenForBusiness, whyClosed } from "./policy.js";

/// A copy of the real table with the launch-state fields overridable, so the
/// states we care about can be tested before they exist on any chain. Everything
/// else stays real — the point is to vary one axis, not to invent a network.
function table(
  overrides: Partial<Record<NetworkKey, Partial<NetworkConfig>>> = {},
): Record<NetworkKey, NetworkConfig> {
  return {
    mainnet: { ...NETWORKS.mainnet, ...overrides.mainnet },
    testnet: { ...NETWORKS.testnet, ...overrides.testnet },
  };
}

const PUNO = "0x1111111111111111111111111111111111111111" as const;
const CREDITS = "0x2222222222222222222222222222222222222222" as const;
const FACTORY = "0x3333333333333333333333333333333333333333" as const;

describe("whyClosed", () => {
  it("names the PUNO launch as what closes mainnet today, not the factory", () => {
    // **True for the first time on 2026-08-17, and that is why this assertion
    // moved.** It read `/VaultFactory/` until then: the factory was the first
    // null in the real table, so `whyClosed` never reached the PUNO branch and
    // the name described an intent rather than the behaviour. `VaultFactory` is
    // deployed to mainnet now, so the branch this predicate exists for is finally
    // the one that runs.
    //
    // This test pins the *live* table — a config edit that accidentally opened
    // mainnet fails here. The next test pins the behaviour generically, which is
    // why both are worth keeping rather than one.
    const reason = whyClosed(NETWORKS.mainnet);
    assert.ok(reason, "mainnet must be closed today");
    assert.match(reason, /PUNO has not launched/);
    assert.doesNotMatch(reason, /VaultFactory/, "the factory exists; it cannot be the reason");
  });

  it("still refuses after a VaultFactory is deployed, and says why", () => {
    // The regression this whole predicate exists for. We intend to deploy the
    // factory to mainnet *before* the token launches, because it has no PUNO
    // dependency and doing it early de-risks T-0. That must not open the wizard:
    // a vault nobody can buy credit for is worse than no vault, because the user
    // has already paid for every signature.
    const reason = whyClosed(table({ mainnet: { vaultFactory: FACTORY } }).mainnet);
    assert.ok(reason, "mainnet must stay closed until PUNO exists");
    assert.match(reason, /PUNO has not launched/);
  });

  it("opens only when the factory, the worker key and both PUNO addresses exist", () => {
    const open = table({
      mainnet: { vaultFactory: FACTORY, punoToken: PUNO, punoCredits: CREDITS },
    }).mainnet;
    assert.equal(whyClosed(open), null);
    assert.equal(isOpenForBusiness(open), true);
  });

  it("refuses a network with no worker key, whatever else is set", () => {
    const reason = whyClosed(
      table({
        mainnet: {
          vaultFactory: FACTORY,
          punoToken: PUNO,
          punoCredits: CREDITS,
          serviceAgent: null,
        },
      }).mainnet,
    );
    assert.match(reason ?? "", /worker key/);
  });

  it("treats testnet as open — it is what the product runs on today", () => {
    assert.equal(whyClosed(NETWORKS.testnet), null);
  });
});

/**
 * The single most important behaviour in this file.
 *
 * Testnet PUNO is a mock that `DeployTestnet` stands up and anyone can be sent
 * for free. If credit could ever be bought on either network at once, that free
 * token would buy real USD credit drawn against our real model bill.
 */
describe("creditsNetworkFrom", () => {
  it("sells credit on testnet while mainnet has no contracts", () => {
    assert.equal(creditsNetworkFrom(table())?.key, "testnet");
  });

  it("hands billing to mainnet the moment both of its addresses exist", () => {
    const chosen = creditsNetworkFrom(
      table({ mainnet: { punoToken: PUNO, punoCredits: CREDITS } }),
    );
    assert.equal(chosen?.key, "mainnet");
  });

  it("ignores mainnet while only the token address is known", () => {
    // The exact half-configured state between the token launching and
    // PunoCredits being deployed. `PunoCredits.token` is immutable, so this
    // window is unavoidable rather than hypothetical.
    const chosen = creditsNetworkFrom(table({ mainnet: { punoToken: PUNO } }));
    assert.equal(chosen?.key, "testnet");
  });

  it("returns null when nothing anywhere can take a payment", () => {
    const chosen = creditsNetworkFrom(table({ testnet: { punoToken: null, punoCredits: null } }));
    assert.equal(chosen, null);
  });
});
