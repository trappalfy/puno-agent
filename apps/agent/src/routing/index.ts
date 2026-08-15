import type { PublicClient } from "viem";
import type { NetworkConfig } from "@puno/shared";
import type { RouterAdapter } from "./types.js";
import { MockRouterAdapter } from "./mock.js";
import { UniswapV3Adapter } from "./uniswapV3.js";

export type { RouterAdapter, SwapPlan, SwapRequest } from "./types.js";
export { MockRouterAdapter } from "./mock.js";
export { UniswapV3Adapter, type UniswapV3Deployment } from "./uniswapV3.js";

/// Which venue fills trades on a given network.
///
/// Selected by `isTestnet` rather than by chain id so a future testnet inherits
/// the mock automatically instead of falling into the mainnet branch by
/// omission — the failure direction matters here.
///
/// A network with neither a mock nor a V3 deployment **throws**, rather than
/// falling back to anything. That is what this code did wrong before the
/// adapter existed: it built `MockRouter.swap` bytes and handed them to the
/// real 1inch router, which has no such function. Both refuse the trade; only
/// one of them says why. The caller records it as a `simulated` row whose error
/// names the cause instead of an opaque revert string.
export function getRouterAdapter(network: NetworkConfig, client: PublicClient): RouterAdapter {
  if (network.isTestnet) return new MockRouterAdapter();

  if (network.uniswapV3) return new UniswapV3Adapter(client, network.uniswapV3);

  throw new Error(
    `no router adapter for ${network.name} (chain ${network.chainId}) — no Uniswap V3 ` +
      "deployment is recorded for it, and MockRouter calldata sent to a real router would " +
      "revert. See PHASE4-ROUTING-2026-08-14.md.",
  );
}
