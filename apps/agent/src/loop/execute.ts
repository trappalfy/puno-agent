import type { Address } from "viem";
import { agentVaultAbi } from "@puno/shared";
import { publicClient, getWalletClient } from "../chain/client.js";
import { config } from "../config.js";
import type { ProposedTrade } from "./risk.js";

export interface ExecuteResult {
  status: "dry_run" | "confirmed" | "failed";
  txHash: `0x${string}` | null;
  error: string | null;
}

/// Plan 2.3 step 10 — the one gate the whole safety story (plan 2.5 #2)
/// hangs on. DRY_RUN defaults true (config.ts) and is checked here, at the
/// last possible moment, not earlier in the pipeline — risk.ts and
/// simulate.ts run identically in both modes so dry-run output is a faithful
/// preview of what live mode would have done.
///
/// `paper` is the per-run form of the same gate, used by the free-tier trial:
/// the worker executes paid agents live in the same process, so that run
/// cannot rely on the process-wide flag. Either one being set is enough to
/// stop the broadcast — they are OR-ed deliberately, so a paper run can never
/// go live by way of a config change, and DRY_RUN keeps its meaning as the
/// blanket safety switch.
export async function executeTrade(
  vault: Address,
  trade: ProposedTrade,
  swapCalldata: `0x${string}`,
  paper = false,
): Promise<ExecuteResult> {
  if (config.dryRun || paper) {
    return { status: "dry_run", txHash: null, error: null };
  }

  const walletClient = getWalletClient();
  try {
    const txHash = await walletClient.writeContract({
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
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    const confirmed = receipt.status === "success";
    return {
      status: confirmed ? "confirmed" : "failed",
      txHash,
      error: confirmed ? null : "transaction reverted on-chain",
    };
  } catch (err) {
    return { status: "failed", txHash: null, error: (err as Error).message };
  }
}
