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

### SEC-1 — anyone could register anyone else's vault as their own

**Found and closed 2026-08-16, while planning the mainnet cutover. It was not in this file.**

`POST /api/agents/create` took `vaultAddress` from the request body, wrote `ownerAddress` from
the session, and never asked the chain whether the two belonged together. The route's own
comment guarded the mirror-image case — someone else's account named as owner of your vault —
which is probably why this direction was never noticed.

With nothing but a legitimate sign-in of one's own wallet: POST any vault address, including the
shared demo vault or a stranger's, and get a `vaults` row naming yourself owner.
`api/agents/[id]` authorizes on exactly that column, `agents.kind` defaults to `'live'`, and
`PATCH { dryRun: false }` then tells the worker to broadcast real trades on a vault the caller
does not own — the signature is available because every wizard-created vault is armed with our
shared `serviceAgent`. The unique index on `(address, network)` made it a land-grab as well:
first registrant wins. `withdraw` stays `onlyOwner`, so funds could not leave, but the victim's
positions, trades and reasoning were readable and their vault traded on command.

One `owner()` read over the **claimed network's** RPC closes both halves: it proves ownership,
and it proves the network, because the same address on the other chain is either not a contract
or a different one. The `network` field had no check of any kind before this. RPC failure
returns 503, never 400 — by then the vault is deployed and the gas is spent.

- [x] Closed. `apps/web/src/lib/createAgent.ts` holds the verdict as a pure function, 12 tests.

### B5 — the product spans two networks, the app is pinned to one

**Decided 2026-08-16: the free tier stays on testnet, paid agents trade on mainnet.** Both live at
once, permanently. That is the shape the code already implies — mainnet's `demoVault` is null so a
free run cannot spend real gas — but the web app does not implement it.

**Half done. The worker half is closed (2026-08-16):**

- `tickAllAgents()` selected every live agent with no network filter, and `runTick` read the vault
  row while ignoring its `network` column, against a chain client built once from process-wide
  `config.network`. With both networks in one database a worker would read the other network's
  vault addresses over its own RPC — and that need not fail: the same deployer at the same nonce
  yields the same address on every chain, so an address can exist on both and be a **different
  contract** on each. Now filtered in SQL and guarded again inside `runTick`, which covers the
  trial runner as a second caller.
- `runTrialQueue` now returns early when the network has no `demoVault`. Without it the guard above
  made things worse rather than better: a mainnet worker would **claim** a queued free run, skip
  the tick, and mark it `done` — the user's one free run consumed silently, with no error.
- **Operational consequence: one worker process per network.** They cannot be merged without a
  per-agent chain client, and each needs its own `AGENT_PRIVATE_KEY` matching that network's
  `serviceAgent`.

**Web half started 2026-08-16. Done so far:**

- [x] **`packages/shared/src/network/policy.ts`** — the decisions that were spread across files
      or absent. `whyClosed()` is one predicate for "can someone create _and pay for_ an agent
      here", returning the reason as a string so a gate's copy cannot disagree with its
      condition. It names PUNO rather than the factory on purpose: `VaultFactory` is to be
      deployed to mainnet **before** the token exists, and that must not open the wizard. It
      cannot, because `punoCredits` stays null for a structural reason — `PunoCredits.token` is
      immutable, so the contract cannot exist before the token.
- [x] **`creditsNetworkFrom()`** — exactly one network sells credit at a time, mainnet winning
      as soon as it has both addresses. Not tidiness: testnet PUNO is a mock anyone can be sent
      for free, and a union would let it buy real USD credit against our real model bill.
      Returns testnet today, so it is behaviour-preserving now and self-switching at launch.
- [x] **`publicClientFor(key)`** replaces `serverPublicClient()`; **`currentNetwork()` deleted**
      rather than generalised, so no future route can reach for a process-wide network in a
      deployment that serves two. Bare `RPC_URL` is ignored — it belongs to the worker in the
      shared root `.env`, and honouring it would aim both clients at one node.
- [x] **`punoDecimals`** on `NetworkConfig`. `18` was hardcoded in five places (indexer, both
      billing routes, top-up card, balance formatter) and nothing called `decimals()`. A token
      launched with 9 would have credited every depositor off by orders of magnitude, silently,
      in the direction of giving service away. `preflight` must assert it on-chain.
- [x] **`TopUpCard` pinned to the credit network's `chainId`** on every read and write. It sits
      on `/pricing`, outside `/app/*`, so `NetworkGuard` never covered it — and it is the one
      path that can lose money rather than confuse: a mainnet wallet approving the testnet token
      address hits an address with no code, which **succeeds silently** and spends the gas. Its
      amount was also an inline rewrite of `usdToTokens` that hardcoded 18 and dropped the
      round-up correction, so it could quote a hair under the minimum and revert on the last wei.
- [x] **`FREE_TIER_NETWORK`** replaces two independent copies of the same literal in `lib/trial.ts`
      and `/demo` — a pair that could drift with nothing failing.

**Still open, and it is the web app:**

- [ ] **Explicit `chainId` on every remaining browser read and write** — `useMarketSession`,
      `KillSwitch`, `SessionKeyCard`, `RiskLimitsPanel`, the wizard. Verified in wagmi's source:
      a write with no `chainId` skips `assertCurrentChain` and goes to whatever chain the wallet
      is on; a read resolves against `config.state.chainId`, so a mainnet vault's address gets
      read over the testnet RPC. On `useReadContracts` the key goes on **each contract entry** —
      a top-level one is silently ignored. **This must land before the global guard comes off.**
- [ ] **Three remaining hardcoded `getNetwork("testnet")` pins** — `app/api/auth/verify`, the
      wizard, `NetworkGuard`/`Sidebar`. Each carries a comment saying it waits on an explicit
      mainnet decision. That decision is now made, so they have to go.
- [ ] **`useChainId()` cannot report a chain we do not run.** wagmi's `syncConnectedChain` drops
      any chain not in `chains: [...]`, so it returns testnet by default and a wallet on Ethereum
      mainnet **passes today's `NetworkGuard`**. The replacement must read `useAccount().chainId`.
- [ ] **The wizard's `DEFAULTS` seed `useState`.** Fill the form on testnet, switch the wallet to
      mainnet, deploy — and a **testnet Chainlink feed address is written into a mainnet vault**.
      That is the address-substitution failure this repo's security incident was about, arriving
      by a different route. Re-seed on network change, and pin the deploy to a captured target
      chain: `usePublicClient` without an explicit `chainId` would poll the wrong chain after a
      switch and hang forever rather than fail.
- [ ] **The SIWE session is signed with `chainId: 46630`.** A user who takes the free run on
      testnet and then creates a paid mainnet vault crosses networks mid-journey, so this is not a
      constant swap — it needs a re-auth path, or a session that is not chain-scoped.
- [ ] **`NetworkGuard` blocks the whole console on any chain but the pinned one.** It has to become
      per-vault: the same account will legitimately hold a testnet trial agent and a mainnet vault.
- [ ] **Mainnet is nine signatures, not six** — five equities rather than two. Nothing to fix; the
      ledger is already generated from the selection. Worth knowing before quoting the flow.

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
2. [x] **Read-only public demo. Done 2026-08-16** — `/demo`, no wallet, no session, no signup.
       Shows the live demo agent's real signals, the reasoning behind each decision, the trades
       that reached the chain with a hash you can open in the explorer, and the positions. The
       headline metric is `signals · escalated`, not a bare count, because the ratio is what shows
       the cost ladder working — most signals stop at the cheap model.
       **Deliberately not an `/api` route.** Every route there is `requireAccount`-gated, and a
       public one would be a second place to get field-level exposure right. It is a server
       component reading the database directly, every `select` names its columns, and the reason is
       concrete: `signals.modelCallId` leads to `modelCalls.costUsd`, which is _our_ cost — a
       `select *` would have published the margin on a public page.
       Two boundaries worth keeping: only `kind = 'live'` agents are shown, because trial agents
       sit on the same shared vault but belong to whoever pressed the button, and their reasoning
       is not ours to publish; and `force-dynamic`, since a prerender would need a database to
       build and would then serve a snapshot frozen at deploy.
       Verified by execution: `/demo` returns 200 with **no session cookie**, renders `5 · 2`
       matching the live agent exactly, contains the real tx hash `0x082d0f73…`, contains none of
       the three trial agent ids, and greps clean for `costUsd`, `modelCall`, `accountId` and
       `creditBalance`. All other routes still 200.
3. [ ] **No approval mode** ("require approval before executing").
       3a. [ ] **The wizard does not check the credit balance.** `canDeploy` looks only at form validity,
       so someone at $0 can spend real gas on six signatures (nine on mainnet) and end up with a
       vault that cannot make a single decision. Credits are **per account**, not per agent
       (`checkBalanceBeforeCall(agent.accountId, …)`), and the starter grant is once per account
       ever — so creating a second agent while out of credit produces another agent that also
       cannot run. Warn rather than block, probably: someone may reasonably want the vault set up
       before funding it. Product decision, not a bug.
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
6. [x] **The oracle floor is advertised. Done 2026-08-16.** `GUARANTEES` went from three cards to
       six, and the three added are the ones a reader cannot get from any competitor's page: the
       **oracle floor** (the vault computes its own minimum from the Chainlink price and rejects a
       trade proposing less, so the agent supplies a number but cannot lower the bar), the
       **staleness refusal** (a feed past its own window stops trading rather than acting on a
       dead mark), and the **on-chain stop** (`pause()` is owner-only and checked first, so it
       works whether or not our software does). The page had been leading with "the agent cannot
       withdraw" — true, but the one claim every non-custodial product makes.
       Each line was checked against `AgentVault.sol` on the day, not written from memory, and the
       `require` behind it is named in a code comment so the claim stays falsifiable.
       Fixed in passing: the card stagger was `i * 0.1` over what is now two rows, which left the
       last card blank for half a second _after_ it had scrolled into view. Keyed to column now.

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
| `pnpm test`                          | **182** — shared 72, agent 80, web 30  |
| `forge test -vv` (from `contracts/`) | **80/80**                              |
| `pnpm -r build`                      | both apps build; `web` emits 21 routes |

If a count is _lower_ than the number above, tests were deleted or skipped — investigate before
proceeding. If _higher_, update this file.

### 3. Routes actually serve

With dev running, every route returns 200 — including the agent detail page, which regressed
twice:

```
/app  /app/try  /app/settings  /app/agents/new  /app/agents/[id]  /pricing  /demo
```

`/demo` must return 200 **with no session cookie at all** — that is the whole point of it. Check it
with a bare `curl`, not in a browser that already holds a session.

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

### 4b. Mainnet deploy — what is proven and what is not (2026-08-16)

`DeployMainnet` **simulates cleanly against the live mainnet RPC.** Run from `contracts/` with
`DEPLOYER_PRIVATE_KEY` in the environment and no `--broadcast`:

| Fact                          | Value                                                             |
| ----------------------------- | ----------------------------------------------------------------- |
| Chain id seen                 | 4663                                                              |
| Gas estimated                 | 3,483,526 at 0.056 gwei                                           |
| ETH required (forge estimate) | **0.000196** — expect ~0.00008 real; forge padded 2.4× on testnet |
| `PunoCredits`                 | correctly skipped, `PUNO_TOKEN_ADDRESS` unset                     |
| Deployer balance on 4663      | **0 ETH — this is the only thing blocking the broadcast**         |

Two things this settled that were open questions:

- **The Cloudflare batching problem does not break `forge script`.** It was a real risk that the
  padded JSON-RPC batches forge sends would come back as an HTML interstitial. They do not.
- **USDG hardcoded in the script is correct**: symbol `USDG`, 6 decimals, live at
  `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`.

- [ ] **Bump the deployer's nonce before deploying, or accept a genuinely confusing address.**
      The deployer's mainnet nonce is 0, so `VaultFactory` would land at
      `0x5fecF7bA6365E6763b8984c43307B417A498aD40` — **the same address that is Mock USDG on
      testnet**, because the same deployer at the same nonce produces the same address on any
      chain. Both would be real, on their own chains, forever. This defeats the one control this
      project actually has: the standing rule is to check addresses **visually at the moment of
      use**, and two identical strings cannot be told apart by eye. One self-transaction (~21,000
      gas) moves the factory to a fresh address and removes the ambiguity permanently. Cheap
      insurance in a repo whose security incident was an address substitution.
- [ ] **USDG is an upgradeable proxy that can freeze addresses.** Verified 2026-08-16: EIP-1967,
      implementation `0x68184c449e1a8f34fa18d289737129fd27b66f8f`, UUPS, Paxos-issued, and
      `isFrozen(address)` answers. `VaultFactory` fixes the quote token as **immutable**, so every
      vault is permanently bound to that proxy. Nothing to fix — but "the owner can always
      withdraw" is a claim about our contract, not about the asset, and the product copy should
      not say otherwise.

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

### T-0 — the moment the PUNO address arrives

The owner's stated goal: hand over one contract address and have the product go live, rather
than start rebuilding then. **That is achievable, but "paste the address" is not what happens** —
`PunoCredits.token` is immutable, so the billing contract cannot exist before the token and T-0
necessarily contains an on-chain deploy. Target shape: verify the token → one `forge script` →
**one commit to `config.ts`** → hosts rebuild themselves → `preflight` green.

Four things must be built before that is true, none of which existed on 2026-08-16:

- [ ] **Tell the owner now: PUNO must launch with exactly 18 decimals.** `punoDecimals` records
      the requirement and `preflight` will check it, but a token already deployed with 9 cannot
      be fixed by config — it becomes code, at the worst possible moment.
- [ ] **Split `DeployMainnet`.** It _always_ deploys `VaultFactory`, so running it at T-0 after
      an early factory deploy creates a **second** factory. A separate `DeployPunoCredits.s.sol`
      makes T-0 a one-purpose command. Add the `treasury != deployer` guard while there —
      `DeployTestnet:61` has it and `DeployMainnet` does not.
- [ ] **A write path for the PUNO/USD rate.** Nothing in the repo inserts into
      `token_price_overrides`; today it is hand-written SQL. And `MAX_OVERRIDE_AGE_MS` is 7 days,
      so **the rate must be re-entered weekly, forever, or crediting silently stops** — the
      indexer halts without advancing its cursor and `claim` returns 503. Needs a script plus an
      expiry warning in the worker's logs, not just the script.
- [ ] **`preflight`** — one command, one green/red table, reading the chain and the database
      rather than deploy logs: bytecode at every recorded address, `PunoCredits.token()` == the
      CA, `decimals()` == 18, `owner()` == the cold wallet _after_ `acceptOwnership`, treasury ≠
      deployer, `VaultFactory.quoteToken()` == USDG, ETH balances for deployer and
      `serviceAgent`, rate freshness, `reconcile()`, and a machine check that no address equals
      the old deployer or the attacker's.

Also carried over and still true: `CREDITS_WATCHER_START_BLOCK` in the root `.env` holds a
**testnet** block, and the indexer's cursor is keyed by `chainId` rather than by contract
address — so a `PunoCredits` redeploy on the same chain reuses the old cursor.

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
