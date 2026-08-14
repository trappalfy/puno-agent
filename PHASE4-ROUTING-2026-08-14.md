# Phase 4 — routing on Robinhood Chain mainnet

Everything in this file was read off chain 4663 on 2026-08-14, not inferred. Blocker **B1**
(`READINESS-2026-08-14.md`) is "swap calldata is hardcoded to the mock router". This is the
survey that decides what replaces it.

**Headline: mainnet has everything the product assumed it had.** Real tokenized equities, real
USDG pools, a real Uniswap V3 deployment, and a real 1inch AggregationRouterV6. Nothing here
has to be built or begged for — B1 is an integration, not a dependency hunt.

---

## What is actually deployed

| Thing | Address | Evidence |
|---|---|---|
| 1inch AggregationRouterV6 | `0x5A705DE8982235a7fa45bB83dCaCf03a211389C7` | verified on Blockscout, 24,542 bytes |
| UniswapV3Factory | `0x1f7d7550B1b028f7571E69A784071F0205FD2EfA` | verified; `pool.factory()` resolves to it |
| SwapRouter02 | `0xCaf681a66D020601342297493863E78C959E5cb2` | `factory()` matches the factory above |
| QuoterV2 | `0x5dEdB1F91F5F56177BB4D193aD281b33e4f13098` | `factory()` matches the factory above |
| USDG (quote) | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | "Global Dollar", **6 decimals** |
| WETH | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` | 409,064 holders |

The router address already in `packages/shared/src/network/config.ts` under
`NETWORKS.mainnet.routers.oneInch` is correct — confirmed, not assumed.

**Both `SwapRouter` and `QuoterV2` are ambiguous by name on Blockscout.** A search returns five
of each, belonging to at least four different factories. The two above are the only ones whose
`factory()` returns the factory that actually owns the equity pools. Resolve periphery
contracts by `factory()`, never by name.

### Tokenized equities are real

| Ticker | Address | `name()` | Holders |
|---|---|---|---|
| AAPL | `0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9` | Apple • Robinhood Token | 34,939 |
| TSLA | `0x322F0929c4625eD5bAd873c95208D54E1c003b2d` | Tesla • Robinhood Token | 29,348 |
| NVDA | `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC` | NVIDIA • Robinhood Token | 40,424 |
| MSFT | `0xe93237C50D904957Cf27E7B1133b510C669c2e74` | — | 23,333 |
| SPY  | `0x117cc2133c37B721F49dE2A7a74833232B3B4C0C` | — | 17,758 |

All 18 decimals. Note the quote token is **6** decimals and the equities are **18** — every
amount conversion crosses that boundary.

**Impersonators exist and they are close.** Searching "AAPL" also returns `loxAAPL` and
`AAPLCAT`; "TSLA" returns two different contracts both calling themselves `loxTSLA`. Symbol
lookup is not identity on this chain. B2's wizard must ship a pinned address list verified
against `name()`, never resolve a ticker to an address at runtime.

### Liquidity, measured

USDG side of each pool, at the fee tiers that exist:

| Pair | fee 100 | fee 500 | fee 3000 | fee 10000 |
|---|---|---|---|---|
| AAPL/USDG | — | $19,392 | **$74,330** | $700 |
| TSLA/USDG | — | $23 | **$83,689** | — |
| NVDA/USDG | $82 | **$496,782** | $35,586 | — |

Two things follow. **The deepest tier is not the same tier for every ticker** — NVDA's is 500,
AAPL's and TSLA's is 3000, and TSLA's 500 pool holds $23 and would be a disaster to route
into. And the depth is modest in absolute terms: at $74k on the AAPL side, a few thousand
dollars of notional moves the price. `maxNotionalPerTrade` and the slippage bound are load
bearing on mainnet in a way they never were against `MockRouter`, which filled at the oracle
price by construction.

### A live quote, executed

`QuoterV2.quoteExactInputSingle`, 1,000 USDG → AAPL:

| fee | AAPL out | implied price | ticks crossed |
|---|---|---|---|
| 500 | 3.254311842215277682 | $307.28 | 2 |
| 3000 | 3.248370081699029503 | $307.84 | 1 |

Quoting works, and the price is plausible. Note the thinner 500 tier quoted **better** on this
size despite holding a quarter of the liquidity — 0.18% better. So fee-tier choice is worth
real money and cannot be a constant.

---

## Why the vault already tolerates arbitrary router calldata

`AgentVault.executeTrade` (`contracts/src/AgentVault.sol:278-332`) does not parse
`swapCalldata` and does not need to. It:

- requires `tokenIn`, `tokenOut` and `router` to be allowlisted;
- requires `minOut >= _minAcceptableOut(...)`, the oracle-derived floor;
- snapshots `tokenOut` balance, `forceApprove`s exactly `amountIn`, calls the router, then
  **resets the approval to 0**;
- computes `amountOut` as its own balance delta and requires `amountOut >= minOut`;
- re-checks the position share against NAV afterwards.

It verifies the *outcome*, not the *instructions*. Calldata that routes somewhere else, or
sends the proceeds to another address, produces a zero balance delta and reverts. This is why
Phase 4 is an agent-side change and needs no contract change.

One consequence worth stating: `_minAcceptableOut` is an oracle floor, so a Chainlink feed for
each traded equity must exist on 4663 and be wired into the vault. **Not yet verified** — it
is the open question B2 has to answer, and it gates trading each specific ticker.

---

## The fork

The live traffic on the 1inch router is `swap(address executor, SwapDescription desc, bytes
data)` with executor `0x111116053F09d34a7Eae8102887004445176CA11` and pathfinder-generated
`data`. That shape cannot be constructed locally — it is the aggregator's output. So the two
options are genuinely different, not two spellings of the same thing.

**A — 1inch aggregator API.** `GET api.1inch.dev/swap/v6.1/4663/swap`, with `from` and
`receiver` both set to the vault and `disableEstimate=true` (the vault has no approval until
the transaction runs). Best execution: routes across tiers and venues, splits, multi-hops.
Costs: a third-party HTTP call inside the money path, an API key to hold and rotate, rate
limits on the free tier, and an outage mode where the agent cannot trade at all. Chain 4663
support is **unconfirmed** — `api.1inch.dev` returns 401 before it routes on chain id, so this
cannot be settled without a key.

**B — Uniswap V3 directly.** `QuoterV2` for the quote, `SwapRouter02.exactInputSingle` for the
calldata, both built locally. No external dependency, no key, deterministic and testable
offline against a fork. We choose the fee tier by quoting the tiers that exist — the table
above shows that is a handful of `eth_call`s, and it is exactly what the differing best tiers
per ticker require. Costs: single-hop only unless path selection is implemented, so a pair
with no direct USDG pool cannot be traded, and execution is at best equal to the aggregator's.

**C — B now, A as an optional upgrade behind the same interface.** Direct Uniswap is enough for
USDG↔equity, which is the entire strategy today; the adapter seam means adding the aggregator
later is additive rather than a rewrite, and gives a fallback if 1inch turns out not to serve
4663.

Either way the first commit is the same: replace the hardcoded `mockRouterAbi` encoding in
`apps/agent/src/loop/simulate.ts` with a router-adapter interface, keeping the mock as the
testnet implementation so 46630 keeps working exactly as it does today.

---

## Price feeds — the B2 oracle question, answered

**111 Chainlink `EACAggregatorProxy` contracts are deployed on 4663, and they cover the
equities.** `_minAcceptableOut` and `_nav()` both need a feed per traded token; the feeds
exist, so no ticker is blocked on oracle availability.

Every asset is deployed as **two proxies over one underlying aggregator** — both addresses in
each pair return the same answer and the same `aggregator()`. Either works; pin one and do not
assume the pair means primary/fallback.

Read live:

| Feed | Proxy | Answer | Age |
|---|---|---|---|
| Robinhood AAPL / USD | `0x6B22A786bAa607d76728168703a39Ea9C99f2cD0` | $306.83 | 0.3 h |
| RHTSLA / USD | `0x4A1166a659A55625345e9515b32adECea5547C38` | $348.58 | 0 h |
| RHNVDA / USD | `0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15` | $226.48 | 0.1 h |
| **USDG / USD** | `0x61B7e5650328764B076A108EFF5fa7282a1B9aD2` | $1.00 | **22.4 h** |

**CLAUDE.md's per-feed staleness decision is re-confirmed by live data.** The quote feed is
22.4 hours stale while the equity feeds are minutes old — the same ~22 h that originally forced
`PriceFeed.maxStaleness` to be per-feed. A single global threshold would still be wrong today,
and `QUOTE_STALENESS = 26 hours` / `EQUITY_STALENESS = 1 hours` remain correct.

**The pool price tracks the oracle.** QuoterV2 implied $307.28 (fee 500) and $307.84 (fee 3000)
against the oracle's $306.83 — within 0.15–0.33%. So `_minAcceptableOut`'s oracle floor is
actually reachable through these pools, which is the thing that could have quietly made every
mainnet trade revert. It does not.

**Feed naming is inconsistent and cannot be parsed.** Three conventions coexist:
`Robinhood AAPL / USD`, `RHNVDA / USD`, and `Robinhood DELL-USD`. Ticker → feed must be a
hand-pinned table, exactly like ticker → token address.

### Full equity feed registry (first proxy of each pair)

| Ticker | Feed proxy |
|---|---|
| AAPL | `0x6B22A786bAa607d76728168703a39Ea9C99f2cD0` |
| AMZN | `0x9244830430bC7D9C9A48dd47603F24AD61f7c56e` |
| ASML | `0xB4106147E8cce40b7d46124090d373A71b70f87D` |
| BABA | `0x62Cc8F9b5f56a33c9C8A60c8B92779f523c4E984` |
| CLSK | `0x810c12D3a554Bc47fd39597Fe3b3AAC4941F50eF` |
| COIN | `0xA3a468A452940B7D6b69991207B508c609a98Ef2` |
| CRCL | `0x6652eDf64bA3731C4F2D3ce821A0Fb1f1f6b482a` |
| CRWV | `0xe1b3aABCAFAd1c94708dc1367dcfF8Aa4407487C` |
| DELL | `0x1C6c8cADBe02E19129c39dDB92281cE4c0bf206b` |
| EWY | `0x26bca2a89D2D23787ada8F91B849608c51A26977` |
| GME | `0x42A4652D447A5B0bccF3B265bE8530b85A33b3A2` |
| GOOGL | `0xF6f373a037c30F0e5010d854385cA89185AE638b` |
| IONQ | `0x926D7D95E554D1e671EB2C0d238fe37a2C23A64E` |
| META | `0x7C38C00C30BEe9378381E7B6135d7283356D71b1` |
| MSTR | `0x396118bdFB181e6240E74D243F266B061c0edc3D` |
| NBIS | `0xE1D87B116Ba0fe898998f1D140339D1fA1E09705` |
| ORCL | `0x2a07f8d87d369Bd8Bc36472337ae02d512a7b5e5` |
| PLTR | `0x820ABedFF239034956B7A9d2F0a331f9F075eB4c` |
| QQQ | `0x80901d846d5D7B030F26B480776EE3b29374C2ae` |
| RGTI | `0xC9C477AEfF7eD1BB89B84F7907E2e11707491466` |
| RKLB | `0x045477BF65Aef6f4F2386ad0164579e48381CC74` |
| SGOV | `0xa0DF4ee0fFf975306345875E3548Fcc519577A11` |
| SLV | `0x209b73908e92Ae021826eD79609845451Ecba2ce` |
| SPCX | `0x42a95341ff361e81fd934F39943c5C98F6991844` |
| TSM | `0x874cF94aa8eC88Fd9560094dD065f2fB3E41Fc2F` |
| USAR | `0xA994d3684e8400A6c8078226925779FdeE682DD9` |
| AMD | `0xF6d57763DFa625F4A413485261Ab2E71Ff4304CF` (RHAMD) |
| INTC | `0x3f390C5C24628Ac7C489515402235FeAD71D1913` (RHINTC) |
| MSFT | `0xaD6D88eab22aa4867Efe807a5311Ed64962f740D` (RHMSFT) |
| MU | `0x5b40F4E78FA58B60a4F59b8cc8cB8d2Fb0690467` (RHMU) |
| NVDA | `0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15` (RHNVDA) |
| SNDK | `0xfb133Fa4B7b385802B693a293606682Df47109A3` (RHSNDK) |
| SPY | `0x319724394D3A0e3669269846abE664Cd621f9f6A` (RHSPY) |
| TSLA | `0x4A1166a659A55625345e9515b32adECea5547C38` (RHTSLA) |
| USO | `0x75a9c76Ef439e2C7c2E5a34Ab105EcFe3766431c` (RHUSO) |

Quote and collateral feeds: **USDG** `0x61B7e5650328764B076A108EFF5fa7282a1B9aD2`, USDC
`0x9e6f4605992a899eE2999999F3Ec80C41F452546`, USDT `0x84dD63d9162DaA201c4Ea0a6dDbfBFB274F4514D`,
USDE `0xb9fB4e65744E4178894f7C61CF80E8a48A5f224a`, ETH `0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9`,
BTC `0xa2c5184bF03d373Dc9dE4876eb4Bce595B460251`, LINK `0xB7F054718bD802716FA7bD5944Df2f50a8D0424E`.

Note the token list is wider than the feed list and vice versa — a feed exists for tickers
whose ERC-20 was not checked here (ORCL, PLTR, GME…), and both must exist before a ticker can
be traded. Pair them up before writing the allowlist.

---

## Not yet checked

- Whether 1inch's API serves chain 4663. `api.1inch.dev` answers **401 before** it routes on
  chain id, so this needs a key to settle and cannot be inferred.
- Whether every equity has a direct USDG pool, or some need multi-hop. Only AAPL, TSLA and NVDA
  were surveyed.
- The ERC-20 address for each ticker that has a feed — only AAPL, TSLA, NVDA, MSFT and SPY were
  resolved, and only AAPL/TSLA/NVDA had `name()` confirmed.

## Method notes

The public RPC sits behind Cloudflare and **rejects batched JSON-RPC POSTs** — a 111-call batch
comes back as an HTML interstitial regardless of user agent, while `cast` gets through one call
at a time. Anything that enumerates chain state here has to be sequential. Blockscout's REST
API is not challenged and paginates normally.
