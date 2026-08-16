import "server-only";
import { createPublicClient, http, type PublicClient } from "viem";
import { getNetwork, getViemChain, type NetworkKey } from "@puno/shared";

/// Server-side chain reads for route handlers. Separate from lib/wagmi-config.ts,
/// which configures the *browser* wallet connection — this one never touches a
/// signer and exists only to verify what already happened on-chain.
///
/// There is deliberately no `currentNetwork()` any more, and no process-wide
/// `NETWORK` read. This app is one deployment serving two chains at once — the
/// free tier lives on testnet permanently while paid agents trade on mainnet —
/// so "the network this process is on" is not a question with an answer here.
/// (It is a perfectly good question in `apps/agent`, which runs one process per
/// network.) Every caller has to say which network it means.

/// Per-network RPC override, e.g. a paid node for mainnet only.
///
/// Bare `RPC_URL` is ignored on purpose, and this is load-bearing rather than
/// tidy: `next.config.ts` loads the monorepo-root `.env`, which is shared with
/// the worker, where `RPC_URL` means "the one chain this process talks to". If
/// this factory honoured it, both networks' clients would point at one node —
/// and per the guard in `apps/agent/src/loop/tick.ts`, reading one chain's
/// address over another chain's RPC can return *data* rather than reverting,
/// because the same deployer at the same nonce yields the same address on every
/// chain.
const RPC_ENV_KEY: Record<NetworkKey, string> = {
  mainnet: "RPC_URL_MAINNET",
  testnet: "RPC_URL_TESTNET",
};

export function rpcUrlFor(
  key: NetworkKey,
  env: Record<string, string | undefined> = process.env,
): string {
  // `||` rather than `??`: an unset-but-present env var is an empty string,
  // which survives `??` and leaves the transport with no URL at all. Same
  // reasoning as apps/agent/src/config.ts.
  return env[RPC_ENV_KEY[key]] || getNetwork(key).rpcUrl;
}

const clients = new Map<NetworkKey, PublicClient>();

export function publicClientFor(key: NetworkKey): PublicClient {
  const cached = clients.get(key);
  if (cached) return cached;

  const network = getNetwork(key);
  const chain = getViemChain(network.chainId);
  if (!chain) {
    throw new Error(`no viem chain definition for chainId ${network.chainId}`);
  }
  const client = createPublicClient({
    chain,
    transport: http(rpcUrlFor(key)),
  }) as PublicClient;

  clients.set(key, client);
  return client;
}
