import "server-only";
import { createPublicClient, http } from "viem";
import { getNetwork, getViemChain, type NetworkKey } from "@puno/shared";

/// Server-side chain reads for route handlers. Separate from lib/wagmi-config.ts,
/// which configures the *browser* wallet connection — this one never touches a
/// signer and exists only to verify what already happened on-chain.
export function currentNetwork() {
  return getNetwork((process.env.NETWORK as NetworkKey) ?? "testnet");
}

export function serverPublicClient() {
  const network = currentNetwork();
  const chain = getViemChain(network.chainId);
  if (!chain) {
    throw new Error(`no viem chain definition for chainId ${network.chainId}`);
  }
  return createPublicClient({
    chain,
    transport: http(process.env.RPC_URL || network.rpcUrl),
  });
}
