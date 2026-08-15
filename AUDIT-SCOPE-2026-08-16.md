# Audit scope — Puno contracts

> **Status: not currently engaged.** The audit was deferred by decision on 2026-08-16 — see
> `LAUNCH-CHECKLIST.md` for the reasoning and the trigger to revisit. This document is kept
> send-ready rather than archived, because the work of writing it is already paid for and the
> decision it supports is meant to be reversible. Re-check the freeze reference below before
> sending; everything else stands.

**For external reviewers.** This is the package that goes out for quotes and then to whoever is
engaged. Written 2026-08-16. Keep it current; a scope document that drifts from the tree is worse
than none, because it is trusted.

Freeze reference: **`3b64271`** (2026-08-16), which removed the dormant fee mechanism described in
§5.1 — the last intended change. Nothing in `contracts/` has moved since. If the tree moves before
an engagement starts, update this line and say what moved: an auditor who reviews a commit that is
no longer the one being deployed has produced a report about nothing.

```bash
cd contracts
forge build          # solc 0.8.28, optimizer 200 runs, via_ir = true
forge test           # 80 tests, 0 skipped, 6 suites
```

`via_ir` is on because `executeTrade` hits "stack too deep" without it. Worth knowing up front:
it changes codegen enough that findings about stack layout or optimizer behaviour should be
reproduced with the same setting.

---

## 1. In scope

| File                   | nSLOC | External / public fns | What it is                                      |
| ---------------------- | ----: | --------------------: | ----------------------------------------------- |
| `src/AgentVault.sol`   |   301 |                    16 | Per-user non-custodial vault. The whole product |
| `src/PunoCredits.sol`  |    54 |                     4 | Takes PUNO payments, emits a credit event       |
| `src/VaultFactory.sol` |    34 |                     2 | CREATE2 deployer for vaults                     |
| **Total**              |   389 |                    22 |                                                 |

Dependencies are pinned by commit in `foundry.lock` and are **not** in scope:
OpenZeppelin `v5.7.0` (`cab19933`), forge-std `v1.16.2` (`bf647bd6`).

### Out of scope

- `contracts/mocks/` — `MockAggregatorV3`, `MockRouter`, `MockStockToken`. Test fixtures, deployed
  to testnet only, never to mainnet. `DeployMainnet` deploys none of them, deliberately: putting a
  fake "TSLA" and a fake router at real addresses on a real chain is a trap for whoever finds them.
- `contracts/script/` — deploy scripts. Not deployed code. Worth a skim for the guards described in
  §6, but they should not carry audit hours.
- The off-chain system (`apps/agent` worker, `apps/web`, Postgres credit ledger). Its trust
  relationship with the contracts is described in §3 because it changes what "compromised" means —
  but its code is not being audited here.

---

## 2. What the system is

A user deploys their own `AgentVault` through `VaultFactory`, funds it with USDG, and grants a
time-boxed agent key. An off-chain worker proposes swaps; the vault enforces the user's policy on
chain and reverts anything outside it. The user pays for the service separately, in PUNO, through
`PunoCredits` — that path never touches the vault.

One vault per user. Vaults are independent: they share no state, no pooled funds, and no upgrade
path. **There is no proxy and no upgradeability anywhere.** A deployed vault's code is final.

---

## 3. Actors and trust model

| Actor             | Is                                  | Can                                                                                 |
| ----------------- | ----------------------------------- | ----------------------------------------------------------------------------------- |
| **Vault owner**   | The end user's own wallet           | Everything owner-gated below, including `withdraw`. Sole party who can remove funds |
| **Agent**         | Puno's worker key, shared by design | `executeTrade` only, and only while `block.timestamp < agentExpiry`                 |
| **Anyone**        | —                                   | `deposit` (into someone else's vault), all views, `createVault`                     |
| **Credits owner** | Intended: a multisig                | `setTreasury`, `setMinDeposit`, `sweep` on `PunoCredits`. Not related to any vault  |

Owner-gated on `AgentVault`: `withdraw`, `setAgent`, `revokeAgent`, `setPriceFeed`, `setPolicy`,
`pause`, `unpause`. `executeTrade` accepts `agent` **or** `owner`. Everything else is a view.

**The agent key is shared across every vault.** One worker process holds one key and signs for all
of them. This is the most load-bearing assumption in the design and the thing most worth attacking:
we claim that a full compromise of that key lets an attacker trade every vault **within each
owner's own policy** and nothing more — no withdrawal, no token or router outside the allowlists,
no fill worse than the oracle floor, no size above the caps. If any path exists from a compromised
agent key to value leaving a vault, that is the finding that matters most in this engagement.

Second: the worker is a normal web service on ordinary infrastructure. Treat "the agent key is
hostile" as a live scenario, not a hypothetical.

---

## 4. Invariants we assert — please attack these

1. **Only the owner can remove value.** `withdraw` is the sole path out of the vault, and it is
   `onlyOwner`. No qualifier: the second path that used to exist was deleted for this reason
   (§5.1). `executeTrade` swaps between allowlisted tokens and cannot send to an arbitrary
   recipient.
2. **`executeTrade` cannot exceed the policy.** Per-trade notional cap, rolling 24h notional cap,
   max position share, minimum seconds between trades, and slippage versus the oracle price. Each
   is checked on chain, and a violating trade reverts regardless of who proposed it.
3. **The oracle floor is never above fair value.** `_minAcceptableOut` is a floor the fill must
   clear; an error that rounds it up rejects honest fills, one that rounds it down loses a fraction
   of a basis point. Property-tested with `assertLe` and no tolerance.
4. **A stale feed stops everything.** `_nav()` reverts rather than valuing a position at a dead
   price. Staleness is **per feed** (`PriceFeed.maxStaleness`, capped at `MAX_STALENESS_LIMIT =
2 days`), not global — see §7 for why a single threshold provably cannot work here.
5. **Router and token allowlists are exhaustive.** The agent cannot reach a contract or an asset
   the owner did not list.
6. **`pause()` stops `executeTrade` immediately** and is owner-only.
7. **`PunoCredits` credits exactly once per `depositNonce`,** and reports what the treasury actually
   received rather than what was requested (fee-on-transfer safety).
8. **`PunoCredits` never holds user funds.** `deposit` forwards to the treasury in the same call.

---

## 5. What we already know

Stated in full deliberately. Rediscovering our own known issues is the most expensive way to spend
an engagement, and hiding them is the fastest way to get a report we cannot trust.

### 5.1 Dead fee mechanism — removed 2026-08-16 (`3b64271`)

Recorded because it explains the shape of the diff if you look at history, and because the reason
matters to invariant 4.1.

`setFeeConfig` / `collectFee` implemented a high-water-mark performance fee in the quote token. It
was never active — `feeBps` was 0 in every deployment and nothing set it — and it could not serve
the billing model either, since `setFeeConfig` was `onlyOwner` and the owner is the _user_.

It was deleted rather than left dormant because `collectFee` transferred the quote token out,
making it a second path by which value left a vault. It also carried a known accounting gap: a
deposit made after the high-water mark was initialised read as appreciation and would have been
charged as profit. Removing it took two external functions, four storage slots, two events, one
constant and a 120-line test file with it.

Nothing replaces it. Puno charges per action in PUNO through `PunoCredits`, which never touches
`AgentVault`.

### 5.2 Found by our own fuzzing, already fixed (`7bd7065`)

Both were unreachable by example tests, and are listed so the fixes get scrutinised rather than
trusted:

- `setPriceFeed` accepted a feed reporting **more than 18 decimals**. `_normalizedPrice` scales by
  `10 ** (18 - priceDecimals)`, so the configuring call would have succeeded and every subsequent
  price read — `nav()` included — would have reverted forever with an unmessaged arithmetic panic.
  Now rejected at configuration time.
- The rolling 24h window downcast notional to `uint192` **unchecked**, bounded only by a
  `uint256` policy value, so a large enough trade would truncate to a small recorded one and walk
  past the daily cap. Threshold is absurd (~6.3e39 USD at 1e18 scale); "unreachable" and
  "unchecked" are different claims and only one was enforced.

### 5.3 Design decisions that look like bugs and are not

- **Per-feed staleness, not one constant.** Measured live: USDG/USD was 22.4h stale while
  AAPL/TSLA/NVDA were 0–0.3h. Deployed values are `QUOTE_STALENESS = 26 hours`,
  `EQUITY_STALENESS = 1 hour`. Collapsing them reverts `_nav()` roughly 23 hours in every 24.
- **Equity feeds stop out of hours.** On a Saturday all five mainnet equity feeds were 25–30h
  stale, last published inside Friday's session, while USDG/ETH/BTC were ~4h old. The vault
  correctly refuses to trade then; this is handled off-chain by not proposing trades, not by
  widening the window.
- **Sequential reads, no Multicall3.** There is no Multicall3 on the testnet chain.
- **`_bubbleRevert`** deliberately re-raises the router's own revert data rather than flattening it
  to a generic message; the off-chain simulator depends on the original reason.

### 5.4 Not yet done

- **Formal verification / invariant campaigns beyond `forge` fuzzing at 256 runs.** We have
  property tests over the arithmetic (`test/AgentVault.Arithmetic.t.sol`, 9 properties) but no
  stateful invariant suite. If your process includes one, we consider it in scope and valuable.
- **`PunoCredits` ownership handover.** `Ownable2Step` is in place and `DeployMainnet` calls
  `transferOwnership` to a `PUNO_OWNER`, but no multisig exists yet, so on any current deployment
  the deployer's hot key is still the owner. Known, tracked, not a code finding.
- **An earlier internal review numbered its findings S1–S6.** That document did not survive; only a
  reference to S6 (a regulatory question, not a contract issue) remains. Treat this file as the
  complete set of what we know, because it is.

---

## 6. Deployment and privileged operations

- `VaultFactory` is constructed with an **immutable** quote token. A wrong address here is not a
  misconfiguration, it is a permanently wrong deployment; hence hardcoded rather than env-driven.
- `DeployMainnet` refuses to run on any chain but 4663, requires `PUNO_TREASURY` whenever a PUNO
  token address is given, and refuses a `PUNO_OWNER` equal to the deployer.
- `PunoCredits.deposit` rejects `msg.sender == treasury` by name — a self-transfer nets to zero and
  would otherwise fail later as "nothing received", which points at a fee-on-transfer token rather
  than the real cause.
- `sweep` exists to recover tokens sent to `PunoCredits` directly. It is `onlyOwner` and, given the
  contract holds nothing in normal operation, should be checked for whether it can ever take
  something it should not.

---

## 7. Chain and integration assumptions

Robinhood Chain is an **Arbitrum Orbit** chain. Mainnet 4663, testnet 46630.

- **Price feeds are Chainlink `AggregatorV3Interface` proxies.** ~111 proxies covering ~35 tickers.
  The vault reads `latestRoundData` and rejects a non-positive answer or one older than that feed's
  own `maxStaleness`.
- **Swaps route through Uniswap V3 `SwapRouter02`** on mainnet. Note the deployed router is from
  `swap-router-contracts`, so `exactInputSingle` carries **no `deadline` field** — ABIs were read
  from the verified source of the deployed bytecode, not from the upstream repo.
- **Symbol lookup is not identity on this chain.** `loxAAPL`, `AAPLCAT` and two different `loxTSLA`
  contracts all exist. Every address in `packages/shared/src/network/assets.ts` was pinned against
  the on-chain `name()`. Periphery contracts must be resolved by `factory()`, never by name —
  Blockscout returns five `SwapRouter`s belonging to four different factories.
- **The public mainnet RPC sits behind Cloudflare and rejects batched JSON-RPC POSTs.** Enumerate
  state sequentially, or use the Blockscout REST API, which is not challenged.

---

## 8. Tests

`forge test` — **80 passing, 0 skipped**, verified at `3b64271` on 2026-08-16.

| Suite                         | Tests | Covers                                       |
| ----------------------------- | ----: | -------------------------------------------- |
| `AgentVault.Policy.t.sol`     |    28 | Every policy limit, and its revert           |
| `PunoCredits.t.sol`           |    26 | Idempotency, fee-on-transfer, treasury paths |
| `AgentVault.Arithmetic.t.sol` |     9 | Fuzz properties, 256 runs each               |
| `AgentVault.AgentLifecycle`   |     6 | Grant, expiry, revocation                    |
| `VaultFactory.t.sol`          |     6 | CREATE2 determinism                          |
| `AgentVault.Access.t.sol`     |     5 | Access control                               |

Was 88 before `3b64271`; the eight that went were the eight covering the removed fee mechanism, and
no remaining test was weakened to keep the suite green.

`forge build` emits 11 `forge-lint` informational warnings — mostly `unsafe-typecast` on casts a
neighbouring `require` already bounds, plus naming rules. Exactly one is suppressed: the `uint192`
cast in `_checkAndRecordDailyNotional`, where the `require` immediately above makes it provably
safe. If you disagree with that suppression, it is a finding.

`test/helpers/AgentVaultHarness.sol` exposes `_checkAndRecordDailyNotional` for property testing.
It stays internal in production on purpose: a public version would let anyone pad the rolling
window with fabricated notional and push a vault past its own daily cap without trading.

---

## 9. What we want from the engagement

In priority order:

1. **Any path from a compromised agent key to value leaving a vault.** §3.
2. **Any way to exceed a policy limit** that the owner set. §4.2.
3. **Oracle handling** — manipulation, staleness, decimal conversion, the floor's rounding
   direction. §4.3, §4.4.
4. **`PunoCredits` accounting** — double-credit, lost credit, or a deposit that reports a different
   amount than the treasury received. §4.7, §4.8.
5. Everything else.

A finding that a documented decision in §5.3 is wrong is welcome and counts as a finding. A finding
that re-reports §5.2 or the gap in §5.1 does not.
