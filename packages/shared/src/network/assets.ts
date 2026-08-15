import type { Address, NetworkKey } from "./config.js";

/// One asset a vault can be configured to trade: the ERC-20, its Chainlink
/// feed, and the evidence that this pairing was checked rather than guessed.
export interface TradableAsset {
  ticker: string;
  token: Address;
  decimals: number;
  feed: Address;
  /// Read off chain at pin time so the entry can be re-verified rather than
  /// trusted. `tokenName` is `name()` on the ERC-20; `feedDescription` is
  /// `description()` on the aggregator.
  ///
  /// This exists because **symbol lookup is not identity on Robinhood Chain**.
  /// Searching "AAPL" also returns `loxAAPL` and `AAPLCAT`; "TSLA" returns two
  /// different contracts both calling themselves `loxTSLA`. A registry keyed on
  /// symbol with no recorded name is one typo away from allowlisting an
  /// impersonator into somebody's vault.
  tokenName: string;
  feedDescription: string;
}

export interface NetworkAssets {
  /// The quote asset. Held separately because it is the denominator of every
  /// trade and carries the longer staleness window — pegged feeds publish on a
  /// 24h heartbeat, so 26h rather than 1h. See CLAUDE.md.
  quote: TradableAsset;
  equities: TradableAsset[];
}

/// Pinned token/feed registry, per network.
///
/// **Every address below was read off chain**, never copied from a deploy log
/// or resolved from a ticker at runtime — mainnet on 2026-08-15 via `name()`,
/// `symbol()`, `decimals()` and the aggregator's `description()`, and testnet by
/// walking the deployed demo vault's own `allowedTokens`/`priceFeeds`.
///
/// A ticker only belongs here once **both** halves exist and a direct pool
/// against the quote asset was quoted: `UniswapV3Adapter` is single-hop, so a
/// pair with no direct pool is untradable no matter how good its feed is. All
/// five mainnet entries quoted against USDG on 2026-08-15.
///
/// **Read `EQUITY-FEED-HOURS-2026-08-15.md` before assuming these feeds are
/// live.** Equity oracles here publish only during the US cash session; out of
/// hours they are 25–30 h stale and the vault's `_nav()` reverts. That is a
/// property of the feeds, not of this table, and it is an open product decision.
export const TRADABLE_ASSETS: Record<NetworkKey, NetworkAssets> = {
  mainnet: {
    quote: {
      ticker: "USDG",
      token: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
      decimals: 6,
      feed: "0x61B7e5650328764B076A108EFF5fa7282a1B9aD2",
      tokenName: "Global Dollar",
      feedDescription: "USDG / USD",
    },
    // Ordered by pool depth against USDG. Note the feed descriptions use three
    // different naming conventions ("Robinhood AAPL / USD", "RHTSLA / USD",
    // and elsewhere "Robinhood DELL-USD"), which is why ticker -> feed has to
    // be a hand-pinned table and cannot be parsed.
    equities: [
      {
        ticker: "AAPL",
        token: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9",
        decimals: 18,
        feed: "0x6B22A786bAa607d76728168703a39Ea9C99f2cD0",
        tokenName: "Apple • Robinhood Token",
        feedDescription: "Robinhood AAPL / USD",
      },
      {
        ticker: "NVDA",
        token: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
        decimals: 18,
        feed: "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15",
        tokenName: "NVIDIA • Robinhood Token",
        feedDescription: "RHNVDA / USD",
      },
      {
        ticker: "TSLA",
        token: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d",
        decimals: 18,
        feed: "0x4A1166a659A55625345e9515b32adECea5547C38",
        tokenName: "Tesla • Robinhood Token",
        feedDescription: "RHTSLA / USD",
      },
      {
        ticker: "MSFT",
        token: "0xe93237C50D904957Cf27E7B1133b510C669c2e74",
        decimals: 18,
        feed: "0xaD6D88eab22aa4867Efe807a5311Ed64962f740D",
        tokenName: "Microsoft • Robinhood Token",
        feedDescription: "RHMSFT / USD",
      },
      {
        ticker: "SPY",
        token: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C",
        decimals: 18,
        feed: "0x319724394D3A0e3669269846abE664Cd621f9f6A",
        tokenName: "SPDR S&P 500 ETF Trust • Robinhood Token",
        feedDescription: "RHSPY / USD",
      },
    ],
  },
  testnet: {
    // Deployed by DeployTestnet as mocks; addresses read back from the demo
    // vault's own allowlist on 2026-08-15 rather than from the deploy console
    // output, so they reflect what is actually wired up.
    quote: {
      ticker: "USDG",
      token: "0x5fecF7bA6365E6763b8984c43307B417A498aD40",
      decimals: 6,
      feed: "0x6C11e641fC415e0e7Fca839e5F680489F1f509a4",
      tokenName: "Mock Global Dollar",
      feedDescription: "Mock USDG / USD",
    },
    equities: [
      {
        ticker: "AAPL",
        token: "0xf9e5e3ac9E2f6B43D871A464D9BeDe1df3C9F28f",
        decimals: 18,
        feed: "0x59B85Fe4F399e76C926F8eD3D71101CF3eBe6D9f",
        tokenName: "Mock Apple Stock",
        feedDescription: "Mock AAPL / USD",
      },
      {
        ticker: "TSLA",
        token: "0x57b35e8D7F2Bfd27B8D26cDeB7a36eb27Ce5a679",
        decimals: 18,
        feed: "0x25B172C3bCe776a1c508881D4442E34430E00262",
        tokenName: "Mock Tesla Stock",
        feedDescription: "Mock TSLA / USD",
      },
    ],
  },
};

/// Staleness windows the vault stores per feed, in seconds.
///
/// Two, not one, and they must not be collapsed. Measured repeatedly: a pegged
/// stablecoin publishes on a 24h heartbeat and reads as ~22h stale most of the
/// time, while an equity publishes on deviation — during market hours. A single
/// global threshold is wrong for one of them whichever value it takes.
///
/// These mirror `QUOTE_STALENESS` / `EQUITY_STALENESS` in the deploy scripts and
/// are bounded by `AgentVault.MAX_STALENESS_LIMIT` (2 days).
export const QUOTE_STALENESS_SECONDS = 26 * 60 * 60;
export const EQUITY_STALENESS_SECONDS = 60 * 60;

export function getAssets(network: NetworkKey): NetworkAssets {
  return TRADABLE_ASSETS[network];
}
