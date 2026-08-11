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
      // Testnet liquidity is not guaranteed — see contracts/mocks/ (Phase 2).
      // Placeholders until real testnet addresses are confirmed at deploy time.
      weth: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
      usdg: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
    },
    routers: {
      oneInch: "0x5A705DE8982235a7fa45bB83dCaCf03a211389C7",
    },
  },
};

export const DEFAULT_NETWORK: NetworkKey = "testnet";

export function getNetwork(key: NetworkKey = DEFAULT_NETWORK): NetworkConfig {
  return NETWORKS[key];
}

export function getNetworkByChainId(chainId: number): NetworkConfig | undefined {
  return Object.values(NETWORKS).find((network) => network.chainId === chainId);
}
