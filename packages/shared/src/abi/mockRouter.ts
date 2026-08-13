// Matches contracts/mocks/MockRouter.sol. Testnet-only stand-in for a real
// DEX aggregator (see contracts/script/DeployTestnet.s.sol for why — no
// verified Uniswap v3 addresses exist on chain 46630 as of Phase 2). Real
// router integration (1inch, Uniswap) is Phase 4 scope.
export const mockRouterAbi = [
  {
    type: "function",
    name: "swap",
    stateMutability: "nonpayable",
    inputs: [
      { type: "address", name: "tokenIn" },
      { type: "address", name: "tokenOut" },
      { type: "uint256", name: "amountIn" },
      { type: "uint256", name: "amountOut" },
      { type: "address", name: "to" },
    ],
    outputs: [],
  },
] as const;
