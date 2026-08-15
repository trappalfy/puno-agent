# Equity oracles stop outside market hours — measured 2026-08-15

**This is a blocker-class finding and it needs a product decision, not a code fix I can pick
on my own.** Recorded before anything was changed.

## What was measured

Reading `latestRoundData().updatedAt` off chain 4663 on **Saturday 2026-08-15, 19:45 UTC**:

| Feed                 | Last updated             | Day | Age         |
| -------------------- | ------------------------ | --- | ----------- |
| USDG / USD           | 2026-08-15 15:23 UTC     | Sat | 4.37 h      |
| ETH / USD            | 2026-08-15 15:30 UTC     | Sat | 4.25 h      |
| BTC / USD            | 2026-08-15 15:47 UTC     | Sat | 3.97 h      |
| Robinhood AAPL / USD | 2026-08-14 **14:21** UTC | Fri | **29.39 h** |
| RHNVDA / USD         | 2026-08-14 **15:24** UTC | Fri | **28.35 h** |
| RHMSFT / USD         | 2026-08-14 **16:17** UTC | Fri | **27.46 h** |
| RHTSLA / USD         | 2026-08-14 **18:19** UTC | Fri | **25.43 h** |
| RHSPY / USD          | 2026-08-14 **13:46** UTC | Fri | **29.98 h** |

Every equity feed last published on **Friday between 13:46 and 18:19 UTC** — 09:46 to 14:19
Eastern, i.e. inside the US cash session. The crypto and stablecoin feeds published today.

**Equity oracles do not run outside market hours.** Nothing is broken; this is what these feeds
are.

## Why it was not seen before

`PHASE4-ROUTING-2026-08-14.md` recorded AAPL at 0.3 h, TSLA at 0 h and NVDA at 0.1 h. That
survey ran on **Friday 2026-08-14, during the session**. The measurement was correct and the
generalisation drawn from it was not.

CLAUDE.md states that "equity feeds republish on deviation (minutes), while pegged stablecoins
only publish on the 24h heartbeat". **The first half is true only intraday.** Out of session the
relationship inverts completely: the stablecoin is fresh and the equity is two days old.

`MockAggregatorV3` stamps `block.timestamp`, so — exactly as with the original staleness
finding — **no testnet run could ever have surfaced this.**

## What it means for the product

`AgentVault` carries `EQUITY_STALENESS = 1 hours`. Both `_nav()` and `_minAcceptableOut()` read
through it, and both revert on a stale feed. So for any vault holding an equity:

- From Friday close to Monday open, and every night in between, **`nav()` reverts**.
- `risk.ts` sees that and rejects with _"NAV unavailable — on-chain nav() would currently
  revert"_, so the agent stops before it reaches a model call.
- Rough arithmetic: the US cash session is 6.5 h × 5 days = 32.5 h of a 168 h week. **The agent
  can transact for roughly 19% of wall-clock time**, and is mute for the other 81%.

The uncomfortable part is that **the pools keep quoting the whole time.** Verified in the same
pass: AAPL, TSLA, NVDA, MSFT and SPY all quote against USDG right now, on a Saturday. Uniswap
will fill a weekend trade at a weekend price. The only thing standing between the agent and
trading a two-day-old mark is the oracle floor that is currently refusing to answer.

So the current behaviour is **safe and badly explained**, which is the same shape as the testnet
stale-feed problem: the agent declines, correctly, and the user reads it as broken.

## The decision, which is the owner's

**A — Keep `EQUITY_STALENESS = 1 hours`.** Correct risk posture: never act on a stale equity
mark. Cost: the product must say plainly that agents trade during market hours, and the UI must
render "market closed" rather than "NAV unavailable". Nothing about the contract changes.

> **Correction.** An earlier draft of this file also claimed the free tier "sends new visitors
> into it blind at weekends". That is wrong. The trial runs on testnet against
> `MockAggregatorV3`, which stamps `block.timestamp` when the answer is set, and
> `price-keeper.ts` forces a refresh immediately before every free-tier run. Testnet feeds are
> never stale, so the free tier cannot hit this at all. The problem is confined to mainnet.

**B — Widen it to cover the weekend (≈ 74 h).** Makes the agent continuously live. **Recommended
against**: it authorises trading a Friday mark on a Sunday, and an equity that gaps at Monday's
open would have been bought all weekend at a price the oracle floor was supposed to prevent.
This gives away the one safety property no competitor was found to have.

**C — Keep 1 h and teach the agent the calendar.** Track session hours off-chain; when the
market is closed, skip the tick before it costs a model call, and say so. Strictly more work
than A, and it is A plus honesty rather than an alternative to it.

**My recommendation: A now, C soon.** A is already the behaviour; what is missing is that
nothing in the product tells the truth about it, and the free tier currently sends new visitors
into it blind at weekends. B trades away the oracle floor for uptime and should not be taken
without deciding that explicitly.

## Decided and implemented, 2026-08-15

**A, plus C.** `EQUITY_STALENESS` stays at 1 hour — untouched, so the risk posture is exactly
what it was. What changed is that the system now knows the difference between "closed" and
"broken", and says so.

`packages/shared/src/market/session.ts` classifies the session **from the oracles themselves,
not from a trading calendar**. A hardcoded holiday table is wrong the first time an exchange
adds a half-day and it is wrong silently; the feeds are the ground truth the vault actually
enforces against. The signature measured above is what makes it readable — a closed market
leaves every equity stale and the quote fresh, while an oracle outage takes both down. So:

| Evidence                              | State                                 |
| ------------------------------------- | ------------------------------------- |
| every equity fresh                    | `open`                                |
| every equity stale, quote fresh       | `closed`                              |
| some stale, or the quote is stale too | `degraded` — never reported as closed |
| no equities allowlisted               | `no-equities`                         |

**`tick.ts` skips before the screening call** on `closed` and `no-equities`. Neither could ever
reach a trade — `_nav()` reverts on a stale feed, and an unlisted token is refused outright — so
the old behaviour charged the user a screening fee to be told it was Saturday. `protect` still
runs ahead of the check and is already stale-safe, so a stop-loss keeps its chance to fire.
`degraded` still ticks: a vault with three equities and one dead feed can trade the other two.

No audit row is written for a skip. The tick runs every 15 s, so a weekend would produce roughly
fifteen thousand identical "did nothing" entries per agent; the audit log records actions taken.

**`MarketBanner`** on the agent page says which of the four states it is in, reading the feeds
live rather than trusting the worker's last opinion — a vault whose worker is stopped would
otherwise show a stale view of staleness. Amber, not red, and silent when the market is open: a
banner that is always on screen stops being read exactly when it matters.

One consequence worth naming: a vault allowlisting only the quote token — every vault built
before B2 — now classifies as `no-equities` and stops ticking instead of paying for a screen
and a decision that `risk.ts` was always going to reject. That is a saving, not a regression.

## What this does not block

The ticker registry itself is unaffected — token addresses, feed addresses, decimals and pool
availability were all verified in the same pass and none of them depend on the session. B2 can
proceed; only the _hours_ question is open.
