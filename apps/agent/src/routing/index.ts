import type { NetworkConfig } from "@puno/shared";
import type { RouterAdapter } from "./types.js";
import { MockRouterAdapter } from "./mock.js";

export type { RouterAdapter, SwapPlan, SwapRequest } from "./types.js";
export { MockRouterAdapter } from "./mock.js";

/// Which venue fills trades on a given network.
///
/// Selected by `isTestnet` rather than by chain id so a future testnet inherits
/// the mock automatically instead of falling into the mainnet branch by
/// omission — the failure direction matters here.
///
/// Mainnet **throws**, and that is the deliberate state until the Uniswap V3
/// adapter lands. The alternative is what this code did before: build
/// `MockRouter.swap` bytes and hand them to the real 1inch router, which has no
/// such function. Both refuse the trade, but only one of them says why. A
/// caller sees this as a recorded `simulated` row whose error names the actual
/// cause instead of an opaque revert string.
export function getRouterAdapter(network: NetworkConfig): RouterAdapter {
  if (network.isTestnet) return new MockRouterAdapter();

  throw new Error(
    `no router adapter for ${network.name} (chain ${network.chainId}) — the Uniswap V3 ` +
      "integration (blocker B1) is not finished, and MockRouter calldata sent to a real " +
      "router would revert. See PHASE4-ROUTING-2026-08-14.md.",
  );
}
