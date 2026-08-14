export type Address = `0x${string}`;

export type NetworkKey = "mainnet" | "testnet";

export interface NetworkConfig {
  key: NetworkKey;
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  faucetUrl: string | null;
  isTestnet: boolean;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  tokens: {
    weth: Address;
    usdg: Address;
  };
  routers: {
    oneInch: Address;
  };
  // null until a VaultFactory is actually deployed and verified on this
  // network — see contracts/script/DeployTestnet.s.sol. Never fill this with
  // an address from a throwaway local Anvil run; those aren't persistent and
  // would silently point the wizard at a chain that no longer exists.
  vaultFactory: Address | null;
  // Billing contracts, same rule as vaultFactory. punoToken is the ERC-20 the
  // credit balance is topped up with; punoCredits is the payment contract whose
  // CreditsPurchased events the watcher indexes. Both null until PUNO launches
  // — every billing path checks for null and says so rather than half-working.
  punoToken: Address | null;
  punoCredits: Address | null;
}

// Verified against https://docs.robinhood.com/chain/connecting (2026-08-11).
export const NETWORKS: Record<NetworkKey, NetworkConfig> = {
  mainnet: {
    key: "mainnet",
    name: "Robinhood Chain",
    chainId: 4663,
    rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    explorerUrl: "https://robinhoodchain.blockscout.com",
    faucetUrl: null,
    isTestnet: false,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    tokens: {
      weth: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
      usdg: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
    },
    routers: {
      oneInch: "0x5A705DE8982235a7fa45bB83dCaCf03a211389C7",
    },
    vaultFactory: null,
    punoToken: null,
    punoCredits: null,
  },
  testnet: {
    key: "testnet",
    name: "Robinhood Chain Testnet",
    chainId: 46630,
    rpcUrl: "https://rpc.testnet.chain.robinhood.com",
    explorerUrl: "https://explorer.testnet.chain.robinhood.com",
    faucetUrl: "https://faucet.testnet.chain.robinhood.com",
    isTestnet: true,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    tokens: {
      // Real testnet liquidity does not exist, so DeployTestnet stands up mocks
      // instead — see contracts/script/DeployTestnet.s.sol. `usdg` below is the
      // deployed MockStockToken, not Global Dollar. Nothing reads these fields
      // (the quote token is read live from VaultFactory.quoteToken); they are
      // here so the recorded addresses match what is actually on chain.
      // weth has no testnet counterpart and is still the mainnet address.
      weth: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
      usdg: "0x5fecF7bA6365E6763b8984c43307B417A498aD40",
    },
    routers: {
      // NOT 1inch on testnet — this is the deployed MockRouter. The field keeps
      // its mainnet name because the agent-creation wizard reads exactly this
      // one field to fill `allowedRouters` (apps/web .../agents/new/page.tsx).
      // Leaving the mainnet 1inch address here would allowlist a router that
      // does not exist on 46630, and every trade would revert.
      oneInch: "0x58fc3D03E57aC4b909b04356CF9Ae8b420885719",
    },
    // Deployed 2026-08-14 by DeployTestnet, verified on chain (bytecode present,
    // VaultFactory.quoteToken -> usdg above, PunoCredits.token -> punoToken).
    vaultFactory: "0x486901cBa710C5Fb1032AB1bB25d190E3f845998",
    punoToken: "0x1A480B089d8A5E2B77A1bD8908aBFF9bB6af21da",
    punoCredits: "0xD0D4B491D8980cd49b0eCf151ad30f8f779D74f6",
  },
};

export const DEFAULT_NETWORK: NetworkKey = "testnet";

export function getNetwork(key: NetworkKey = DEFAULT_NETWORK): NetworkConfig {
  return NETWORKS[key];
}

export function getNetworkByChainId(chainId: number): NetworkConfig | undefined {
  return Object.values(NETWORKS).find((network) => network.chainId === chainId);
}
