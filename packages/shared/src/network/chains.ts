import { defineChain, type Chain } from "viem";
import { NETWORKS, type NetworkConfig } from "./config.js";

/// One canonical viem Chain per network, derived from the same NetworkConfig
/// apps/agent reads for its own client — so a wallet-connect UI (apps/web)
/// and the trading worker can never disagree about RPC URL, explorer, or
/// native currency for a given chain ID.
function toViemChain(network: NetworkConfig): Chain {
  return defineChain({
    id: network.chainId,
    name: network.name,
    nativeCurrency: network.nativeCurrency,
    rpcUrls: { default: { http: [network.rpcUrl] } },
    blockExplorers: { default: { name: "Blockscout", url: network.explorerUrl } },
    testnet: network.isTestnet,
  });
}

export const robinhoodMainnet: Chain = toViemChain(NETWORKS.mainnet);
export const robinhoodTestnet: Chain = toViemChain(NETWORKS.testnet);

export function getViemChain(chainId: number): Chain | undefined {
  if (chainId === robinhoodMainnet.id) return robinhoodMainnet;
  if (chainId === robinhoodTestnet.id) return robinhoodTestnet;
  return undefined;
}
