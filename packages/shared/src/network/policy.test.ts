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
  it("pins the live table as OPEN, now that PUNO has launched", () => {
    // **Inverted on 2026-08-20, when the token launched and PunoCredits was
    // deployed.** This assertion has tracked the live table through three
    // states: it named VaultFactory, then the PUNO launch, and now the absence
    // of any reason at all. It is deliberately pinned to the real config rather
    // than a fixture, so a config edit that accidentally *closes* mainnet — the
    // failure that now costs money — fails here. The generic behaviour it used
    // to cover is pinned by the next test, which states its own preconditions.
    assert.equal(whyClosed(NETWORKS.mainnet), null, "mainnet is open as of 2026-08-20");
    assert.equal(isOpenForBusiness(NETWORKS.mainnet), true);
  });

  it("still refuses after a VaultFactory is deployed, and says why", () => {
    // The regression this whole predicate exists for. We intend to deploy the
    // factory to mainnet *before* the token launches, because it has no PUNO
    // dependency and doing it early de-risks T-0. That must not open the wizard:
    // a vault nobody can buy credit for is worse than no vault, because the user
    // has already paid for every signature.
    const reason = whyClosed(
      table({ mainnet: { vaultFactory: FACTORY, punoToken: null, punoCredits: null } }).mainnet,
    );
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
    const chosen = creditsNetworkFrom(table({ mainnet: { punoToken: null, punoCredits: null } }));
    assert.equal(chosen?.key, "testnet");
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
    const chosen = creditsNetworkFrom(table({ mainnet: { punoToken: PUNO, punoCredits: null } }));
    assert.equal(chosen?.key, "testnet");
  });

  it("returns null when nothing anywhere can take a payment", () => {
    const chosen = creditsNetworkFrom(
      table({
        mainnet: { punoToken: null, punoCredits: null },
        testnet: { punoToken: null, punoCredits: null },
      }),
    );
    assert.equal(chosen, null);
  });
});
