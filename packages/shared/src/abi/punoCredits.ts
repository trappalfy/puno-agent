// Matches contracts/src/PunoCredits.sol. `CreditsPurchased` is the only event
// the billing indexer reads; `nonce` is indexed because the watcher dedupes on
// it, and `tokenAmount` is what the treasury actually received (which differs
// from what was requested under a fee-on-transfer token).
export const punoCreditsAbi = [
  {
    type: "event",
    name: "CreditsPurchased",
    inputs: [
      { type: "address", name: "payer", indexed: true },
      { type: "uint256", name: "tokenAmount", indexed: false },
      { type: "uint256", name: "nonce", indexed: true },
      { type: "address", name: "treasury", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256", name: "amount" }],
    outputs: [{ type: "uint256", name: "received" }],
  },
  {
    type: "function",
    name: "token",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "treasury",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "minDeposit",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "depositNonce",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;
