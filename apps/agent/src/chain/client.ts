import { createPublicClient, createWalletClient, http, defineChain, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "../config.js";

const robinhoodChain = defineChain({
  id: config.network.chainId,
  name: config.network.name,
  nativeCurrency: config.network.nativeCurrency,
  rpcUrls: {
    default: { http: [config.rpcUrl] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: config.network.explorerUrl },
  },
  testnet: config.network.isTestnet,
});

export const publicClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(config.rpcUrl),
});

// Only constructed when a signer is actually needed — a DRY_RUN=true worker
// never touches AGENT_PRIVATE_KEY at all beyond this optional getter.
export function getAgentAccount() {
  if (!config.agentPrivateKey) {
    throw new Error("AGENT_PRIVATE_KEY not configured — required to sign transactions");
  }
  return privateKeyToAccount(config.agentPrivateKey as `0x${string}`);
}

export function getWalletClient() {
  return createWalletClient({
    account: getAgentAccount(),
    chain: robinhoodChain,
    transport: http(config.rpcUrl),
  });
}

export type { Address };
