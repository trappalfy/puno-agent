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
  // Uniswap V3 periphery, or null where no V3 deployment exists (testnet uses
  // MockRouter instead — see `routers.oneInch` there).
  //
  // Resolved by `factory()`, never by name: Blockscout returns five contracts
  // called `SwapRouter` and five called `QuoterV2` on 4663, belonging to at
  // least four different factories, and only the pair below answers with the
  // factory that owns the equity/USDG pools. See PHASE4-ROUTING-2026-08-14.md.
  // `factory` is kept alongside them so that check can be re-run rather than
  // trusted.
  uniswapV3: {
    factory: Address;
    swapRouter02: Address;
    quoterV2: Address;
  } | null;
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
  /// Decimals of `punoToken`. Recorded rather than read from the chain, because
  /// every money conversion needs it synchronously and an RPC hiccup must not
  /// turn into a mis-priced credit.
  ///
  /// It was hardcoded as a literal `18` in five separate places — the deposit
  /// indexer, both billing routes, the top-up card and the balance formatter —
  /// and nothing anywhere called `decimals()`. A token launched with 9 or 6
  /// would have credited every depositor off by orders of magnitude, silently,
  /// in the direction of giving away service. One field so the five cannot
  /// disagree, and `preflight` asserts it against the deployed token's own
  /// `decimals()` before mainnet opens.
  punoDecimals: number;
  // The vault the free tier runs against, read-only. A free run is a paper
  // run — it reads this vault's real portfolio and prices, screens, decides,
  // assesses risk and simulates against it, and never broadcasts. Sharing one
  // vault is what removes the faucet, the four signatures and the testnet USDG
  // from the path between "connected a wallet" and "watched the agent think".
  //
  // `agent` must equal the vault's on-chain `agent`, because guard() compares
  // them before anything else runs. Nothing signs with it — a paper run has
  // nothing to sign — so this is a public address and never a key.
  //
  // null means the network has no demo vault and the free tier is unavailable
  // there, which is the correct state for mainnet: free runs belong on testnet.
  demoVault: { address: Address; agent: Address } | null;
  /// The address Puno's worker signs trades with, and the address every vault
  /// created here is armed with via `setAgent`.
  ///
  /// This is the public half of the worker's `AGENT_PRIVATE_KEY` and must never
  /// be anything else — a key does not belong in this file or in a browser.
  ///
  /// Why one shared address rather than a key per vault: the worker ticks every
  /// live agent in the database from a single process holding a single key
  /// (apps/agent/src/main.ts, chain/client.ts), while `AgentVault` checks
  /// `msg.sender == agent` on every trade. The wizard used to generate a fresh
  /// key in the browser and hand it to the user, which meant the hosted worker
  /// could not sign for any vault it created — every `executeTrade` would have
  /// reverted with "not authorized". Arming vaults with the worker's own address
  /// is what makes the hosted product able to trade at all, and it keeps us from
  /// ever holding a user's key.
  ///
  /// What it can and cannot do is bounded by the contract, not by trust: the
  /// agent may only swap allowlisted tokens through allowlisted routers inside
  /// the owner's policy, and `withdraw` takes the owner's signature. A vault
  /// owner revokes by calling `setAgent` themselves, and the grant expires on
  /// its own regardless.
  ///
  /// null means the network has no worker key yet and the wizard refuses to
  /// create agents there, the same way a null `vaultFactory` does.
  serviceAgent: Address | null;
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
    // Verified on chain 2026-08-14: both periphery contracts report this
    // factory, and their ABIs were read from the verified source of the
    // deployed bytecode rather than the upstream repo (SwapRouter02.sol from
    // swap-router-contracts, so `exactInputSingle` carries no `deadline`).
    uniswapV3: {
      factory: "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA",
      swapRouter02: "0xCaf681a66D020601342297493863E78C959E5cb2",
      quoterV2: "0x5dEdB1F91F5F56177BB4D193aD281b33e4f13098",
    },
    vaultFactory: null,
    punoToken: null,
    punoCredits: null,
    // The value the product is built around, and therefore a *requirement* on
    // the token rather than an observation of it — PUNO must launch with 18.
    // Verified against the deployed token by `preflight` before mainnet opens.
    punoDecimals: 18,
    // Deliberately null. The free tier is a testnet demonstration; running it
    // against a mainnet vault would spend real gas on simulations for people
    // who have not paid for anything.
    demoVault: null,
    // Its own key, generated 2026-08-15 and never used on any other chain —
    // deliberately not the testnet worker address, which has signed on a
    // throwaway chain and lived in a throwaway .env. The private half was
    // written straight to a gitignored file and has never been through a
    // clipboard or a chat; the worker proves the pair at boot and refuses to
    // start on a mismatch (apps/agent/src/chain/serviceAgent.ts).
    //
    // Holds no ETH yet, so it cannot pay gas for a trade. That is fine until
    // mainnet has a VaultFactory — the wizard's factory gate fires first — but
    // it must be funded before the first live vault, or every executeTrade
    // fails on gas rather than on anything meaningful.
    serviceAgent: "0x0aCd6ea59305B882FDC42e78b209Ec9bC39926a8",
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
    // No Uniswap V3 deployment on 46630 — that is the whole reason MockRouter
    // exists. Null rather than the mainnet addresses: pointing the quoter at a
    // contract that is not there would fail as an opaque revert on every tier.
    uniswapV3: null,
    // Deployed 2026-08-14 by DeployTestnet, verified on chain (bytecode present,
    // VaultFactory.quoteToken -> usdg above, PunoCredits.token -> punoToken).
    vaultFactory: "0x486901cBa710C5Fb1032AB1bB25d190E3f845998",
    punoToken: "0x1A480B089d8A5E2B77A1bD8908aBFF9bB6af21da",
    punoCredits: "0xD0D4B491D8980cd49b0eCf151ad30f8f779D74f6",
    // DeployTestnet stands the mock up as MockStockToken("Mock Puno Token",
    // "PUNO", 18), so this matches what is actually deployed on 46630.
    punoDecimals: 18,
    // The vault DeployTestnet stands up, funded and armed by hand on
    // 2026-08-14 (the deploy script does not call setAgent — see CLAUDE.md).
    // `agent` is read back from the chain and must stay equal to
    // AgentVault.agent(); guard() rejects the run outright if it drifts, which
    // is the failure mode we want rather than a silent no-op.
    demoVault: {
      address: "0xcFA434255f47F4C8777043540d253CEDFb36B5e9",
      agent: "0x389AA9c066854a1e1A62a9F49910760a8D010adD",
    },
    // The same address the demo vault above is armed with, and deliberately so:
    // there is one worker on this network holding one key, and the demo vault
    // was already arming it by hand on 2026-08-14. Vaults the wizard creates now
    // arm the same address, which is what lets one worker tick all of them.
    serviceAgent: "0x389AA9c066854a1e1A62a9F49910760a8D010adD",
  },
};

export const DEFAULT_NETWORK: NetworkKey = "testnet";

export function getNetwork(key: NetworkKey = DEFAULT_NETWORK): NetworkConfig {
  return NETWORKS[key];
}

export function getNetworkByChainId(chainId: number): NetworkConfig | undefined {
  return Object.values(NETWORKS).find((network) => network.chainId === chainId);
}
