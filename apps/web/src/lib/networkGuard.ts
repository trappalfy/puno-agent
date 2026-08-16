import { getNetwork, getNetworkByChainId, type NetworkKey } from "@puno/shared";

export type GuardVerdict =
  | { state: "ok" }
  | {
      state: "switch";
      requiredChainId: number;
      requiredName: string;
      /// What the wallet is on right now, in words. "chain 1" for anything we
      /// do not run.
      walletLabel: string;
    };

/**
 * A name for whatever chain the wallet is on.
 *
 * Exists because the wrong-network panel has to name *both* sides, and the old
 * one could only name ours. `NetworkBadge` renders exactly two chains, so a
 * wallet on Ethereum had no honest representation — the panel would have called
 * it "testnet" or said nothing. Being vague about which chain someone is
 * actually on is the one thing a network warning must not do.
 */
export function describeChain(chainId: number | undefined): string {
  if (chainId === undefined) return "no chain";
  return getNetworkByChainId(chainId)?.name ?? `chain ${chainId}`;
}

/**
 * Whether a surface that acts on `required` can be used right now.
 *
 * Takes `walletChainId` from `useAccount()`, never `useChainId()`. Verified in
 * wagmi's source: `syncConnectedChain` drops any chain outside the configured
 * list, so `useChainId()` can only ever return one of ours and falls back to the
 * first. A wallet connected to Ethereum therefore *passed* the old global guard
 * — it read as testnet. `useAccount().chainId` reports the connector's real
 * chain, which is the only value a gate can be built on.
 *
 * Disconnected passes. That is deliberate rather than lenient: every read is now
 * pinned to an explicit `chainId` and resolves over that chain's own HTTP
 * transport regardless of the wallet, so a visitor with no wallet sees correct
 * data. Writes are separately gated by having no connector at all, and by the
 * contracts' own owner checks.
 */
export function networkGuardVerdict(input: {
  required: NetworkKey;
  isConnected: boolean;
  walletChainId: number | undefined;
}): GuardVerdict {
  const required = getNetwork(input.required);
  if (!input.isConnected) return { state: "ok" };
  if (input.walletChainId === required.chainId) return { state: "ok" };
  return {
    state: "switch",
    requiredChainId: required.chainId,
    requiredName: required.name,
    walletLabel: describeChain(input.walletChainId),
  };
}
