# Puno — project brief

Autonomous trading agents for **Robinhood Chain**. A user deploys a non-custodial
`AgentVault`, funds it with USDG, grants a time-boxed agent key, and the worker trades
tokenized equities inside on-chain policy limits. The user pays per action in **PUNO**,
Puno's own token.

This file is the working context for the project. It is loaded automatically each session.
Read it before touching anything.

> **`LAUNCH-CHECKLIST.md` is the standing answer to "what is left" and "what must be proven
> before a deploy".** Open it at the start of any session that touches deployment, readiness,
> or "are we ready" — and before saying anything is ready. It carries the runnable gate
> (expected test counts, the on-chain invariants, the address rule) that this file only
> summarises. Update it in place; never start a second one.

---

## Layout

pnpm workspaces. `pnpm -r <script>` runs across all of them.

| Path              | What                                                                            |
| ----------------- | ------------------------------------------------------------------------------- |
| `apps/web`        | Next.js 15 product app — wallet auth (SIWE), agent CRUD, terminal UI, billing   |
| `apps/site`       | Vite 8 marketing landing, deliberately decoupled from the product app           |
| `apps/agent`      | Worker: the trading tick loop, deposit indexer, DB migrations                   |
| `packages/shared` | Design tokens, ABIs, pricing, DB schema, network config — the seam between apps |
| `contracts`       | Foundry: `AgentVault`, `VaultFactory`, `PunoCredits`                            |

---

## Business model — pay per action, settled in PUNO

There are **no subscription tiers**. They were removed; do not reintroduce them. Stripe is
gone entirely.

Prices are canonical in **USD** (`packages/shared/src/pricing.ts`):

```ts
PRICES_USD = { screen: 0.01, decision: 0.5, trade: 0.25 };
STARTER_GRANT_USD = 1.0; // 2 decisions, one grant per account, ever
MIN_DEPOSIT_USD = 5.0;
LOW_BALANCE_WARNING_USD = 1.0;
```

The user sees prices **in PUNO** — everywhere, including the marketing site (decided
2026-08-16). Conversion happens **server-side only**. There is no on-chain oracle for
PUNO/USD and there must not be one for now.

**Three units, and they are not interchangeable:**

| Shown as      | What                                   | Why                                                                   |
| ------------- | -------------------------------------- | --------------------------------------------------------------------- |
| **PUNO**      | what an action costs, what to deposit  | the only way to pay; a price list is a menu and may re-price          |
| **decisions** | the user's credit balance              | a stored amount must not fall when the token rises                    |
| **USD**       | vault NAV, positions, P&L, risk limits | the vault holds USDG and equities, no PUNO; limits go on-chain in USD |

The balance is **not** shown in PUNO, and this is deliberate. Deposit 50,000 PUNO at $0.0004,
PUNO doubles, and a PUNO-denominated balance reads 25,000 — same value, same number of
decisions, but it looks like half the money was taken, and it hits hardest exactly the people
most invested in PUNO rising. `decisionsRemaining` only moves when the agent has done
something. Same argument as the USD-denominated ledger below, seen from the user's side.

`GET /api/pricing` is public and unauthenticated — `apps/site` is a static Vite build on a
separate origin with no session and no database, and the rate lives in Postgres. Baking a rate
into that build would be a second copy of the one number the whole billing path turns on. The
route carries no per-account data and does not apply the BYOK discount, which is a property of
an account. Both site sections fall back to USD when the fetch fails or no rate is set: a
price a visitor cannot pay in still beats a blank.

**Quoting in PUNO makes numbers long.** `$50` became `125,000 PUNO`, which is why
`formatTokensCompact` exists and why the top-up chips and pay button use it — three of those
side by side is the button overflow this UI was already fixed for once. The exact figure stays
on the "You send" row, which has a line to itself.

**Why the balance is denominated in USD, not tokens:** the token funds the account and is
converted to USD credits at deposit time. If balances were held in tokens, a price drop
would erode the user's balance while our Anthropic costs stayed flat. Operational
consequence: **the treasury must convert received PUNO to USDG promptly**, or we hold a
USD liability backed by a floating asset.

**BYOK is a modifier, not a tier.** A user with their own Anthropic key pays nothing for
`screen`/`decision`, but still pays for `trade`.

`modelCalls.costUsd` is _our cost_. The credit ledger is _what the user was charged_. Never
merge them — the margin measurement depends on keeping them apart.

---

## Non-obvious decisions worth preserving

**Robinhood Chain mainnet has everything the product assumed.** Surveyed by execution on
2026-08-14 — see `PHASE4-ROUTING-2026-08-14.md` for addresses, liquidity and a live quote.
Real tokenized equities (AAPL/TSLA/NVDA/… as "Apple • Robinhood Token"), USDG pools on a
Uniswap V3 deployment, a verified 1inch AggregationRouterV6, and 111 Chainlink feed proxies
covering ~35 tickers. B1 is an integration, not a dependency hunt. Two traps recorded there:
**symbol lookup is not identity** (`loxAAPL`, `AAPLCAT`, two different `loxTSLA` contracts all
exist), and periphery contracts must be resolved by `factory()`, never by name — Blockscout
returns five `SwapRouter`s belonging to four different factories.

**The public mainnet RPC is behind Cloudflare and rejects batched JSON-RPC POSTs** — a batch
returns an HTML interstitial regardless of user agent, while `cast` passes one call at a time.
Enumerate chain state sequentially. Blockscout's REST API is not challenged.

**Per-feed price staleness.** `AgentVault.PriceFeed` carries its own `maxStaleness` (uint32,
packed into the aggregator's slot), bounded by `MAX_STALENESS_LIMIT = 2 days`. A single
global threshold cannot work: equity feeds republish on deviation (minutes), while pegged
stablecoins only publish on the 24h heartbeat. Measured live, USDG was 22h stale against
the old 1h threshold, so `_nav()` reverted on roughly 23 of every 24 hours.
**Correction, 2026-08-15:** "equity feeds republish on deviation (minutes)" is true _only
during the US session_. Measured on a Saturday, all five mainnet equity feeds were 25–30 h
stale — last published inside Friday's session — while USDG, ETH and BTC were ~4 h old. Out of
hours the relationship inverts entirely. See `EQUITY-FEED-HOURS-2026-08-15.md`; the constants
below are unchanged and still correct.
`MockAggregatorV3` stamps `block.timestamp`, so **no testnet run could ever have surfaced
this** — it only appeared against real feeds. Deploy constants: `QUOTE_STALENESS = 26 hours`,
`EQUITY_STALENESS = 1 hours`. **Re-confirmed live on 2026-08-14**: USDG/USD was 22.4 h stale
while AAPL, TSLA and NVDA were 0–0.3 h. Both constants still hold; do not collapse them.

**`PunoCredits` idempotency is `depositNonce`, not `txHash`.** One transaction can carry
several deposits, so a txHash key would silently drop credits. The event also reports what
the treasury _actually received_, not the requested amount — fee-on-transfer safety.

**Settled trades charge with `allowNegative: true`.** After a $0.50 decision the balance can
fall below the $0.25 trade fee, but by then the swap is already on-chain and gas is spent.
The fee is a receivable, not a purchase decision, so the balance is allowed to go negative
rather than erasing the debt. The L2 decision call is separately gated on
`decision + trade` together, so this is the rare tail, not the normal path.

**The free tier is exactly one paper decision.** `STARTER_GRANT_USD = screen + decision =
$0.51`, deliberately not a round number: a paper run never reaches a billable trade (only a
`confirmed` trade is charged), so this is the exact cost of one free run and the balance lands
on zero. A remainder too small to buy anything reads as money taken and not honoured. The
grant cannot fund a _live_ run — that is what the tariff is for. Locked by
`apps/agent/src/quota/starter-grant.test.ts`, which walks the real gates in order rather than
dividing by the decision price: the earlier $1.00 grant was documented as buying two decisions
and bought one, because the L2 gate reserves `decision + trade` up front.

**Testnet mock feeds need a keeper, or the demo shows a refusal.**
`MockAggregatorV3` stamps `block.timestamp` when the answer is _set_, not when it is read, so a
testnet feed goes stale one hour after anyone last touched it. Measured: TSLA 12,176 s and AAPL
8,276 s against a 3,600 s window. The visible effect was the demo agent declining to trade and
explaining, correctly, that it would not act on an untrusted mark — the worst possible first
impression, and systematic rather than occasional. `apps/agent/src/testnet/price-keeper.ts`
refreshes them on a timer and, forced, immediately before every free-tier run so a demo never
depends on timer phase. It also walks the equity prices (±1.2% a pass, mean-reverting to an
anchor, quote token pinned) so triggers can fire and the market is not frozen.

Note this is _not_ fixable in the agent's judgement: `AgentVault._nav()` reverts on a stale
feed, so an agent argued into trading anyway would only reach a failed simulation. A fresh mark
is the only thing that works, and loosening the staleness check would break the one invariant
that measurably mattered against real feeds.

The keeper **broadcasts while `DRY_RUN=true`** — deliberate, and the one exception. DRY_RUN's
promise is that no _trade_ is sent; this touches no vault, router or funds, only a mock oracle
that exists on testnet. It cannot reach mainnet twice over: `isTestnet` is false there and
`demoVault` is null. `TESTNET_PRICE_KEEPER=false` switches it off.

**Paper mode is per-agent, and `agents.dry_run` is what says so.** The column was written by
the creation wizard and rendered as a "Dry run" badge (`AgentCard.tsx`) from the beginning, but
nothing read it — only the process-wide `DRY_RUN` decided whether a trade was broadcast. An
agent marked dry-run in the database would have traded for real as soon as the worker ran with
`DRY_RUN=false`, while its owner's console said otherwise. `runTick` now reads it. The three
sources — `config.dryRun`, `agents.dry_run`, `TickOptions.paper` — are OR-ed so each can only
_add_ a restriction; nothing can turn a run that any of them called paper into a live one. In
paper mode the L2 gate reserves the decision alone, since no billable trade can result.

**Comparison replay is never billed** — it is our measurement, not a service to the user.
Which is exactly why `COMPARISON_SAMPLE_RATE` defaults to **0.1** and not 1: at 100% it added
~15% to our model cost per decision ($0.002819 a replay against ~$0.019) for data that stops
being informative after a few dozen samples. Raise it to 1 in development.

**Structured output constrains shape, not string length.** `zodOutputFormat()` writes
`maxLength` into the JSON Schema, the API does not enforce it while generating, and the
helper's own parse is a hard `safeParse` that throws on the first issue — so a `.max()` is
advisory on the way out and fatal on the way back. Observed: Haiku wrote a 104-character
`riskFlag` against a 64 cap and the whole call was discarded. Since `DecisionOutputSchema` is
shared between the replay and the real L2 decision, that also aborts a tick the user has
already paid the screening fee for. `llm/schemas.ts` therefore keeps the caps in the schema
(the model should still be asked for terse output) and **clamps prose on parse instead of
rejecting**, while `action`/`ticker`/`sizePct`/`confidence` still fail loudly. The line sits
where the storage does: `thesis` is `text`, `risk_flags` is `jsonb`, so length is cosmetic —
meaning is not. Clamp truncation logs; it must never be silent.

**Money arithmetic stays in Postgres `numeric`.** `packages/shared/src/db/credits.ts` uses
`FOR UPDATE` + `ON CONFLICT DO NOTHING` for atomic, idempotent money operations. The
ledger is the source of truth; `accounts.creditBalanceUsd` is materialized from it.
Invariant: `SUM(creditLedger.amountUsd) == accounts.creditBalanceUsd`. `reconcile()` checks
it — a mismatch means lost money, so opening balances must be journaled, not seeded
directly.

**`token-price.ts` throws rather than falling back.** A failed credit is replayable from
chain; a wrong one is not.

**The rate's staleness window is two constants, not one** (split 2026-08-16).
`MAX_OVERRIDE_AGE_MS = 24h` gates _crediting_; `MAX_DISPLAY_AGE_MS = 7 days` gates _display_.
It was a single 7-day constant governing both, so narrowing it for a volatile launch would
have blanked the public pricing page at the same moment billing stopped — and those two
failures are not comparable. Same shape as the contract's `QUOTE_STALENESS` vs
`EQUITY_STALENESS`: the strict threshold goes where value moves, not everywhere. Do not
collapse them.

That creates a state which did not exist before — a rate fresh enough to show and too old to
charge against — so `TokenPrice` carries `usableForCredit`, and `TopUpCard` refuses to quote
an amount to send when it is false. That quote is a transaction instruction, not a price
label: the deposit is valued at whatever rate is current when the indexer reaches it, so
quoting from a rate we have already declined to bill at is a promise we would not keep.

Expiry is not silent: the worker calls `rateStalenessWarning` hourly and warns from 12h. It
runs on its own timer rather than inside the deposit poll deliberately — the rate expires
whether or not anyone is depositing, and the quiet week is the case worth catching. When it
does expire **nothing is lost**: the indexer refuses to advance its cursor past an event it
could not value, and every deposit replays once a rate is set.

**Setting the rate is `pnpm --filter @puno/agent set-rate -- <price> --note "<why>"`**, not
hand-written SQL. The `--note` is required because the table is append-only and is therefore
the only record of why a rate was what it was. The script **refuses a change of more than 4×**
without `--force` — a dropped zero is always a factor of ten, and this is the only check
standing between a keystroke and the number every deposit is valued at, the same position the
visual address check occupies after the clipboard incident. It also refuses a price below
`1e-12`, which `numeric(24, 12)` would silently store as zero. It prints what the rate turns
every price into _before_ writing, computed through the real `usdToTokens`: the rate is
abstract going in and means something only as prices.

**PUNO's launch price is chosen, not predicted** — we seed the pool, so
`price = USDG ÷ PUNO in pool` and `FDV = price × supply` are both ours. Pick the price for
readability and the supply for FDV; comparables inform FDV only. $0.001 makes every number in
the product round (screen 10 PUNO, decision 500, trade 250, $20 top-up 20,000). The real
constraint is pool depth, not FDV: we owe dollars and hold PUNO, so revenue is sold into our
own pool, and depth must be ≳50× daily revenue for that not to move the price against us.

**The deposit indexer advances its cursor only past credited events.**
`MAX_BLOCK_RANGE = 2000n`, `CONFIRMATIONS = 5n`.

**`CreditsDb` is driver-agnostic** (`PgDatabase<PgQueryResultHKT, typeof schema>`) so PGlite
can back the tests with real Postgres semantics. PGlite creates a second drizzle-orm peer
variant, which breaks `next build` with branded-type mismatches unless
`@electric-sql/pglite` is a devDependency of `apps/web` and `apps/agent` too. It is. Leave
it there.

**No Multicall3 on Robinhood Chain testnet** — sequential contract reads in
`apps/agent/src/chain/vault.ts` are deliberate, not an oversight.

**`AgentVault.setFeeConfig`/`collectFee` were removed on 2026-08-16.** They were a
high-water-mark profit fee in USDG, never active (`feeBps` was 0 everywhere and nothing set it),
and unusable for billing anyway — `setFeeConfig` was `onlyOwner` where the owner is the _user_.
Deleted rather than left dormant because `collectFee` transferred the quote token out, making it
a **second path by which value left a vault**, and "withdraw is the only way out, and it is
owner-only" is the one claim this contract most needs to state without a caveat. It also carried
a known gap: a deposit made after the high-water mark was initialised read as appreciation.
Do not reintroduce it as a billing mechanism; if a profit fee ever returns it is a new design.

**Prettier does not converge on multi-paragraph markdown list items.** A second paragraph
indented under a `- [ ]` gets four more spaces on every `--write`, so `format:check` fails
again immediately after `format` "fixed" it. Hit twice on `LAUNCH-CHECKLIST.md`. Keep list
items to one paragraph and put the prose in a `####` section below — which reads better anyway,
since a checklist item should be a line, not an essay.

Related shell trap: `pnpm format:check 2>&1 | tail -2 && git commit` **always commits**, because
the pipeline's exit status is `tail`'s. Check the gate in its own command.

**TypeScript runs with `exactOptionalPropertyTypes: true`** — optional props must be typed
`| undefined`. Also: `and()` returns `SQL | undefined`, which trips this; use `sql\`\`` directly.

**Foundry cheatcode ordering:** `vm.prank`/`vm.expectRevert` attach to the _next call_,
including view calls embedded in argument lists. Hoist those to locals first.

---

## State as of 2026-08-13

Everything below was verified by execution, not assumed:

- `forge test` — 74/74 pass
- unit tests — 111 pass (shared 51, agent 54, web 6)
- `pnpm -r typecheck` — 4/4 projects clean
- `pnpm lint` — clean
- both apps build; all pages serve 200
- both deploy simulations pass against the live chains
- both `DeployMainnet` guards proven by execution (wrong chain → revert; PUNO set without
  treasury → revert)

Deploy cost, simulated:

| Script          | Gas        | ETH                                          |
| --------------- | ---------- | -------------------------------------------- |
| `DeployTestnet` | 13,497,489 | 0.000270                                     |
| `DeployMainnet` | 3,584,794  | 0.000317 (forge pads ~2×; real ≈ $0.25–0.30) |

Testnet ETH **cannot be bridged in** — it must come from
`https://faucet.testnet.chain.robinhood.com`.

**Re-verified 2026-08-14** on the rebuilt machine: `forge test` 74/74, unit tests 111
(shared 51, agent 54, web 6), `pnpm -r typecheck` 4/4 clean, `pnpm lint` clean, both apps
build (`web` emits 17 routes). Deploy simulations were _not_ re-run — they need a funded
deployer, which is open work item 1.

---

## Development environment (rebuilt 2026-08-14)

The machine was wiped, so this is the full list of what a bare Windows box needs. Nothing
here is optional; all of it was installed and verified by execution.

| Tool       | Version      | Source                                                             |
| ---------- | ------------ | ------------------------------------------------------------------ |
| Node.js    | 24.19.0      | winget `OpenJS.NodeJS.LTS`                                         |
| pnpm       | 11.21.0      | `npm i -g pnpm@11.21.0` — matches the `packageManager` pin exactly |
| Git        | 2.55.0.3     | winget `Git.Git`                                                   |
| Foundry    | 1.5.1-stable | GitHub release zip → `~/.foundry/bin`, added to user PATH          |
| PostgreSQL | 16.15-1      | EDB installer, service `postgresql-x64-16`                         |

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
  installer dies with _"Expected option but got Files\PostgreSQL\16"_ — exit code 1, no log.
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

| Contract          | Address                                      |
| ----------------- | -------------------------------------------- |
| VaultFactory      | `0x486901cBa710C5Fb1032AB1bB25d190E3f845998` |
| PunoCredits       | `0xD0D4B491D8980cd49b0eCf151ad30f8f779D74f6` |
| Mock PUNO         | `0x1A480B089d8A5E2B77A1bD8908aBFF9bB6af21da` |
| Demo AgentVault   | `0xcFA434255f47F4C8777043540d253CEDFb36B5e9` |
| MockRouter        | `0x58fc3D03E57aC4b909b04356CF9Ae8b420885719` |
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
rebuilt from scratch on the clean system (see _Development environment_ below) and a new root
`.env` was generated there — `ENCRYPTION_KEY`, `SESSION_SECRET`, `DEPLOYER_PRIVATE_KEY` and
`AGENT_PRIVATE_KEY` are all fresh; nothing was carried across the reinstall. New addresses:

| Role     | Address                                      |
| -------- | -------------------------------------------- |
| deployer | `0x7b22e721AeE49C4306699a5E77243372FA6afBDa` |
| agent    | `0x389AA9c066854a1e1A62a9F49910760a8D010adD` |

The old deployer `0x81FDDF1dAD8ED65fA60bF1F4B89A3FA5F5B829D2` and the attacker's
`0xeB73130796f89e2df501526663e1cD114eAC20Ab` must never appear in a transaction again — if
either shows up in a deploy, stop. Because the original attack was a _clipboard_ hijack,
addresses still deserve a visual check at the moment of use, not just at the moment of
generation.

---

## Open work, roughly in order

**Canonical list: `LAUNCH-CHECKLIST.md`.** What follows is the short form kept for continuity;
when the two disagree, the checklist is right — it is the one that gets updated.

~~1. Fund the fresh deployer~~ **Done 2026-08-14** — faucet sent 0.01 ETH.
~~2. Run `DeployTestnet` and write the addresses into config.ts~~ **Done 2026-08-14** —
see _Testnet deployment_ below; `NETWORKS.testnet` now carries real addresses.
~~3. Set a manual PUNO/USD rate~~ **Done 2026-08-14** — $0.01, a testnet placeholder for the
mock token. The mainnet rate is a real business decision, not a config value to copy.

~~4. End-to-end scenario~~ **Done 2026-08-14.** Deposit → indexer → credit → ledger invariant
→ idempotent replay, then agent → screen → decision → risk → simulate → **real on-chain
trade** (`0x082d0f73…`), with all three charges verified. See `READINESS-2026-08-14.md`.
~~5. Margin check~~ **Done 2026-08-14 — measured, not assumed.** Our cost $0.057007 against
   $1.30 charged: **95.6% margin**. A decision costs $0.0245 on the first call and **$0.0097**
once its prompt is cached, against $0.50 billed — the assumption is conservative by ~50×,
   and `max_tokens: 4096` caps the worst case at $0.102. Full table in the readiness file.

~~6. Redo the launch-readiness audit and save it to a file~~ **Done 2026-08-14** —
`READINESS-2026-08-14.md`, written to disk before anything else, so compaction cannot
eat it again. B1/B2/B3 and D1–D5 live there; D1, D2, D3 and D5 are fixed.

7. **Phase 4 — real router integration (blocker B1).** `loop/simulate.ts` hardcodes calldata
   for `MockRouter.swap`, which exists only on 46630. The single gate on mainnet.
8. **Extend the agent-creation wizard to allowlist equities (blocker B2)** and source real
   Chainlink feed addresses. Today it allowlists the quote token alone, so a vault created
   through the UI can never trade anything.
9. **Re-measure the screen cost.** D1's fix adds the decision summary to the screen prompt
   (~2,885 tokens before). If it now crosses Haiku's 4,096-token cache minimum, caching
   engages and item 11 solves itself — otherwise item 11 stands. Needs a tick against a
   populated decision history, not a synthetic prompt.
10. **Fuzz tests on `AgentVault` arithmetic** — never written.
11. **Haiku cache gap**: the screen prompt is ~2,885 tokens against Haiku's 4,096-token cache
    minimum, so caching never engages (confirmed by measurement — the counters were 0 across
    all five screen calls) and ~$0.0018 of the $0.005 screen margin is wasted. Either pad the
    prompt past the minimum or accept the loss deliberately.
12. **Before mainnet**: transfer `PunoCredits` ownership off the hot `.env` key using
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

**Never run `next build` for `apps/web` while its dev server is up.** Both write to the same
`.next`, and the build wipes the chunks dev is serving. The symptom is not an error: pages keep
returning 200 while `/_next/static/css/...` and the JS chunks 404, so the app renders as unstyled
HTML with nothing interactive — every button looks broken. Stop dev, build, then restart dev, or
delete `apps/web/.next` to recover. Hit on 2026-08-14 and misread at first as a CSS bug.

```bash
pnpm -r typecheck && pnpm lint && pnpm test    # full regression
forge test -vv                                  # contracts (run from contracts/)
pnpm --filter @puno/web dev                     # product app
pnpm --filter @puno/site dev                    # landing
pnpm --filter @puno/agent db:migrate            # apply DB migrations
pnpm --filter @puno/agent set-rate -- 0.001 --note "why"   # PUNO/USD rate
```

Note: the script is `db:migrate`, not `migrate` — this file said `migrate` until 2026-08-14
and that command does not exist.
