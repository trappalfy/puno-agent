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
STARTER_GRANT_USD = 1.0        // 2 decisions, one grant per account, ever
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

**Re-verified 2026-08-14** on the rebuilt machine: `forge test` 74/74, unit tests 100
(shared 51, agent 43, web 6), `pnpm -r typecheck` 4/4 clean, `pnpm lint` clean, both apps
build (`web` emits 17 routes). Deploy simulations were *not* re-run — they need a funded
deployer, which is open work item 1.

---

## Development environment (rebuilt 2026-08-14)

The machine was wiped, so this is the full list of what a bare Windows box needs. Nothing
here is optional; all of it was installed and verified by execution.

| Tool | Version | Source |
|---|---|---|
| Node.js | 24.19.0 | winget `OpenJS.NodeJS.LTS` |
| pnpm | 11.21.0 | `npm i -g pnpm@11.21.0` — matches the `packageManager` pin exactly |
| Git | 2.55.0.3 | winget `Git.Git` |
| Foundry | 1.5.1-stable | GitHub release zip → `~/.foundry/bin`, added to user PATH |
| PostgreSQL | 16.15-1 | EDB installer, service `postgresql-x64-16` |

Traps worth remembering, all hit on 2026-08-14:

- **Foundry is not in winget.** `foundryup` is a shell script and needs bash. Install the
  Windows binaries straight from
  `https://github.com/foundry-rs/foundry/releases/download/stable/foundry_stable_win32_amd64.zip`.
- **winget cannot install PostgreSQL.** EDB's CDN returns **403** to winget's User-Agent.
  Download `https://get.enterprisedb.com/postgresql/postgresql-16.15-1-windows-x64.exe`
  with a browser User-Agent instead. The installer is Authenticode-signed by EnterpriseDB —
  check that, given the project's history.
- **The EDB installer needs its arguments as one quoted string.** PowerShell's
  `Start-Process -ArgumentList @(...)` splits `C:\Program Files\...` on the space and the
  installer dies with *"Expected option but got Files\PostgreSQL\16"* — exit code 1, no log.
- **`pnpm install` will time out on a slow link.** This connection runs ~0.34 MB/s; the
  default fetch timeout kills the install at ~575/578 packages. Raise it once:
  `pnpm config set --global fetch-timeout 900000` and `fetch-retries 8`. Second run: 3m57s.
- **`contracts/lib` submodules must be restored by hand** if the tree arrives without
  `.git` (e.g. from a ZIP). Clone at the `contracts/foundry.lock` revisions:
  forge-std `v1.16.2` (`bf647bd6`), openzeppelin-contracts `v5.7.0` (`cab19933`).

Local Postgres is native, not Docker — role `puno`, password `puno`, database `puno`, which
is exactly the `DATABASE_URL` in `.env.example`. `docker-compose.yml` still describes the
equivalent container for anyone who prefers it. Migrations are applied; 13 tables exist.

---

## Testnet deployment (chain 46630, 2026-08-14)

Live and verified by execution — bytecode present, wiring read back from chain. Addresses
are in `packages/shared/src/network/config.ts` under `NETWORKS.testnet`.

| Contract | Address |
|---|---|
| VaultFactory | `0x486901cBa710C5Fb1032AB1bB25d190E3f845998` |
| PunoCredits | `0xD0D4B491D8980cd49b0eCf151ad30f8f779D74f6` |
| Mock PUNO | `0x1A480B089d8A5E2B77A1bD8908aBFF9bB6af21da` |
| Demo AgentVault | `0xcFA434255f47F4C8777043540d253CEDFb36B5e9` |
| MockRouter | `0x58fc3D03E57aC4b909b04356CF9Ae8b420885719` |
| Mock USDG (quote) | `0x5fecF7bA6365E6763b8984c43307B417A498aD40` |

Real cost **0.0001124 ETH**, not the estimated 0.000270 — forge padded ~2.4×.

Two things the deploy taught, both now in `READINESS-2026-08-14.md`:

- **`DeployTestnet` does not call `setAgent`.** The demo vault ships with no agent, so
  `guard()` blocks every tick until the owner arms a key. Done manually here, 30-day expiry.
- **`PunoCredits.deposit` reverts when the payer is the treasury** — self-transfer means a
  zero balance delta and `require(received > 0)` fires. `DeployTestnet` makes the deployer
  both, so the billing path is untestable out of the box. Worked around with `setTreasury`;
  the testnet treasury is now `0x2169f2d6c60600f7194bF76e66287a64513B5eA9`.

`routers.oneInch` for testnet deliberately holds the **MockRouter** address, because the
agent-creation wizard reads exactly that field to fill `allowedRouters`. Do not "correct" it
back to the 1inch address — nothing named 1inch exists on 46630.

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

**Resolved on 2026-08-14.** The user confirmed the Windows reinstall. The whole toolchain was
rebuilt from scratch on the clean system (see *Development environment* below) and a new root
`.env` was generated there — `ENCRYPTION_KEY`, `SESSION_SECRET`, `DEPLOYER_PRIVATE_KEY` and
`AGENT_PRIVATE_KEY` are all fresh; nothing was carried across the reinstall. New addresses:

| Role | Address |
|---|---|
| deployer | `0x7b22e721AeE49C4306699a5E77243372FA6afBDa` |
| agent | `0x389AA9c066854a1e1A62a9F49910760a8D010adD` |

The old deployer `0x81FDDF1dAD8ED65fA60bF1F4B89A3FA5F5B829D2` and the attacker's
`0xeB73130796f89e2df501526663e1cD114eAC20Ab` must never appear in a transaction again — if
either shows up in a deploy, stop. Because the original attack was a *clipboard* hijack,
addresses still deserve a visual check at the moment of use, not just at the moment of
generation.

---

## Open work, roughly in order

~~1. Fund the fresh deployer~~ **Done 2026-08-14** — faucet sent 0.01 ETH.
~~2. Run `DeployTestnet` and write the addresses into config.ts~~ **Done 2026-08-14** —
   see *Testnet deployment* below; `NETWORKS.testnet` now carries real addresses.
~~3. Set a manual PUNO/USD rate~~ **Done 2026-08-14** — $0.01, a testnet placeholder for the
   mock token. The mainnet rate is a real business decision, not a config value to copy.

~~4. End-to-end scenario~~ **Done 2026-08-14.** Deposit → indexer → credit → ledger invariant
   → idempotent replay, then agent → screen → decision → risk → simulate → **real on-chain
   trade** (`0x082d0f73…`), with all three charges verified. See `READINESS-2026-08-14.md`.
~~5. Margin check~~ **Done 2026-08-14 — measured, not assumed.** Our cost $0.057007 against
   $1.30 charged: **95.6% margin**. A decision costs $0.0245 on the first call and **$0.0097**
   once its prompt is cached, against $0.50 billed — the assumption is conservative by ~50×,
   and `max_tokens: 4096` caps the worst case at $0.102. Full table in the readiness file.

1. **Re-measure the screen cost.** D1's fix adds the decision summary to the screen prompt
   (~2,885 tokens before). If it now crosses Haiku's 4,096-token cache minimum, caching
   engages and open work item 7 solves itself — otherwise item 7 stands.
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
pnpm --filter @puno/agent db:migrate            # apply DB migrations
```

Note: the script is `db:migrate`, not `migrate` — this file said `migrate` until 2026-08-14
and that command does not exist.
