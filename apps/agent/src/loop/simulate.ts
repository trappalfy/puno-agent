import { type Address } from "viem";
import { agentVaultAbi } from "@puno/shared";
import { publicClient } from "../chain/client.js";
import { config } from "../config.js";
import { getRouterAdapter } from "../routing/index.js";
import type { ProposedTrade } from "./risk.js";

export type SimulateResult =
  | {
      ok: true;
      error: null;
      swapCalldata: `0x${string}`;
      /// What the venue said it would return. Equals the oracle estimate under
      /// the mock; a real quote once the Uniswap adapter lands.
      amountOut: bigint;
      route: string;
    }
  | {
      ok: false;
      error: string;
      /// Null when planning itself failed — there are no bytes in that case,
      /// and inventing some so the shape stays rectangular would hand
      /// `executeTrade` something that was never quoted.
      swapCalldata: `0x${string}` | null;
      amountOut: null;
      route: null;
    };

/// Plan 2.3 step 9. Real, read-only `eth_call` against the actual deployed
/// AgentVault — this is the ground truth risk.ts can only approximate,
/// including the one check risk.ts structurally cannot mirror (the rolling
/// 24h notional window; see risk.ts's module comment). Runs regardless of
/// DRY_RUN — simulation never broadcasts a transaction, so there's no reason
/// to skip it even when the real send (execute.ts) is gated off.
///
/// The swap calldata now comes from a router adapter (`../routing`) rather than
/// being encoded inline against the mock. Two failures are therefore distinct
/// and both land as `ok: false`: the venue could not be planned at all, and the
/// vault would reject the trade. They read very differently in a trade row, and
/// the second one used to swallow the first.
export async function simulateTrade(
  vault: Address,
  agentAddress: Address,
  trade: ProposedTrade,
): Promise<SimulateResult> {
  let calldata: `0x${string}`;
  let amountOut: bigint;
  let route: string;
  try {
    const plan = await getRouterAdapter(config.network).plan({
      vault,
      tokenIn: trade.tokenIn,
      tokenOut: trade.tokenOut,
      amountIn: trade.amountIn,
      router: trade.router,
      fairAmountOut: trade.amountOut,
    });
    calldata = plan.calldata;
    amountOut = plan.amountOut;
    route = plan.route;
  } catch (err) {
    return {
      ok: false,
      error: `could not build a swap route: ${(err as Error).message}`,
      swapCalldata: null,
      amountOut: null,
      route: null,
    };
  }

  try {
    await publicClient.simulateContract({
      address: vault,
      abi: agentVaultAbi,
      functionName: "executeTrade",
      args: [trade.tokenIn, trade.tokenOut, trade.amountIn, trade.minOut, trade.router, calldata],
      account: agentAddress,
    });
    return { ok: true, error: null, swapCalldata: calldata, amountOut, route };
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message,
      swapCalldata: calldata,
      amountOut: null,
      route: null,
    };
  }
}
