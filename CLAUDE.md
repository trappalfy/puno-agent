# Puno — project brief

Autonomous trading agents for **Robinhood Chain**. A user deploys a non-custodial
`AgentVault`, funds it with USDG, grants a time-boxed agent key, and the worker trades
tokenized equities inside on-chain policy limits. The user pays per action in **PUNO**,
Puno's own token.

This file is the working context for the project. It is loaded automatically each session.
Read it before touching anything.

---

## Layout

pnpm workspaces. `pnpm -r <script>` runs across all of them.

| Path | What |
|---|---|
| `apps/web` | Next.js 15 product app — wallet auth (SIWE), agent CRUD, terminal UI, billing |
| `apps/site` | Vite 8 marketing landing, deliberately decoupled from the product app |
| `apps/agent` | Worker: the trading tick loop, deposit indexer, DB migrations |
| `packages/shared` | Design tokens, ABIs, pricing, DB schema, network config — the seam between apps |
| `contracts` | Foundry: `AgentVault`, `VaultFactory`, `PunoCredits` |

---

## Business model — pay per action, settled in PUNO

There are **no subscription tiers**. They were removed; do not reintroduce them. Stripe is
gone entirely.

Prices are canonical in **USD** (`packages/shared/src/pricing.ts`):

```ts
PRICES_USD = { screen: 0.01, decision: 0.50, trade: 0.25 }
STARTER_GRANT_USD = 3.0        // ~6 decisions, one grant per account, ever
MIN_DEPOSIT_USD = 5.0
LOW_BALANCE_WARNING_USD = 1.0
```

The user sees prices **in PUNO**; conversion happens **server-side only**. There is no
on-chain oracle for PUNO/USD and there must not be one for now.

**Why the balance is denominated in USD, not tokens:** the token funds the account and is
converted to USD credits at deposit time. If balances were held in tokens, a price drop
would erode the user's balance while our Anthropic costs stayed flat. Operational
consequence: **the treasury must convert received PUNO to USDG promptly**, or we hold a
USD liability backed by a floating asset.

**BYOK is a modifier, not a tier.** A user with their own Anthropic key pays nothing for
`screen`/`decision`, but still pays for `trade`.

`modelCalls.costUsd` is *our cost*. The credit ledger is *what the user was charged*. Never
merge them — the margin measurement depends on keeping them apart.

---

## Non-obvious decisions worth preserving

**Per-feed price staleness.** `AgentVault.PriceFeed` carries its own `maxStaleness` (uint32,
packed into the aggregator's slot), bounded by `MAX_STALENESS_LIMIT = 2 days`. A single
global threshold cannot work: equity feeds republish on deviation (minutes), while pegged
stablecoins only publish on the 24h heartbeat. Measured live, USDG was 22h stale against
the old 1h threshold, so `_nav()` reverted on roughly 23 of every 24 hours.
`MockAggregatorV3` stamps `block.timestamp`, so **no testnet run could ever have surfaced
this** — it only appeared against real feeds. Deploy constants: `QUOTE_STALENESS = 26 hours`,
`EQUITY_STALENESS = 1 hours`.

**`PunoCredits` idempotency is `depositNonce`, not `txHash`.** One transaction can carry
several deposits, so a txHash key would silently drop credits. The event also reports what
the treasury *actually received*, not the requested amount — fee-on-transfer safety.

**Settled trades charge with `allowNegative: true`.** After a $0.50 decision the balance can
fall below the $0.25 trade fee, but by then the swap is already on-chain and gas is spent.
The fee is a receivable, not a purchase decision, so the balance is allowed to go negative
rather than erasing the debt. The L2 decision call is separately gated on
`decision + trade` together, so this is the rare tail, not the normal path.

**Comparison replay is never billed** — it is our measurement, not a service to the user.

**Money arithmetic stays in Postgres `numeric`.** `packages/shared/src/db/credits.ts` uses
`FOR UPDATE` + `ON CONFLICT DO NOTHING` for atomic, idempotent money operations. The
ledger is the source of truth; `accounts.creditBalanceUsd` is materialized from it.
Invariant: `SUM(creditLedger.amountUsd) == accounts.creditBalanceUsd`. `reconcile()` checks
it — a mismatch means lost money, so opening balances must be journaled, not seeded
directly.

**`token-price.ts` throws rather than falling back.** A failed credit is replayable from
chain; a wrong one is not. `MAX_OVERRIDE_AGE_MS = 7 days`.

**The deposit indexer advances its cursor only past credited events.**
`MAX_BLOCK_RANGE = 2000n`, `CONFIRMATIONS = 5n`.

**`CreditsDb` is driver-agnostic** (`PgDatabase<PgQueryResultHKT, typeof schema>`) so PGlite
can back the tests with real Postgres semantics. PGlite creates a second drizzle-orm peer
variant, which breaks `next build` with branded-type mismatches unless
`@electric-sql/pglite` is a devDependency of `apps/web` and `apps/agent` too. It is. Leave
it there.

**No Multicall3 on Robinhood Chain testnet** — sequential contract reads in
`apps/agent/src/chain/vault.ts` are deliberate, not an oversight.

**`AgentVault.setFeeConfig`/`collectFee` are dead code.** They are a high-water-mark profit
fee in USDG, and `setFeeConfig` is `onlyOwner` where the owner is the *user*. They cannot
be repurposed for billing.

**TypeScript runs with `exactOptionalPropertyTypes: true`** — optional props must be typed
`| undefined`. Also: `and()` returns `SQL | undefined`, which trips this; use `sql\`\`` directly.

**Foundry cheatcode ordering:** `vm.prank`/`vm.expectRevert` attach to the *next call*,
including view calls embedded in argument lists. Hoist those to locals first.

---

## State as of 2026-08-13

Everything below was verified by execution, not assumed:

- `forge test` — 74/74 pass
- unit tests — 100 pass (shared 51, agent 43, web 6)
- `pnpm -r typecheck` — 4/4 projects clean
- `pnpm lint` — clean
- both apps build; all pages serve 200
- both deploy simulations pass against the live chains
- both `DeployMainnet` guards proven by execution (wrong chain → revert; PUNO set without
  treasury → revert)

Deploy cost, simulated:

| Script | Gas | ETH |
|---|---|---|
| `DeployTestnet` | 13,497,489 | 0.000270 |
| `DeployMainnet` | 3,584,794 | 0.000317 (forge pads ~2×; real ≈ $0.25–0.30) |

Testnet ETH **cannot be bridged in** — it must come from
`https://faucet.testnet.chain.robinhood.com`.

---

## SECURITY INCIDENT — read before any deploy

On **2026-08-13** the development machine was found backdoored. A clipboard hijacker was
substituting crypto addresses on copy: the deployer address
`0x81FDDF1dAD8ED65fA60bF1F4B89A3FA5F5B829D2` became the attacker's
`0xeB73130796f89e2df501526663e1cD114eAC20Ab`, which cost the user 0.000363 ETH.

Root cause: two unsigned hidden payloads (`C:\ProgramData\Windows\Microsoft\RuntimeBroker.exe`,
`C:\Users\Public\Downloads\...\SystemService.exe`) held by seven scheduled tasks forged to
look like Microsoft's, beaconing to C2 on TCP port 406. Payload timestamps: December 2025.
Dr.Web CureIt did not detect it. Killing the payload triggered a `0x000000EF`
(CRITICAL_PROCESS_DIED) BSOD — it had marked itself critical as self-defense. The user
wiped and reinstalled Windows on both drives.

**Consequences that still bind:**

- `DEPLOYER_PRIVATE_KEY`, `SESSION_SECRET`, `ENCRYPTION_KEY` and `DATABASE_URL` from before
  the reinstall are **compromised**. Generate fresh ones. Never reuse the old deployer key —
  whoever deploys `PunoCredits` owns it.
- Confirm with the user that the reinstall is done before treating any local key as safe.

---

## Open work, roughly in order

1. **Fund a fresh deployer** from the faucet (needs 0.000270 ETH), after regenerating
   `.env` secrets on the clean system.
2. **Run `DeployTestnet`**, then write the resulting addresses into
   `packages/shared/src/network/config.ts`.
3. **Set a manual PUNO/USD rate** in `token_price_overrides` (no liquidity exists yet, so
   the TWAP source is a stub with a finished interface).
4. **End-to-end scenario**: deposit → indexer credits → agent runs with `DRY_RUN=false` to a
   real trade → verify all three charges (screen, decision, trade) against the ledger and
   the balance.
5. **Margin check**: `SUM(modelCalls.costUsd)` vs charges for the same period, per level.
   This is the first real test of the $0.50 decision assumption.
6. **Fuzz tests on `AgentVault` arithmetic** — never written.
7. **Haiku cache gap**: the screen prompt is ~2000 tokens against Haiku's 4096-token cache
   minimum, so caching never engages and ~$0.0018 of the $0.005 screen margin is wasted.
   Either pad the prompt past the minimum or accept the loss deliberately.
8. **Redo the launch-readiness audit and save it to a file.** An earlier ~20-finding audit
   was lost to context compaction; only S4/F1/S2/S6/B3/F2/S5 are reliably remembered. Do not
   repeat that mistake — write audits to disk.
9. **Before mainnet**: transfer `PunoCredits` ownership off the hot `.env` key using
   `Ownable2Step`.

**Unresolved, not blocking:** selling a token for access to a service that trades
securities is two overlapping regulatory surfaces, not one (audit finding S6 got sharper,
not softer). Contract audit scope grew with `PunoCredits` — the $10–30k estimate still
roughly holds. The manual PUNO rate means credit issuance is fully centralized and rests
on our good faith until liquidity exists.

---

## How to work with this user

- **Flag conflicts, do not silently resolve them.** Standing instruction. If the plan and
  the code disagree, or a request would break an invariant, say so before proceeding.
- **Never print private keys.** Verify presence by length only (`set, len 66`). Derive
  addresses with `cast wallet address --private-key` and display only the address.
- The user writes in Russian; the codebase and its comments are in English. Keep both.
- Verify before claiming. Every "done" in this file was earned by running the command.

## Commands

```bash
pnpm -r typecheck && pnpm lint && pnpm test    # full regression
forge test -vv                                  # contracts (run from contracts/)
pnpm --filter @puno/web dev                     # product app
pnpm --filter @puno/site dev                    # landing
pnpm --filter @puno/agent migrate               # apply DB migrations
```
