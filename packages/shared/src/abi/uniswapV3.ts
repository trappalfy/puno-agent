// Uniswap V3 periphery on Robinhood Chain mainnet (4663).
//
// Both entries were read out of the *verified source of the deployed bytecode*
// on 2026-08-14 via Blockscout, not copied from the upstream repo:
//   SwapRouter02 0xCaf681a66D020601342297493863E78C959E5cb2
//     -> src/pkgs/swap-router-contracts/contracts/SwapRouter02.sol
//   QuoterV2     0x5dEdB1F91F5F56177BB4D193aD281b33e4f13098
//     -> contracts/lens/QuoterV2.sol
//
// That mattered: PHASE4-ROUTING-2026-08-14.md records that Blockscout returns
// five contracts named `SwapRouter` belonging to four different factories, so
// neither address nor shape can be taken on the strength of a name. These two
// are the pair whose `factory()` owns the equity pools.

/// `exactInputSingle` on **SwapRouter02**, which differs from the original
/// SwapRouter in a way that silently breaks encoding if assumed: there is **no
/// `deadline` field**. The struct is exactly the seven below, and it is
/// `payable`.
export const uniswapV3SwapRouter02Abi = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        type: "tuple",
        name: "params",
        components: [
          { type: "address", name: "tokenIn" },
          { type: "address", name: "tokenOut" },
          { type: "uint24", name: "fee" },
          { type: "address", name: "recipient" },
          { type: "uint256", name: "amountIn" },
          { type: "uint256", name: "amountOutMinimum" },
          { type: "uint160", name: "sqrtPriceLimitX96" },
        ],
      },
    ],
    outputs: [{ type: "uint256", name: "amountOut" }],
  },
] as const;

/// `quoteExactInputSingle` on QuoterV2.
///
/// Two traps, both load-bearing:
///
/// 1. **The field order is not the router's.** Here `amountIn` comes *before*
///    `fee`; in `ExactInputSingleParams` above, `fee` comes before `recipient`
///    and `amountIn`. Encoding one struct with the other's ordering produces
///    valid-looking calldata that quotes a nonsense pool.
/// 2. **It is `nonpayable`, not `view`** — the quoter works by executing a swap
///    and reverting with the result. It therefore has to be reached with
///    `simulateContract`/`eth_call`, never `readContract`.
export const uniswapV3QuoterV2Abi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        type: "tuple",
        name: "params",
        components: [
          { type: "address", name: "tokenIn" },
          { type: "address", name: "tokenOut" },
          { type: "uint256", name: "amountIn" },
          { type: "uint24", name: "fee" },
          { type: "uint160", name: "sqrtPriceLimitX96" },
        ],
      },
    ],
    outputs: [
      { type: "uint256", name: "amountOut" },
      { type: "uint160", name: "sqrtPriceX96After" },
      { type: "uint32", name: "initializedTicksCrossed" },
      { type: "uint256", name: "gasEstimate" },
    ],
  },
] as const;

/// The fee tiers a V3 factory can have pools at, in basis-points-of-a-percent.
///
/// All four are quoted rather than a tier being assumed, because the deepest
/// tier is **not the same tier for every ticker** — measured on 4663: NVDA's
/// deepest USDG pool is 500, AAPL's and TSLA's is 3000, and TSLA's 500 pool
/// holds $23 and would be a disaster to route into. A live quote at 1,000 USDG
/// also came out 0.18% *better* on AAPL's thinner 500 tier than on its deeper
/// 3000 tier, so depth alone does not pick the winner either.
export const UNISWAP_V3_FEE_TIERS = [100, 500, 3000, 10000] as const;
