import type { Address } from "viem";

/// Phase 4 / blocker B1. The seam between "which venue fills this trade" and
/// "what bytes does AgentVault.executeTrade forward".
///
/// Before this existed, `simulate.ts` encoded `MockRouter.swap` inline. That
/// call shape exists only on chain 46630, while the agent-creation wizard
/// writes the *real* 1inch router into the vault policy on mainnet — so a
/// mainnet agent would have handed 1inch bytes describing a function it does
/// not have. It failed safe (the eth_call catches the revert before anything
/// is broadcast) but it meant the agent could not trade on mainnet at all.
///
/// Why an interface rather than an if/else on the network: the venues differ in
/// kind, not in spelling. `MockRouter.swap` is told what to pay out; Uniswap's
/// `SwapRouter02.exactInputSingle` has to be *asked*, one `eth_call` per fee
/// tier, because the deepest tier is not the same tier for every ticker (NVDA's
/// is 500, AAPL's and TSLA's is 3000 — see PHASE4-ROUTING-2026-08-14.md). A
/// third shape, the 1inch aggregator's pathfinder output, cannot be built
/// locally at all. One `plan()` call per adapter is the only thing they share.
export interface SwapRequest {
  /// Where the proceeds must land. The vault computes `amountOut` as its own
  /// balance delta, so calldata that pays anyone else reverts on-chain rather
  /// than quietly succeeding — which is why the vault can forward arbitrary
  /// bytes safely in the first place.
  vault: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  /// The router the vault will actually call. Taken from the vault's own
  /// `allowedRouters`, never chosen by the adapter: an adapter that could pick
  /// its own target would be routing around the allowlist. An adapter that
  /// cannot build calldata for this address must fail loudly.
  router: Address;
  /// The fill `risk.ts` assumed from the oracle price. The mock adapter is
  /// *told* to fill at exactly this. A real venue ignores it and quotes for
  /// itself — the two are then allowed to disagree, and that disagreement is
  /// the whole point of Phase 4.
  fairAmountOut: bigint;
  /// The oracle-derived floor the vault will enforce anyway. A real venue puts
  /// it in its own calldata too, so the *router* refuses a bad fill instead of
  /// the swap succeeding and the vault reverting one step later — same outcome,
  /// far clearer revert. Never recomputed from the venue's own quote: see
  /// `SwapPlan.amountOut`.
  minOut: bigint;
}

export interface SwapPlan {
  /// What the venue says this trade returns. For the mock this equals
  /// `fairAmountOut` by construction; for a real venue it is a live quote.
  ///
  /// Note what this is *not*: it is not `minOut`. `minOut` stays derived from
  /// the oracle, because `AgentVault.executeTrade` requires
  /// `minOut >= _minAcceptableOut(...)` against its own Chainlink feeds. Deriving
  /// the floor from the same venue that fills the trade would hand the venue
  /// both sides of the check and reverts on-chain the moment a quote comes in
  /// under the oracle.
  amountOut: bigint;
  calldata: `0x${string}`;
  /// One line naming the venue and the route taken, for the log and the trade
  /// row. A fill that disagrees with the oracle is only diagnosable if we
  /// recorded which pool produced it.
  route: string;
}

export interface RouterAdapter {
  readonly name: string;
  plan(req: SwapRequest): Promise<SwapPlan>;
}
