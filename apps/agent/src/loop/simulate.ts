import { encodeFunctionData, type Address } from "viem";
import { agentVaultAbi, mockRouterAbi } from "@puno/shared";
import { publicClient } from "../chain/client.js";
import type { ProposedTrade } from "./risk.js";

export interface SimulateResult {
  ok: boolean;
  error: string | null;
  swapCalldata: `0x${string}`;
}

/// Plan 2.3 step 9. Real, read-only `eth_call` against the actual deployed
/// AgentVault — this is the ground truth risk.ts can only approximate,
/// including the one check risk.ts structurally cannot mirror (the rolling
/// 24h notional window; see risk.ts's module comment). Runs regardless of
/// DRY_RUN — simulation never broadcasts a transaction, so there's no reason
/// to skip it even when the real send (execute.ts) is gated off.
///
/// swapCalldata targets MockRouter.swap directly (testnet-only stand-in —
/// see contracts/mocks/MockRouter.sol and contracts/script/DeployTestnet.s.sol
/// for why no real router is wired up yet). Phase 4 replaces this with
/// calldata from a real router's quote API.
export async function simulateTrade(
  vault: Address,
  agentAddress: Address,
  trade: ProposedTrade,
): Promise<SimulateResult> {
  const swapCalldata = encodeFunctionData({
    abi: mockRouterAbi,
    functionName: "swap",
    args: [trade.tokenIn, trade.tokenOut, trade.amountIn, trade.amountOut, vault],
  });

  try {
    await publicClient.simulateContract({
      address: vault,
      abi: agentVaultAbi,
      functionName: "executeTrade",
      args: [
        trade.tokenIn,
        trade.tokenOut,
        trade.amountIn,
        trade.minOut,
        trade.router,
        swapCalldata,
      ],
      account: agentAddress,
    });
    return { ok: true, error: null, swapCalldata };
  } catch (err) {
    return { ok: false, error: (err as Error).message, swapCalldata };
  }
}
