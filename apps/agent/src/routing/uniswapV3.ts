import { encodeFunctionData, type Address, type PublicClient } from "viem";
import { uniswapV3QuoterV2Abi, uniswapV3SwapRouter02Abi, UNISWAP_V3_FEE_TIERS } from "@puno/shared";
import type { RouterAdapter, SwapPlan, SwapRequest } from "./types.js";

export interface UniswapV3Deployment {
  factory: Address;
  swapRouter02: Address;
  quoterV2: Address;
}

interface TierQuote {
  fee: number;
  amountOut: bigint;
  ticksCrossed: number;
}

/// Uniswap V3, quoted and encoded locally — option B of PHASE4-ROUTING's fork,
/// chosen over the 1inch aggregator API because it needs no third-party HTTP
/// call inside the money path, no API key to hold and rotate, and has no outage
/// mode in which the agent cannot trade at all. It is also the only one of the
/// two whose support for chain 4663 could be confirmed without a key.
///
/// The cost of that choice, stated so it is not discovered later: **single hop
/// only**. A token with no direct pool against the quote asset cannot be traded
/// here at all, and this adapter says so rather than routing through an
/// intermediate it never checked. Multi-hop, or the aggregator behind the same
/// interface, is the upgrade path.
export class UniswapV3Adapter implements RouterAdapter {
  readonly name = "uniswap-v3";

  constructor(
    private readonly client: PublicClient,
    private readonly deployment: UniswapV3Deployment,
  ) {}

  async plan(req: SwapRequest): Promise<SwapPlan> {
    // The vault only forwards to routers on its own allowlist, so an adapter
    // that quoted one venue and encoded for another would produce calldata the
    // vault refuses — or worse, calldata a *different* allowlisted router
    // interprets differently. Checked here rather than trusted.
    if (req.router.toLowerCase() !== this.deployment.swapRouter02.toLowerCase()) {
      throw new Error(
        `vault allowlists router ${req.router} but this adapter only builds calldata for ` +
          `SwapRouter02 at ${this.deployment.swapRouter02}`,
      );
    }

    const best = await this.bestTier(req);
    if (!best) {
      throw new Error(
        `no Uniswap V3 pool quoted ${req.tokenIn} -> ${req.tokenOut} at any of the fee tiers ` +
          `${UNISWAP_V3_FEE_TIERS.join(", ")} (single-hop only — a pair with no direct pool is ` +
          "not tradable through this adapter)",
      );
    }

    const calldata = encodeFunctionData({
      abi: uniswapV3SwapRouter02Abi,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: req.tokenIn,
          tokenOut: req.tokenOut,
          fee: best.fee,
          // The vault, never the agent. AgentVault measures `amountOut` as its
          // own balance delta, so proceeds paid anywhere else read as a zero
          // fill and revert.
          recipient: req.vault,
          amountIn: req.amountIn,
          // The oracle floor, not `best.amountOut * (1 - slippage)`. Deriving
          // the minimum from the same quote that produced the fill would make
          // the check circular, and the vault would reject it anyway:
          // executeTrade requires minOut >= _minAcceptableOut against its own
          // Chainlink feeds.
          amountOutMinimum: req.minOut,
          // No price limit — protection is amountOutMinimum plus the vault's
          // own post-trade balance check, both of which bound the *outcome*
          // rather than the path.
          sqrtPriceLimitX96: 0n,
        },
      ],
    });

    return {
      amountOut: best.amountOut,
      calldata,
      route: `Uniswap V3 ${req.tokenIn} -> ${req.tokenOut} fee ${best.fee} (${best.ticksCrossed} ticks crossed)`,
    };
  }

  /// Quotes every tier and takes the best output.
  ///
  /// Sequentially, and that is not an oversight: the public RPC sits behind
  /// Cloudflare and answers batched JSON-RPC POSTs with an HTML interstitial
  /// (CLAUDE.md). Four calls per trade is the price of not assuming a tier.
  ///
  /// A tier with no pool reverts, which is normal and not an error — most pairs
  /// have pools at one or two tiers out of four. Only the case where *every*
  /// tier fails is a real failure, and the caller raises it.
  private async bestTier(req: SwapRequest): Promise<TierQuote | null> {
    let best: TierQuote | null = null;

    for (const fee of UNISWAP_V3_FEE_TIERS) {
      let quote: TierQuote;
      try {
        // simulateContract, not readContract: QuoterV2 is `nonpayable` because
        // it quotes by executing a swap and reverting with the result.
        const { result } = await this.client.simulateContract({
          address: this.deployment.quoterV2,
          abi: uniswapV3QuoterV2Abi,
          functionName: "quoteExactInputSingle",
          args: [
            {
              tokenIn: req.tokenIn,
              tokenOut: req.tokenOut,
              // Note the ordering: the quoter takes amountIn *before* fee,
              // where the router takes fee before amountIn. Named fields keep
              // this honest; positional encoding would not.
              amountIn: req.amountIn,
              fee,
              sqrtPriceLimitX96: 0n,
            },
          ],
        });
        quote = { fee, amountOut: result[0], ticksCrossed: result[2] };
      } catch {
        continue;
      }

      // A pool can exist and quote zero when it holds nothing on the output
      // side. That is not a candidate, and picking it would encode a swap that
      // reverts at the router for a reason nobody would connect to liquidity.
      if (quote.amountOut === 0n) continue;
      if (!best || quote.amountOut > best.amountOut) best = quote;
    }

    return best;
  }
}
