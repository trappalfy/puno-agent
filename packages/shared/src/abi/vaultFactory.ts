// Matches contracts/src/VaultFactory.sol.
export const vaultFactoryAbi = [
  {
    type: "function",
    name: "quoteToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "vaultOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "computeVaultAddress",
    stateMutability: "view",
    inputs: [{ type: "address", name: "owner_" }],
    outputs: [{ type: "address", name: "predicted" }],
  },
  {
    type: "function",
    name: "createVault",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ type: "address", name: "vault" }],
  },
  {
    type: "event",
    name: "VaultCreated",
    inputs: [
      { type: "address", name: "owner", indexed: true },
      { type: "address", name: "vault", indexed: false },
    ],
  },
] as const;
