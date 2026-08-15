# Launch checklist — instruction to self

**Read this before saying anything is ready.** Written 2026-08-14. This is the standing answer
to "what is left" and "what must be proven before a mainnet deploy". Update it in place; do not
start a second one.

Two rules from CLAUDE.md govern everything below and are repeated here because they are the ones
that get skipped under time pressure:

- **Verify before claiming.** Every ✅ in this file must be earned by running the command in the
  session that ticks it. A tick copied from a previous session is not evidence.
- **Flag conflicts, do not silently resolve them.** If an item here contradicts the code, say so
  before proceeding.

---

## Part 1 — What is left to build

### Mainnet blockers (code, not configuration)

| #       | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Where                                                                                                                       | State                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **B1**  | **Real router integration. DONE 2026-08-15.** `RouterAdapter` seam plus a `UniswapV3Adapter` that quotes all four fee tiers through `QuoterV2` and encodes `SwapRouter02.exactInputSingle`. ABIs read from the verified source of the deployed bytecode; quoting re-verified live.                                                                                                                                                                                                                            | `apps/agent/src/routing/`                                                                                                   | **Closed**                  |
| **B1a** | **Wizard allowlisted 1inch while the adapter serves SwapRouter02. DONE 2026-08-15.** `allowedRouters` now resolves to `uniswapV3.swapRouter02`, falling back to `routers.oneInch` — which on testnet is the MockRouter, so testnet is unchanged.                                                                                                                                                                                                                                                              | `apps/web/src/app/app/agents/new/page.tsx`                                                                                  | **Closed**                  |
| **B2**  | **Wizard allowlisted only the quote token. DONE 2026-08-15.** A pinned, chain-verified registry (`packages/shared/src/network/assets.ts`) carries token + feed + decimals + the on-chain `name()` for 5 mainnet and 2 testnet equities. The wizard lists them as checkboxes, calls `setPriceFeed` per selection at `EQUITY_STALENESS_SECONDS`, and writes them all into `allowedTokens`.                                                                                                                      | `apps/web/src/app/app/agents/new/page.tsx`, `packages/shared/src/network/assets.ts`                                         | **Closed**                  |
| **B4**  | **Equity oracles stop outside market hours. DECIDED 2026-08-15 — option A + C.** `EQUITY_STALENESS` stays at 1 h. `market/session.ts` classifies the session from the oracles rather than a trading calendar; `tick.ts` skips before the paid screening call when the market is closed or nothing is allowlisted; `MarketBanner` says which it is. The agent is still idle nights and weekends — that is the correct posture — but it no longer charges for the discovery or reports it as "NAV unavailable". | `packages/shared/src/market/session.ts`, `apps/agent/src/loop/tick.ts`, `apps/web/src/components/terminal/MarketBanner.tsx` | **Closed**                  |
| **B3**  | **PUNO does not exist on mainnet.** `NETWORKS.mainnet.punoToken`/`.punoCredits` are `null`, so `runDepositWatcher` returns immediately. Nothing to fix in code — a sequencing fact.                                                                                                                                                                                                                                                                                                                           | `apps/agent/src/indexer/watcher.ts`                                                                                         | Blocked on the token itself |

**B1 decision already taken (do not re-litigate):** Uniswap V3 directly first, 1inch later.
Addresses, liquidity and a live quote are in `PHASE4-ROUTING-2026-08-14.md`. Two traps recorded
there: **symbol lookup is not identity** (`loxAAPL`, `AAPLCAT`, two different `loxTSLA` all
exist), and periphery contracts must be resolved by `factory()`, never by name.

B1 needs a real _quote_, not just real calldata: `MockRouter.swap` takes `amountOut` as an exact
argument and always fills at the modelled price, so `risk.ts`'s sizing has never met a venue that
can fill differently.

### B0 — the hosted worker could not sign for a single user vault

**Found and closed 2026-08-15. It was not in this file, and it outranked everything that was.**

Four facts that could not all be true at once:

1. The wizard called `generatePrivateKey()` **in the browser**, showed the key to the user, and
   printed a `.env` snippet plus `pnpm --filter @puno/agent dev`. The server never received it and
   the schema had nowhere to put it.
2. `apps/agent/src/chain/client.ts` builds one signer from one process-wide `AGENT_PRIVATE_KEY`.
3. `main.ts`'s `tickAllAgents()` ticks **every** live agent in the database.
4. `AgentVault.sol:292` requires `msg.sender == agent`.

So a hosted worker walked every agent while able to sign for exactly one vault. For every other
one, the tick would screen, decide, **bill the user $0.51**, pass risk, and revert on chain with
"not authorized" — per agent, per tick. The product could not have executed a trade for a real
user on any network. The live trade of 2026-08-14 went through a seeded agent, which is why it
never surfaced. Same class as the `dry_run` hole: a path that simply did not exist.

Two models were in the tree at once — a hosted service (our ledger, our indexer, our Anthropic
key, one shared tick loop) and a self-hosted tool (that final screen). **Resolved in favour of
hosted**, with a shared service key:

- `NetworkConfig.serviceAgent` is the public address the worker signs with. The wizard arms
  vaults with it, and refuses to create an agent on a network where it is null — the same shape
  as the `vaultFactory` gate, because a vault nothing can trade is worse than no vault when the
  user has already paid for every signature.
- Custody did not change, because there was nothing to custody. The agent may only swap
  allowlisted tokens through allowlisted routers inside the owner's policy; `withdraw` takes the
  owner's signature. The owner revokes with `setAgent`, and the grant expires regardless.
- `apps/agent/src/chain/serviceAgent.ts` refuses to boot the worker when its key does not derive
  to the configured address, in paper mode too — discovering it at the moment someone goes live
  is the expensive version. 6 tests.

**Verified by execution 2026-08-15**, all three sources agreeing: the `.env` key derives to
`0x389AA9c066854a1e1A62a9F49910760a8D010adD`, `NETWORKS.testnet.serviceAgent` holds it, and
`cast call <demoVault> "agent()"` returns it.

- [x] **Mainnet `serviceAgent` — done 2026-08-15.** `0x0aCd6ea59305B882FDC42e78b209Ec9bC39926a8`,
      generated fresh and used on no other chain. The private half went straight from `cast wallet
new` into `.env.mainnet.local` (gitignored by the `.env.*.local` rule, confirmed with
      `git check-ignore`) and has never been through a clipboard or a chat — which is the whole
      point, given how the August incident worked. Checked distinct from the old deployer, the
      attacker, the current deployer and the testnet agent.
      **Two things still owed on it:**
- [ ] **Fund it with ETH on 4663 before the first live mainnet vault.** It pays gas on every
      `executeTrade` and holds 0 today. Measured floor: the real testnet trade burned 260,225 gas;
      at the mainnet gas price observed on 2026-08-15 (28,226,000 wei) that is ~0.0000073 ETH a
      trade, so 0.01 ETH covers well over a thousand. Treat it as a floor, not a forecast — that
      trade went through `MockRouter`, and a real Uniswap V3 swap costs more.
- [ ] **Move the key off this laptop when hosting exists.** `.env.mainnet.local` is a holding
      place, not a home. It belongs in the host's secret store as `AGENT_PRIVATE_KEY` alongside
      `NETWORK=mainnet`; delete the local file once it is there.

### Security and ownership — must happen before mainnet money

- [ ] **Transfer `PunoCredits` ownership off the hot `.env` key.** Whoever owns it can move the
      treasury and therefore redirect every payment.
      **Correction 2026-08-15: the contract already extended `Ownable2Step`** — this was never
      code work, and the checklist's earlier wording implied otherwise. What was missing, and is
      now done, is that `DeployMainnet` accepts `PUNO_OWNER` and calls `transferOwnership` in the
      deploy transaction (refusing an owner equal to the deployer), and warns loudly when it is
      unset. **Still open, and operational:** there is no multisig address yet, and two-step
      means the handover is _not complete_ until that address calls `acceptOwnership()` itself —
      until then the deployer's hot key still controls the treasury. Verify with
      `cast call <credits> "owner()"`, never by reading the deploy log.
- **Contract audit — DEFERRED by decision, 2026-08-16.** Not skipped by oversight and not
  forgotten: the owner reviewed the exposure and chose to carry it for now. Recorded here so the
  decision stays visible instead of becoming an assumption nobody remembers making.

  The scope package is written and stays current — **`AUDIT-SCOPE-2026-08-16.md`**, measured at
  **430 nSLOC across 3 contracts, 24 external functions**, frozen at `41fbe9a`, no proxies and no
  upgradeability. Nothing needs redoing to start an engagement; it is send-ready.

  What the deferral rests on, so the reasoning can be re-checked rather than re-argued: vaults are
  per-user with no pooled funds, so there is no honeypot that repays an attack; there is no
  upgradeability, so no one can swap the logic later; and `withdraw` and `pause` are owner-only and
  always available, so a user has an exit that does not depend on us. `PunoCredits` holds nothing —
  it forwards in the same call.

  **What changes the calculus** (the trigger to revisit, not a warning to re-read): third-party
  funds at scale, and the shared-agent-key claim in particular — one key signs for every vault, so
  if that blast radius is wrong it is wrong for all users at once. A single-question review of that
  one assumption costs a fraction of a full audit and is the piece worth buying first if only one
  thing gets bought.

  Also unchanged by the deferral: **no upgradeability means a bug cannot be patched.** The
  `priceDecimals > 18` hole our own fuzzing found on 2026-08-15 would have bricked a token
  permanently. That class is real, was found here, and stays the reason to keep fuzzing.

- [x] **Dead fee mechanism removed. Done 2026-08-16.** `setFeeConfig`, `collectFee`,
      `MAX_FEE_BPS`, `feeRecipient`, `feeBps`, `highWaterMark`, `highWaterMarkInitialized`, two
      events and `test/AgentVault.Fees.t.sol` are gone. It was never active, could not serve
      billing, and `collectFee` moved the quote token out — a second path by which value left a
      vault, against the one claim this contract most needs to make without a caveat. **`AgentVault`
      now has exactly one way out and it is `onlyOwner`.** Scope dropped 430 → **389 nSLOC**, 24 →
      **22 external functions**. Tests 88 → **80**, because the 8 that went were the ones covering
      the removed code; no test was weakened. A stale `forge-lint` suppression was fixed in the
      same pass (it sat above three comment lines, so it silenced nothing): 12 → 11 warnings.
- [x] **Fuzz tests on `AgentVault` arithmetic. Done 2026-08-15** —
      `test/AgentVault.Arithmetic.t.sol`, 9 properties at 256 runs each, covering feed-decimal
      normalisation, the oracle floor (never above fair value, exact at zero slippage, monotonic
      in slippage), the USD round trip, and the rolling 24h window. Writing them surfaced two
      real holes, both now fixed and both unreachable by an example test: `setPriceFeed` accepted
      a feed reporting **more than 18 decimals**, which would have bricked that token forever
      with an unmessaged arithmetic panic on every price read; and the rolling window's
      `uint192` downcast was **unchecked**, so a large enough notional would truncate to a small
      recorded one and walk past the daily cap. `nav`, `minAcceptableOut`, `valueOf`,
      `valueToRaw` and `recentNotionalUsd` are now public views — `minAcceptableOut` in
      particular, because `risk.ts` reimplements that formula and a drifting copy is a silent
      source of trades that pass locally and revert on chain.
- [x] **`DeployTestnet` deployed with `treasury == deployer`** (D4). **Done 2026-08-15.** The
      script now requires `PUNO_TREASURY` and refuses one equal to the deployer, checked before
      broadcasting. `PunoCredits.deposit` also rejects `msg.sender == treasury` by name instead of
      failing later with "nothing received", which pointed at a fee-on-transfer token rather than
      the real cause. **Breaking for anyone re-running the script** — set `PUNO_TREASURY`; the
      existing testnet one is `0x2169f2d6c60600f7194bF76e66287a64513B5eA9`.
- [ ] **`DeployTestnet` never calls `setAgent`** — the demo vault ships unarmed and `guard()`
      blocks every tick until an owner arms a key by hand.

### Business decisions that are not config values

- [ ] **The mainnet PUNO/USD rate.** Testnet uses $0.01 as a placeholder for the mock token. The
      mainnet rate is a real decision.
- [ ] **Treasury must convert received PUNO to USDG promptly.** Balances are denominated in USD;
      if the treasury holds PUNO, we carry a USD liability backed by a floating asset.
- [ ] **Regulatory.** Selling a token for access to a service that trades securities is two
      overlapping surfaces, not one. Unresolved; not blocking a testnet demo.

### Measurement still owed

- [ ] **Re-measure the screen cost.** D1's fix added the decision summary to the ~2,885-token
      screen prompt. If it now clears Haiku's 4,096-token cache minimum, caching engages and the
      Haiku cache gap closes itself. Needs a tick against a _populated_ decision history, not a
      synthetic prompt.
- [ ] **Haiku cache gap** — measured at 0 cache tokens across all five screen calls; ~$0.0018 of
      the $0.005 screen margin wasted. Either pad the prompt past the minimum or accept it
      deliberately.

### Product gaps (from `COMPETITORS-2026-08-14.md`, in order)

1. [ ] **No public track record.** The largest hole, and the only one that cannot be closed by
       writing code — only by accumulating history. **Start recording now.**
2. [ ] **Nothing is visible before connecting a wallet.** A read-only public demo would cost
       nothing; the data already exists.
3. [ ] **No approval mode** ("require approval before executing").
4. [x] **`dry_run` is now user-settable. Done 2026-08-15, and this item was worded backwards.**
       The gap was not that paper mode could not be chosen — paper was the _only_ mode reachable.
       `POST /api/agents/create` hardcoded `dryRun: true`, `agents/[id]` had a `GET` and nothing
       else, and no other write path to the column existed, so every agent the wizard ever
       created was paper permanently and the product could not execute a real trade for any user.
       (The live trade of 2026-08-14 ran through a seeded agent, not one made in the wizard.) The
       wizard now offers the choice and reads it back in the mandate, `PATCH /api/agents/[id]`
       switches an existing agent either way, and `ExecutionMode` sits in the page header beside
       the kill switch. Confirmation is asked for one direction only: going live. `lib/dryRun.ts`
       holds the two body-parsing rules — permissive on create where absence safely means paper,
       strict on patch where there is no safe default — with 7 tests on the junk-input paths.
5. [ ] **The comparison replay is invisible** — we pay for it and show the user nothing.
6. [ ] **The oracle floor is unadvertised** — our strongest safety claim appears nowhere.

### Copy that is currently untrue

- [x] **`Today · 1,842 ticks routed`. Done 2026-08-15, and it was the smaller of two problems in
      that component.** The same `COST_TIERS` ladder quoted `~$0.005` for a screen and `~$0.025+`
      for an escalation — **our model cost**, not the tariff — while `PricingSection`, three
      sections down the same page, read `PRICES_USD` from `@puno/shared` and rendered `$0.01` and
      `$0.50`. The landing quoted two prices for the same action, understating a decision by 20×,
      and printing our cost beside our price publishes the margin. `Rejected · $0` was untrue
      independently: the risk engine vetoes _after_ the paid decision, so a rejection saves the
      $0.25 trade fee, not the tick. The rows now carry a `BillableEvent` key and read the amount
      from `PRICES_USD`, so the two sections cannot drift apart again.
      **Rule this leaves behind:** never hardcode a price in `apps/site`. Import it.

### Housekeeping

- [x] **`pnpm format:check` — clean as of 2026-08-15.** 26 files by then, all pre-existing, fixed
      in one commit (`131ed92`) so it can be skipped wholesale when reading history. Three of the
      offenders were **generator output** and are now in `.prettierignore` instead:
      `apps/agent/drizzle/` (drizzle-kit) and `packages/shared/src/design/generated/`
      (`generate:css`). Formatting those would have gone green today and red again on the next
      migration or token change — `tailwind-theme.css` says GENERATED FILE in its own header.

---

## Part 2 — The gate. Run these before any deploy.

Run in this order. Do not tick from memory.

### 0. Environment

```powershell
$env:PATH = "C:\Program Files\Git\cmd;C:\Program Files\nodejs;$env:APPDATA\npm;$env:PATH"
```

`pnpm` and `node` are **not on PATH in a fresh shell** on this machine. Every session has to do
this before the first command; a bare `pnpm` fails with `CommandNotFoundException`.

### 1. Stop the dev server before building

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
```

**If anything is listening, do not run `next build`.** Both write to the same `.next`, and the
build wipes the chunks dev is serving. The symptom is not an error — pages keep returning 200
while CSS and JS chunks 404, so the app renders as unstyled HTML with every button dead. Stop
dev, build, restart dev, or delete `apps/web/.next` to recover.

### 2. Static gates

| Command                              | Expected                               |
| ------------------------------------ | -------------------------------------- |
| `pnpm -r typecheck`                  | 4/4 projects clean                     |
| `pnpm lint`                          | clean                                  |
| `pnpm format:check`                  | clean — a real signal since 2026-08-15 |
| `pnpm test`                          | **156** — shared 63, agent 80, web 13  |
| `forge test -vv` (from `contracts/`) | **80/80**                              |
| `pnpm -r build`                      | both apps build; `web` emits 20 routes |

If a count is _lower_ than the number above, tests were deleted or skipped — investigate before
proceeding. If _higher_, update this file.

### 3. Routes actually serve

With dev running, every route returns 200 — including the agent detail page, which regressed
twice:

```
/app  /app/try  /app/settings  /app/agents/new  /app/agents/[id]  /pricing
```

A 403 or 401 must resolve **immediately**, not after a retry storm. Both are terminal in
`retryUnlessDenied`; if a denial takes ~60s to surface, that predicate broke.

### 4. On-chain invariants

- [ ] `reconcile()` passes — `SUM(creditLedger.amountUsd) == accounts.creditBalanceUsd`. A
      mismatch means lost money. Opening balances must be **journaled, not seeded**.
- [ ] Deposit-indexer idempotency proven the hard way: rewind the cursor behind a credited block,
      re-run the watcher, confirm `credited: 0` and an unchanged balance. The key is
      `depositNonce`, **not** `txHash` — one transaction can carry several deposits.
- [ ] Staleness constants unchanged: `QUOTE_STALENESS = 26 hours`, `EQUITY_STALENESS = 1 hours`.
      **Do not collapse them into one.** Measured live 2026-08-14: USDG/USD was 22.4 h stale while
      AAPL/TSLA/NVDA were 0–0.3 h. `MockAggregatorV3` stamps `block.timestamp`, so no testnet run
      can ever surface this.
- [ ] `DRY_RUN` still defaults **true** and is checked at the last possible moment in
      `execute.ts`. The testnet price keeper broadcasting under `DRY_RUN=true` is the one
      deliberate exception — it touches only mock oracles and cannot reach mainnet.

### 5. Deploy simulation

- [ ] `DeployTestnet` and `DeployMainnet` both simulate against the live chains.
- [ ] Both `DeployMainnet` guards proven **by execution**: wrong chain → revert; PUNO set without
      treasury → revert.

### 6. Addresses — the clipboard rule

The dev machine was backdoored on 2026-08-13 by a **clipboard hijacker** that substituted
addresses on copy. Generating an address safely is not enough; it must be checked **at the moment
of use**.

- [ ] Every address in a deploy command read back visually before sending.
- [ ] **Stop immediately** if either of these appears in any transaction: - old deployer `0x81FDDF1dAD8ED65fA60bF1F4B89A3FA5F5B829D2` - attacker `0xeB73130796f89e2df501526663e1cD114eAC20Ab`
- [ ] Current, post-reinstall: deployer `0x7b22e721AeE49C4306699a5E77243372FA6afBDa`,
      agent `0x389AA9c066854a1e1A62a9F49910760a8D010adD`.
- [ ] **Never print a private key.** Verify presence by length only (`set, len 66`). Derive
      addresses with `cast wallet address --private-key` and display only the address.

### 7. Git

The remote is `https://github.com/trappalfy/puno-agent`. **Push works now** — the user
authenticated interactively once on 2026-08-15 and Windows Credential Manager kept the
credentials, so `git push origin main` succeeds from this shell. Try it rather than assuming it
will fail.

Two things to expect. PowerShell renders git's stderr progress as a red `NativeCommandError`
even on success, so read `$LASTEXITCODE` and the `a..b main -> main` line, not the colour. And
if the credential ever expires the failure is `could not read Username` — that one genuinely
cannot be solved here, and the user has to run the push once themselves. Never work around the
credential prompt.

PowerShell here-strings break on `"` in commit messages. Write the message to a file and use
`git commit -F <file>`.

---

## Part 3 — Verdict

**Testnet: yes** — deployed, billing proven on chain, one real trade executed, margin measured at
95.6%.

**Mainnet: no**, and the ordering below is the answer to "what is actually left". Updated
2026-08-16: B0, B1, B2 and B4 are closed and the mainnet worker key exists, so **nothing on the
critical path is development work any more.** Every remaining item is a decision, a deployment, or
an external party.

| #     | Item                                                                       | Whose  | State                               |
| ----- | -------------------------------------------------------------------------- | ------ | ----------------------------------- |
| ~~1~~ | ~~Dedicated **mainnet worker key**~~ — `0x0aCd6ea5…`, in `serviceAgent`    | ours   | **Done 2026-08-15**                 |
| 2     | **Hosting** — nothing is deployed anywhere; see below                      | theirs | Not started                         |
| 3     | **PUNO** exists, with a decided USD rate and a treasury conversion routine | theirs | Not started                         |
| 4     | `DeployMainnet` run; `vaultFactory`/`punoCredits` written into `config.ts` | both   | Blocked on 3                        |
| 5     | Multisig created and calling `acceptOwnership()` on `PunoCredits`          | theirs | Not started                         |
| —     | ~~Audit~~                                                                  | —      | **Deferred by decision 2026-08-16** |

The dependency is strict: 3 gates 4, 4 gates any real user, and 2 gates all of it being public.

**Item 5 survived the audit decision and should not be folded back into it.** These were one row
until 2026-08-16 and that was a bookkeeping error, not a judgement: an audit is weeks and money,
while creating a multisig and calling `acceptOwnership()` is an afternoon and costs gas. Whoever
owns `PunoCredits` can move the treasury and therefore redirect **every payment the product ever
takes** — that is the one remaining item where the failure is not a bug but a key, and deferring
the audit does nothing to reduce it.

**Two items now block on funding the mainnet worker rather than on code:** it holds no ETH and pays
gas on every `executeTrade`, and its key still lives in `.env.mainnet.local` on the dev laptop
rather than in a host's secret store. Both are listed above under the ownership section.

### Hosting — not previously recorded anywhere

Checked 2026-08-15: there is no `Dockerfile`, no `vercel.json`, no CI, no deploy config of any
kind. `docker-compose.yml` starts **Postgres only**. The web app, the database and the worker all
run on this laptop.

That makes "public launch" blocked on infrastructure that does not exist, and it is worth doing
before the rest rather than after, for one reason: the largest product gap is the absence of a
public track record, and it closes only by accumulating history. Every day the worker is not
running somewhere that stays on is a day missing from that record.

Also load-bearing once real users exist: `tickAllAgents()` walks every live agent **sequentially**
inside one `TICK_INTERVAL_MS` window. Fine at today's count; at some N a pass outruns its own
interval. Not a launch blocker, but the first thing that will bend.
