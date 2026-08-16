import {
  NETWORKS,
  getNetwork,
  type Address,
  type NetworkConfig,
  type NetworkKey,
} from "./config.js";

/// The network the free tier runs on, permanently.
///
/// One constant rather than two: `apps/web/src/lib/trial.ts` and the public
/// `/demo` page each declared this independently, which made them a pair that
/// could drift without anything failing — the demo would show one network's
/// agents while runs happened on another.
///
/// Testnet is the product decision, not an accident of what was deployed first:
/// a free run must never be able to spend real gas, and `NETWORKS.mainnet`
/// backs that up structurally by having no `demoVault`.
export const FREE_TIER_NETWORK: NetworkKey = "testnet";

/**
 * Why this network cannot be used to run a paid agent, or `null` if it can.
 *
 * The string is the reason, and it is meant to be shown: a gate whose copy is
 * written separately from its condition is a gate whose copy eventually lies.
 *
 * "Open" deliberately means *both* halves — a user can create a vault **and**
 * pay for the decisions it will make. Wiring only the first half produces the
 * worst outcome available: someone spends six to nine real signatures on a
 * vault that cannot make a single decision, and we took their gas to do it.
 */
export function whyClosed(network: NetworkConfig): string | null {
  if (!network.vaultFactory) return `no VaultFactory is deployed on ${network.name}`;
  if (!network.serviceAgent) return `no worker key is configured for ${network.name}`;
  if (!network.punoToken || !network.punoCredits) {
    return `PUNO has not launched on ${network.name}, so there is no way to buy credit for an agent`;
  }
  return null;
}

export function isOpenForBusiness(network: NetworkConfig): boolean {
  return whyClosed(network) === null;
}

/**
 * Which network's `PunoCredits` is currently selling credit — or `null` when
 * none is.
 *
 * Exactly one at a time, never a union, and that is a security property rather
 * than tidiness. Testnet PUNO is a mock anyone can mint for free
 * (`DeployTestnet` stands it up as `MockStockToken`). If the deposit indexer or
 * the claim route ever accepted a receipt from either chain, that free token
 * would buy real USD credit against our real Anthropic bill.
 *
 * Mainnet wins the moment it has both addresses, and nothing has to be switched
 * by hand for that to happen: `punoCredits` is null until the contract exists,
 * and it cannot exist before the token because `PunoCredits.token` is
 * immutable. So the same commit that opens mainnet closes testnet billing.
 *
 * Takes the table as an argument so the behaviour is testable against a
 * synthetic one — the real `NETWORKS` can only express today's state.
 */
export function creditsNetworkFrom(
  networks: Record<NetworkKey, NetworkConfig>,
): CreditsNetwork | null {
  const mainnet = networks.mainnet;
  if (mainnet.punoToken && mainnet.punoCredits) return mainnet as CreditsNetwork;
  const testnet = networks.testnet;
  if (testnet.punoToken && testnet.punoCredits) return testnet as CreditsNetwork;
  return null;
}

/// A network that has been *checked* to be able to take a payment.
///
/// The narrowing is the point: `NetworkConfig.punoToken`/`.punoCredits` are
/// nullable, so without this every call site would re-check the two fields the
/// selector already checked, and one of them would eventually check only one.
export type CreditsNetwork = NetworkConfig & { punoToken: Address; punoCredits: Address };

export function creditsNetwork(): CreditsNetwork | null {
  return creditsNetworkFrom(NETWORKS);
}

export function freeTierNetwork(): NetworkConfig {
  return getNetwork(FREE_TIER_NETWORK);
}
