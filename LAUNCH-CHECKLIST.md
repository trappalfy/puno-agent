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
- [x] **Funded 2026-08-17 — 0.0025 ETH**, read back from chain, and `preflight --mainnet` shows the
      row `PASS`. It pays gas on every `executeTrade`. At the gas price measured that day
      (20,190,000 wei) the real testnet trade's 260,225 gas is 0.0000053 ETH, so 0.0025 buys ~475
      trades — or **~158** if a real Uniswap V3 swap costs three times a `MockRouter` fill, which is
      the number to plan against. Runway scales inversely with gas price: a 10× rise makes that 16,
      so the figure to watch is the price, not the balance. `preflight` prints the balance every run.
      Before sending, the key in `.env.mainnet.local` was derived and matched against `config.ts`
      line 151 — three sources agreeing that a key exists for the address being funded, which is a
      stronger check than a test transfer, since ETH sent to an address we hold no key for is gone
      permanently and would not surface until T-0.
- [x] **Moved off the laptop 2026-08-17.** `AGENT_PRIVATE_KEY` is staged in `puno-worker-mainnet`'s
      Fly secrets (digest `205a98d1a02c5ac3`, status `Staged`), the app has **no machines**, and
      `.env.mainnet.local` is deleted. The only key left in `.env` is the testnet one, confirmed by
      deriving it to `0x389AA9c0…0adD`.
      `NETWORK` was deliberately **not** set as a secret: it is in `fly.mainnet.toml`'s `[env]`, and
      a Fly secret overrides `[env]`, which would leave the committed value dead while still reading
      as authoritative. `DATABASE_URL`, `ANTHROPIC_API_KEY` and `ENCRYPTION_KEY` were left out too —
      they matter only once the app deploys, and adding them now would be four more copies of
      secrets for no gain.
      **`DEPLOYMENT.md` used to forbid this outright and the ban was too wide.** Its concern was
      running a mainnet worker with nothing to do, which still holds; but `fly secrets import`
      against an app with no machines runs nothing, so the key could move while mainnet stayed
      closed by construction. Worth doing now rather than at T-0: a plaintext key on the laptop that
      was found backdoored in August should not wait for the day that already has twenty steps.
      Set over **stdin**, never as a command argument — PowerShell keeps arguments in
      `ConsoleHost_history.txt` — and `\r` was stripped explicitly, since a CRLF file would have put
      a trailing carriage return inside the secret and the failure would not have surfaced until the
      worker's first boot.
      **The recovery copy is proven, not assumed.** A Fly secret cannot be read back, so nothing
      short of a successful boot proves the stored value, and that boot is at T-0. So the owner wrote
      the key on paper, then typed it back from paper into a scratch file which derived to
      `0x0aCd6ea59305B882FDC42e78b209Ec9bC39926a8` — the configured address. Eyeballing paper against
      a screen would not have caught a single wrong character in the middle; deriving the address
      does. Both scratch file and original are now deleted.
      Why this key earns that care: it signs `executeTrade` for **every** mainnet vault, and vaults
      are armed with its address at creation. Losing it means every vault owner must call `setAgent`
      themselves — free today at zero vaults, unfixable from our side once there are users. A leak is
      serious but bounded: `withdraw` is owner-only, so a stolen key can force trades inside each
      vault's policy and cannot take funds out.

#### How ETH gets onto 4663, established 2026-08-17

Nothing in this repo recorded it, and the answer is not the one the testnet note implies. Testnet
ETH cannot be bridged and must come from the faucet; **mainnet is the opposite — there is no
faucet, and the bridge is the only way in.**

Robinhood Chain is an **Arbitrum Orbit L2 settling to Ethereum**, so its canonical bridge is
Arbitrum's:
`https://portal.arbitrum.io/bridge?destinationChain=robinhood-chain&sourceChain=ethereum`.
Confirmed against `docs.robinhood.com/chain/bridging` rather than any of the several SEO
"RobinBridge"-style sites a search returns first — in a repo whose incident was an address
substitution, a look-alike bridge domain is the same attack with a nicer front end.

Four things measured on the way through, none of them guessable:

- **The deposit keeps ~0.0001 ETH.** 0.0038 sent, **0.003694736** arrived — the difference pays the
  retryable ticket that executes the deposit on L2. Budget for it; it is not a fee schedule error.
- **L1 gas was 0.09 gwei** (two independent RPCs agreeing), making the deposit itself ~0.0000093
  ETH. An earlier assumption here that L1 gas would dominate small transfers was wrong by two
  orders of magnitude, and it changed the advice: there is no reason to over-bridge.
- **The exit is 7 days**, challenge period plus a manual claim on Ethereum. In at 10 minutes, out at
  a week — which is the real argument against parking a large balance on 4663, not the gas.
- **Robinhood's own app cannot send ETH onto Robinhood Chain.** Its support page lists the chain for
  transfers but never as a withdrawal destination, and neither official page describes that path.

The safe funding order, and the reason for each step: bridge to **your own address** with the
recipient field untouched, so no address is typed anywhere; then a **0.0001 test transfer** to the
target; then read the target's balance **from the chain** before sending the rest. That last step is
the control that actually works — a clipboard hijacker substitutes what you copy, so comparing what
you pasted against what you meant to paste compares two copies of the same substituted string,
while a balance read against the address in `config.ts` cannot be fooled by it.

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

**Web half closed 2026-08-16.** All five pins are gone from production code; what remains are
test fixtures naming a network on purpose and one comment recording what used to be there.

- [x] **Explicit `chainId` on every browser read and write.** Verified in wagmi's source, and the
      reason the ordering mattered: a write with no `chainId` skips `assertCurrentChain` and goes
      to whatever chain the wallet is on, while a read resolves against `config.state.chainId`, so
      a mainnet vault's address gets read over the testnet RPC — which returns _data_, not an
      error. On `useReadContracts` the key goes on **each contract entry**; a top-level one is
      accepted and silently ignored, which is a fix that looks right and does nothing.
- [x] **`RequireNetwork` replaces `NetworkGuard`**, declared per surface. Most surfaces need
      nothing, because pinned reads are correct on any chain — what needs a gate is a **write**.
      Three mounts, all inline around an action: the kill switch and the key revoke (the vault's
      own network, inside each owner check so non-owners are not prompted for a control they are
      not offered), and the top-up button (whichever network sells credit). That last one was
      never behind the old guard at all — it renders on `/pricing`, outside `/app/*`, and it is
      the only place in the app where the wrong chain costs money rather than confusion.
- [x] **`useChainId()` is no longer used for gating.** `syncConnectedChain` drops any chain not in
      the configured list, so it returns testnet by default and a wallet on Ethereum **passed the
      old guard**. Everything now reads `useAccount().chainId`, and `describeChain` names a
      foreign chain honestly instead of rounding it to one of ours.
- [x] **The wizard follows the wallet's chain.** Its five import-time constants are per-render
      values; `DEFAULTS` became `defaultsFor(assets)` and is re-seeded on chain change, closing
      the case where filling the form on testnet and switching to mainnet wrote a **testnet
      Chainlink feed into a mainnet vault**. The deploy captures its target chain, so
      `waitForTransactionReceipt` cannot end up polling the wrong one and hanging forever, and a
      half-deployed vault asks the user to switch back rather than letting a retry create a
      second one.
- [x] **SIWE accepts either of our chains.** It signed and verified a compiled-in `46630`, so a
      mainnet wallet failed with "signature did not match" halfway through the journey the
      product is built around. `domain`, `uri`, the single-use nonce and the address are all
      unchanged; the accepted set widens from one message to two. `chainId` is validated as an
      **integer**, not just as a known value — `buildSiweMessage` joins with newlines, so a string
      would let a caller append lines to the message being verified.
- [x] **Copy that asserted one network is derived now.** The GeoGate consent dialog said "no real
      funds are at risk"; left as text, that becomes a materially false risk statement the moment
      mainnet opens. "Free, on testnet" was left alone — permanently true by product decision.
- [ ] **Mainnet is nine signatures, not six** — five equities rather than two. Nothing to fix; the
      ledger is already generated from the selection. Worth knowing before quoting the flow.

Two items were removed from this list on 2026-08-16 rather than ticked, because they were stale
duplicates of the `[x]` entries above and would have been read as open work: the SIWE `chainId`
item (closed by `siweChain.ts` — the session is not chain-scoped, so no re-auth path was needed)
and the `NetworkGuard` item (closed by `RequireNetwork`, mounted per control; the global gate is
gone from `app/layout.tsx` and `NetworkGuard.tsx` is deleted).

### Security and ownership — must happen before mainnet money

- [ ] **Transfer `PunoCredits` ownership off the hot `.env` key.** Whoever owns it can move the
      treasury and therefore redirect every payment.
      **Correction 2026-08-15: the contract already extended `Ownable2Step`** — this was never
      code work, and the checklist's earlier wording implied otherwise. What was missing, and is
      now done, is that `DeployMainnet` accepts `PUNO_OWNER` and calls `transferOwnership` in the
      deploy transaction (refusing an owner equal to the deployer), and warns loudly when it is
      unset. **Still open, and operational:** two-step means the handover is _not complete_ until
      that address calls `acceptOwnership()` itself — until then the deployer's hot key still
      controls the treasury. Verify with `cast call <credits> "owner()"`, never by reading the
      deploy log.

#### The two launch addresses, chosen 2026-08-17 — and what was accepted with them

Both recorded in the root `.env`, both public, both verified as EOAs with valid checksums and
distinct from the deployer, the service agent and the two incident addresses.

| Role            | Address                                      | What it can do                        |
| --------------- | -------------------------------------------- | ------------------------------------- |
| `PUNO_TREASURY` | `0x8bF1775b5e7Bbfc37aE7147C3Bd69c5513d687E3` | receives every payment                |
| `PUNO_OWNER`    | `0xef048611d7F3077b35Fab260565886186fDa32bA` | owns `PunoCredits`; can move treasury |

**The treasury had to be a second address, and the reason is not tidiness.** `PunoCredits.deposit`
rejects `msg.sender == treasury`, so a treasury equal to any wallet the owner actually uses means
that wallet can never buy credit — the payment path becomes untestable from the one account most
likely to test it. This already happened once: `DeployTestnet` made the deployer both, billing was
unexercisable out of the box, and it took a manual `setTreasury`. On mainnet `setTreasury` is
owner-only, so the same mistake costs a cold-wallet transaction rather than a shell command.

**What was accepted, deliberately and with a date: there is no hardware wallet and no multisig, so
`PUNO_OWNER` is a browser key.** Whoever holds it can redirect every payment the product ever
takes. Two things bound the exposure and neither removes it: `Ownable2Step` means ownership can be
handed on later without redeploying, and `withdraw` stays owner-only on each vault so user funds are
never reachable from here.

**The two addresses are MetaMask accounts 1 and 2, which share one seed.** So the separation is
organizational — accounting, and the `deposit` rule above — and **not** a security boundary: one
leaked seed phrase compromises both roles and the owner's everyday wallet at once. Recorded because
"treasury ≠ owner" reads like two domains and here it is one. The operational consequence is that
**the seed phrase now needs the same care as the agent key** — written down, verified, stored away
from the laptop.

Revisit trigger, so this is not carried by memory: the first real revenue, or a hardware wallet
entering the picture, whichever comes first. Moving is one `transferOwnership` plus one
`acceptOwnership`, and `preflight` reports the pending state in between rather than calling it done.

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

Settled 2026-08-16 and no longer tracked here: **the launch rate and the supply**. The owner is
handling both; $0.00001 is the working rate the product is built and previewed against, to be
replaced with the final one when it exists. The reasoning behind the number is kept under
_Choosing the launch price_ below, because the reasoning is what a later reader will need — the
decision itself is not ours.

**This is not the same as the rate being handled.** Writing it on mainnet is still a step, and an
easy one to skip because nothing fails loudly until the first deposit arrives: it is step 3 of
_The order on the day_ below, and `preflight` checks the rate's age.

- [ ] **Treasury must convert received PUNO to USDG promptly.** Balances are denominated in USD;
      if the treasury holds PUNO, we carry a USD liability backed by a floating asset.
- [ ] **Regulatory.** Selling a token for access to a service that trades securities is two
      overlapping surfaces, not one. Unresolved; not blocking a testnet demo.

### Choosing the launch price

Worked out 2026-08-16. The framing matters more than the number.

**The price is chosen, not predicted.** We seed the pool ourselves, so
`price = USDG in pool ÷ PUNO in pool` and `FDV = price × supply` — both ours. Pick the price for
readability and the supply for the FDV; comparable tokens inform the FDV and never the per-token
price, because a token at $0.000001 is a $1k project at 1B supply and a $100k one at 100B.

**The comparable set on this chain is not usable directly.** The Noxa launchpad put out 60,000+
tokens in about eleven days — roughly 75% of all deployments on the network — of which one
(CASHCAT) reached $226M and the median is zero. An average over that is either ~0 or $226M
depending on how you take it, and neither is a reference for a payment token backing a dollar
liability. Noxa itself stopped launching on 11 July and went dark, so the venue is an open
question too.

**The owner's working rate is $0.00001**, raised from $0.000001 on 2026-08-17 (and that from an
earlier $0.0004). Every number in the product still lands round:

| Rate PUNO    | screen $0.01 | decision $0.50 | trade $0.25 | $20 top-up    |
| ------------ | ------------ | -------------- | ----------- | ------------- |
| $0.01        | 1            | 50             | 25          | 2,000         |
| $0.001       | 10           | 500            | 250         | 20,000        |
| $0.0004      | 25           | 1,250          | 625         | 50,000        |
| **$0.00001** | **1,000**    | **50,000**     | **25,000**  | **2,000,000** |
| $0.000001    | 10,000       | 500,000        | 250,000     | 20,000,000    |

**The 2026-08-17 change was for readability and nothing else, and the distinction matters.** The
launch price is _chosen_ — we seed the pool, so `price = USDG ÷ PUNO in pool` — which means "this
rate is more realistic" is a category error. What is real is that one order of magnitude shortens
every figure a user reads: a $50 top-up went from fifty million PUNO to five million.

`set-rate` refused it until `--force`, correctly: the guard is 4× and this was exactly 10×, which
is the shape of a dropped zero. The guard cannot tell an intended factor of ten from a typo'd one —
only a human can, which is the entire reason it stops and asks rather than deciding.

Above about $0.01 the cheapest action falls under 1 PUNO and the token reads as more expensive
than it is. There is no matching wall at the small end — an earlier note here guessed one at
$0.00001 and that guess was wrong, which the move to exactly that rate now demonstrates rather
than argues. Supply follows from the FDV, and it moves with the price: at $0.00001 a $250k FDV is
25 billion tokens, where at $0.000001 it was 250 billion.

**The real floor is arithmetic, and it is much lower.** `usdToTokens` computes
`(usd / price) * 1e6` as a float before reaching bigint, and that product passes
`Number.MAX_SAFE_INTEGER` at around **$5e-9** for a $50 top-up. The working rate sits ~200×
above it. `pricing.test.ts` now exercises 1e-6, 3.7e-7 and 1e-8 against the "never quote less
than requested" invariant, so the margin is measured rather than assumed — but a rate below about
1e-8 needs that helper reworked, not just re-entered.

**The binding constraint is pool depth, not FDV.** We take PUNO and owe dollars, so revenue must
be sold into our own pool; at depth `L` a sale of `R` moves the price by roughly `R/L`, which puts
`L ≳ 50 ×` daily revenue — a few thousand dollars at first, which is achievable. But the
single-sided Uniswap V3 pattern this chain's launchpads use puts **no USDG in the pool at all**
until someone buys, so on day one there is nothing to sell revenue into. That is exactly the
liability the treasury-conversion item above names, arriving through a different door.

**Set `PUNO_MIN_DEPOSIT` deliberately low — around a $1 equivalent, not $5.** There are two
minimums and they drift apart with the market. `MIN_DEPOSIT_USD = 5.0` is display only; there is
no server-side check, verified. `PunoCredits.minDeposit` is raw token units and is the hard
on-chain gate. Denominate the on-chain one at $5 and a 5× price rise makes it a $25 floor while
the UI still promises $5, and deposits start reverting with `PunoCredits: below minimum` — fixable
only by a transaction from the cold owner wallet. At a $1 equivalent it does the job it is
actually for, keeping out dust that costs more to index than it is worth, and the $5 product
minimum stays where it belongs, in the interface. A price rise then locks nobody out, and a fall
just admits slightly smaller deposits, which is harmless.

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
| `pnpm test`                          | **281** — shared 94, agent 143, web 44 |
| `forge test -vv` (from `contracts/`) | **91/91**                              |
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

### 4b. Mainnet deploy — done for the factory, 2026-08-17

**`DeployMainnet` has been broadcast.** `VaultFactory` is live at
`0x57b35e8D7F2Bfd27B8D26cDeB7a36eb27Ce5a679` on 4663, deployed at nonce 1 for the reason under the
ownership section above, with `quoteToken()` read back from chain as mainnet USDG. Mainnet did **not**
open: `whyClosed()` gates on `punoCredits`, which is the entire point of the split.

One test failed on the config commit and it was right to. `policy.test.ts`'s first case asserted
`/VaultFactory/` in `whyClosed(NETWORKS.mainnet)` — true only while the factory was the first null,
so its name ("names the PUNO launch as what closes mainnet today, **not** the factory") described an
intent the assertion contradicted. With the factory deployed the predicate finally reaches the branch
it exists for, and the assertion now reads `/PUNO has not launched/` plus `doesNotMatch(/VaultFactory/)`.
A test pinned to the live table is what caught the state change; keep it that way.

The numbers below are from the run. `DeployPunoCredits` is the deploy still ahead, and it needs
three values that do not exist yet — see the T-0 section.

| Fact                     | Value                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| Chain id seen            | 4663                                                                                                    |
| Gas used                 | 3,483,526 — the estimate was exact; the gas _price_ was 0.0403 gwei, not the 0.056 seen on 2026-08-16   |
| ETH required             | **0.0000541 actual**, measured on the real broadcast 2026-08-17; forge estimated 0.000141, padding 2.6× |
| `PunoCredits`            | correctly skipped, `PUNO_TOKEN_ADDRESS` unset                                                           |
| Deployer balance on 4663 | **0.001045 ETH** after the deploy and the nonce bump; funded 2026-08-17                                 |

Two things this settled that were open questions:

- **The Cloudflare batching problem does not break `forge script`.** It was a real risk that the
  padded JSON-RPC batches forge sends would come back as an HTML interstitial. They do not.
- **USDG hardcoded in the script is correct**: symbol `USDG`, 6 decimals, live at
  `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`.

- [x] **Nonce bumped and the factory deployed, 2026-08-17.** The deployer's mainnet nonce was 0, so
      `VaultFactory` would have landed at `0x5fecF7bA6365E6763b8984c43307B417A498aD40` — **the same
      address that is Mock USDG on testnet**, because the same deployer at the same nonce produces
      the same address on any chain. Confirmed by `cast compute-address`, not assumed. Both would
      have been real, on their own chains, forever, and two identical strings cannot be told apart by
      eye — which defeats the one control this project actually has after the clipboard incident. A
      zero-value self-transfer (21,000 gas, 0.00000042 ETH) moved it. **`VaultFactory` is now at
      `0x57b35e8D7F2Bfd27B8D26cDeB7a36eb27Ce5a679`**, checked distinct from that address, from both
      incident addresses, from mainnet USDG and from the testnet factory, and against empty bytecode
      before broadcasting. Real cost **0.0000541 ETH** against forge's 0.000141 estimate — it pads
      ~2.6× here, matching the 2.4× measured on testnet. `quoteToken()` reads back as mainnet USDG.
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

| #     | Item                                                                                    | Whose  | State                                              |
| ----- | --------------------------------------------------------------------------------------- | ------ | -------------------------------------------------- |
| ~~1~~ | ~~Dedicated **mainnet worker key**~~ — `0x0aCd6ea5…`, in `serviceAgent`                 | ours   | **Done 2026-08-15**                                |
| ~~2~~ | ~~**Hosting**~~ — web, site and the testnet worker all live; see below                  | both   | **Done 2026-08-16/17**                             |
| 3     | **PUNO** exists, with a decided USD rate and a treasury conversion routine              | theirs | Not started                                        |
| 4     | ~~`DeployMainnet`~~ done 2026-08-17; `DeployPunoCredits` + `punoCredits` in `config.ts` | both   | **Half done** — factory live, billing blocked on 3 |
| 5     | Multisig created and calling `acceptOwnership()` on `PunoCredits`                       | theirs | Not started                                        |
| —     | ~~Audit~~                                                                               | —      | **Deferred by decision 2026-08-16**                |

The dependency is strict: 3 gates 4, 4 gates any real user, and 2 gates all of it being public.

### T-0 — the moment the PUNO address arrives

The owner's stated goal: hand over one contract address and have the product go live, rather
than start rebuilding then. **That is achievable, but "paste the address" is not what happens** —
`PunoCredits.token` is immutable, so the billing contract cannot exist before the token and T-0
necessarily contains an on-chain deploy. Target shape: verify the token → one `forge script` →
**one commit to `config.ts`** → hosts rebuild themselves → `preflight` green.

Four things must be built before that is true, none of which existed on 2026-08-16:

- [ ] **Read `decimals()` off the token before the first deposit and put it in `punoDecimals`.**
      18 is the ask, and it is what `config.ts` already says — see _Decimals_ below for what
      actually breaks if it is not.
- [x] **Split `DeployMainnet`. Done 2026-08-16.** It _always_ deployed `VaultFactory`, so a T-0
      run after an early factory deploy would have created a **second** factory at a fresh address
      while the first — already in `config.ts`, possibly already holding user vaults — stayed
      where it was. `DeployPunoCredits.s.sol` now deploys billing and nothing else, and
      `DeployMainnet` **refuses** rather than ignores `PUNO_TOKEN_ADDRESS`. Three guards it
      lacked: `treasury != deployer`, `PUNO_OWNER` required rather than optional-with-a-warning,
      and `minDeposit > 0`. `forge test` 80 → 91.
- [x] **A write path for the PUNO/USD rate. Done 2026-08-16.** See _The rate: how it is written
      and when it expires_ below.
- [x] **`preflight`. Built 2026-08-17** — `pnpm --filter @puno/agent preflight`. Fifteen rows, all
      read from the chain or the database rather than from a deploy log. See _What preflight is_
      below for what it checks and what it found on its first run.

#### What `preflight` is

`apps/agent/src/preflight/` — `checks.ts` holds the predicates with no I/O, `run.ts` gathers and
prints, the same split as `rate-input.ts` vs `set-rate.ts`. 33 tests on the pure half.

It covers the list this item originally asked for: bytecode at every recorded address,
`PunoCredits.token()` against config, `decimals()` against `punoDecimals`, `owner()` **and
`pendingOwner()`** together, treasury ≠ deployer and ≠ owner, `VaultFactory.quoteToken()` == USDG,
ETH for `serviceAgent` and the deployer, rate freshness via `usableForCredit`, the ledger invariant
across every account, and a machine sweep for the two incident addresses over every value the run
touched — config fields and chain reads alike.

**Four statuses, not two, and that is the design decision worth keeping.** `skip` means the check
could not be performed and **blocks a green verdict**; `na` means there is genuinely nothing there
on this network — mainnet has no PUNO, testnet has no cold wallet — and does not block, but is
still printed and counted in the headline. A two-state table collapses "we could not find out" into
the same silence as "nothing to find", and the first is the state this command exists to catch.
`PUNO_OWNER` unset on mainnet is a **fail**, not a skip: unproven ownership is not proven ownership.

Two expectations cannot come from the chain and are read from the environment, both public
addresses and never keys: `PUNO_OWNER` (the cold wallet) and `DEPLOYER_ADDRESS`. It also prints the
database host, because half the rows describe a database and a run against localhost looks exactly
like a run against Neon — the same class of mistake `set-rate` avoids by printing the previous rate.

#### What its first run found, 2026-08-17

Against testnet: 11 pass, 1 fail, 1 skip, 2 n/a. The failure was real and was not otherwise visible.

- [x] **`serviceAgent` `0x389AA9c0…0adD` held ~0.0000016 ETH on testnet — refilled 2026-08-17**, now
      0.010001 ETH, verified independently with `cast balance`. The hosted worker runs with
      `DRY_RUN=false` and the price keeper broadcasts `setAnswer` on a timer, so the balance was
      being spent as it sat. When it empties, mock feeds go stale within the hour and the demo agent
      declines to trade — the failure CLAUDE.md calls the worst possible first impression, and it
      arrives systematically rather than occasionally. Top up from
      `https://faucet.testnet.chain.robinhood.com`; testnet ETH cannot be bridged in.
      **Measured cost, since the estimate above was a guess:** the delta between two balance reads
      was exactly `418560000000` wei — a clean gas × price product, so one keeper transaction at
      **4.1856e-7 ETH**. 0.01 ETH is therefore ~24,000 transactions. Do not convert that to days
      from two samples; the balance was nearly empty for part of the window, so the observed
      frequency is a floor rather than the rate.
- [x] **The remaining SKIP closed 2026-08-17.** It and the deployer-gas n/a were one unset variable
      seen twice: `DEPLOYER_ADDRESS` was in neither `.env` nor `.env.example`, so a command that
      refuses to go green without it was asking for something the template never mentioned. Now
      documented, with the instruction to **derive it rather than type it** —
      `cast wallet address --private-key` is the one path a clipboard substitution cannot reach.
      Testnet reads **14 pass, 0 fail, 0 skip, 1 n/a — READY**.
      Two caveats that verdict does not cover. The rate and ledger rows were read from
      `localhost/puno`, not Neon, which is exactly why the banner prints the host. And `preflight` is
      deliberately **not** wired into `fly.testnet.toml`'s `release_command`: `DEPLOYER_ADDRESS` is
      not a Fly secret, so it would SKIP, exit 1, and block every deploy of a worker that was fine.

Writing the checks also turned up a message that contradicted itself: a balance one wei under the
floor printed as "holds 0.001000 ETH, under the 0.001 floor", because `toFixed` rounds. Balances are
truncated now — rounding one up is wrong in every direction in a message about a shortfall.

#### Decimals

`decimals` is metadata, not arithmetic. ERC-20 balances are integers with no fractional part;
`decimals()` only says where a reader should put the point. At 18, one PUNO is stored as
`1000000000000000000`. Our code multiplies and divides by `10 ** punoDecimals` to move between
the two.

18 is the ask because it is the ERC-20 default, it is what every wallet, explorer and DEX assumes,
and it is what `config.ts` already carries.

**Correction 2026-08-16:** this used to say a token deployed with 9 decimals "becomes code, at the
worst possible moment". Checked, and no longer true. T1 threaded `punoDecimals` through every PUNO
conversion — `watcher.ts`, `claim`, `balance`, `pricing`, `set-rate`, the top-up card — so a
non-18 token costs one config field. The remaining hardcoded 18s are the vault's USD convention
(`maxNotionalPerTrade`, NAV, `RiskLimitsPanel`) and have nothing to do with the token.

What is dangerous is a **mismatch** between the config value and the chain, in either direction,
because nothing else in the system would notice. Off by nine and every deposit is credited a
billion times wrong — silently, at the moment real money starts arriving. `preflight` comparing
the two is the whole control, which is a stronger argument for building `preflight` than the
original wording was.

#### The order on the day

1. The CA arrives. **Read the address back visually** before it goes into any command — the
   clipboard rule, and this is the one moment it exists for.
2. Read from chain: `name()`, `symbol()`, `decimals()`, `totalSupply()`.
3. `pnpm --filter @puno/agent set-rate -- <price> --note "launch"`. Before the deploy, not after:
   crediting fails closed without it, and the failure is silent until the first deposit.
4. `DeployPunoCredits.s.sol` with `PUNO_TOKEN_ADDRESS` / `PUNO_TREASURY` / `PUNO_OWNER` /
   `PUNO_MIN_DEPOSIT`. **Record the deployment's block number** — step 7 needs it.
5. The cold wallet calls `acceptOwnership()`. Verify with `cast call <credits> "owner()"`, never
   from the deploy log — the log says what was requested, the call says what is true.
6. **One commit** to `config.ts`: `punoToken`, `punoCredits`, and `punoDecimals` if step 2 said
   anything other than 18. `vaultFactory` is already there — `0x57b35e8D…a679`, deployed
   2026-08-17, so this step is one field short of what it used to be. Push; the
   hosts rebuild themselves.
7. `CREDITS_WATCHER_START_BLOCK` = the block from step 4, then start the mainnet worker.
8. `preflight` — every row green.
9. Verify both contracts on Blockscout.

Failure modes worth knowing before they happen:

| What went wrong              | How it shows                        | What to do                                                                                                                                                                     |
| ---------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `decimals()` is not 18       | step 2                              | Survivable — set `punoDecimals` to match. Do **not** proceed on the assumption it is 18                                                                                        |
| Wrong address deployed       | `preflight` red on `token()`        | Redeploy; the contract is cheap. But the indexer cursor is keyed by **chainId, not contract**, so `CREDITS_WATCHER_START_BLOCK` and `indexer_state` must be reconciled by hand |
| Cold wallet has not accepted | `preflight` shows deployer as owner | Mainnet can open, but a hot key controls the treasury. This is the one failure that is a decision rather than a bug                                                            |
| Rate expires                 | `claim` 503, indexer stalls         | Nothing lost — the cursor did not move. Set a rate and the deposits replay                                                                                                     |
| Need to close mainnet again  | —                                   | `punoCredits: null` in one commit. `whyClosed()` shuts the wizard, the worker stops indexing, credited money stays in the ledger                                               |

### The rate: how it is written and when it expires

Built 2026-08-16. Nothing in the repo used to insert into `token_price_overrides` — it was
hand-written SQL — and a stale rate stops crediting entirely.

**Writing it:** `pnpm --filter @puno/agent set-rate -- <price> --note "<why>"`. A script rather
than an `/api` route, for the same reason as the trial-console decision above: the product has no
admin surface, and one field does not justify creating and defending one. `--note` is required,
because the table is append-only and is therefore the only record of why a rate was what it was.

Three things beyond the insert, each earned rather than decorative:

- **Preview before write.** Prints what the rate turns every price into, through the real
  `usdToTokens` rather than a second formula. The rate is abstract going in and means something
  only as prices — "$0.0001" says nothing about whether a market check should cost 100 PUNO, and
  that is the judgement actually being made.
- **Refuses a change over 4×** without `--force`. A dropped or added zero is always a factor of
  ten. This is the only check between a keystroke and the number every deposit is valued at — the
  same position the visual address check occupies after the clipboard incident. It fired on its
  first real invocation, catching a 10× step against the existing testnet rate.
- **Refuses a price below `1e-12`**, which `numeric(24, 12)` stores as zero; the failure would
  otherwise surface on the first deposit as "not a usable price", a long way from the typo.

**Expiry is now two windows, not one.** `MAX_OVERRIDE_AGE_MS` was 7 days and governed both
crediting and display, so narrowing it for a volatile launch would have blanked the public pricing
page at the same moment billing stopped — and those failures are not comparable. Now
`MAX_OVERRIDE_AGE_MS = 72h` (crediting) and `MAX_DISPLAY_AGE_MS = 7d` (display), the same shape as
the contract's `QUOTE_STALENESS` vs `EQUITY_STALENESS`.

That creates a state which did not exist before — a rate fresh enough to show and too old to
charge against — so `TokenPrice` carries `usableForCredit` and `TopUpCard` stops quoting an amount
to send when it is false. That quote is a transaction instruction, not a price label.

**Crediting went 24h → 72h on 2026-08-17, and the reason is the refresh schedule rather than a
change of risk appetite.** While a human writes this number, what governs whether billing survives
is `window − refresh interval`. At 24h refreshed daily that slack is zero: one forgotten evening
stops crediting. 72h absorbs two consecutive misses — an unstaffed weekend, one sick day. Not a
week, because a stale rate cuts both ways and only one way is bounded: buy-cheap-deposit-high tops
out at our Anthropic bill, while a rate that lags a rising token short-changes the depositor with
no ceiling at all, and a launch week moves in multiples. `OVERRIDE_WARNING_AGE_MS` went 12h → 24h
in the same pass: a full day of margin rather than half the window, since a warning that fires
while the daily habit is still working is one an operator learns to skip.

**The window is not a deadline — the rate can be written at any time.** Age is measured from the
newest row in an append-only table, so `set-rate` resets the clock whenever it runs, and
`checkRateChange` gates only the price ratio, never the frequency. Refresh on a chosen schedule and
the window is never approached. Note the corollary for cadence: Friday morning to Monday morning is
72h exactly, so a Mon/Wed/Fri habit sits precisely on the limit with no margin — daily is the
cadence this window was sized for.

The worker warns hourly (`rateStalenessWarning`), on its own timer rather than inside the deposit
poll: the rate expires whether or not anyone is depositing, and the quiet week is the case worth
catching. **When it does expire nothing is lost** — the indexer refuses to advance its cursor past
an event it could not value, and every deposit replays once a rate is set.

**The manual rate is a bridge, and its successor is already a seam.** `readPoolTwap()` returns
null today, and `resolveTokenPrice` already prefers it over anything written by hand — marking it
`usableForCredit` with no staleness window at all, because a pool read is current by construction.
When PUNO has a pool, exactly one function changes and the manual rate demotes itself to the
fallback it should always have been. Nothing else in the pricing path moves.

**Deferred by decision on 2026-08-17, with a trigger rather than a someday.** The owner's
instruction is that mainnet reads the price live; the deferral is about sequencing, not about
whether. Building it now would be automation against zero deposit flow, and the manual path
became liveable in the same pass — 72 h window, refreshable at any time, so the job is
remembering once a day with two misses of slack.

**The trigger is an observable event, not a judgement: the first deposit that arrives on a day
nobody refreshed the rate.** That is the first moment a real person waits on our schedule, and it
is the signal that the manual path has been outgrown. Watch for it in the worker log — a
`[credits] cannot value deposit` line is exactly that event.

Two things about it that are easy to get wrong later, so they are recorded now. It **can be built
before PUNO exists**, because the precondition is depth in _some_ pool for the code path, and the
mainnet Uniswap V3 deployment already has real USDG pools to verify against
(`PHASE4-ROUTING-2026-08-14.md`); at T-0 the pool address changes and nothing else. And the pool
**exists on day one** rather than later, because the owner seeds it — "when PUNO has a pool" is
T-0, not a distant milestone. Add a **liquidity floor** that returns `null` below a threshold so a
thin launch-day pool falls back to the manual rate and the system switches itself over as depth
grows, with no second code change.

**Read the pool, not a price API.** DexScreener does index this chain (`chainId: "robinhood"`,
confirmed 2026-08-16) and is the obvious thing to reach for once trading starts, but it is the
wrong input for the crediting path on three counts, none of them about uptime. It reports spot,
and spot is buyable: push the pool up, deposit at the inflated rate, let it fall back — a TWAP
makes an attacker hold the move for the whole window, which costs real money. It puts a third
party in the money path, where this project's rule is that a failed credit is replayable from
chain and a wrong one is not. And it returns _pairs_, plural, so "which pool" becomes a heuristic
that anyone can seed a second pool to play with, where a pinned address is a decision made once
and auditable. DexScreener earns a place as a divergence alarm against our own read — that catches
the pinned pool going illiquid, which an on-chain read cannot report about itself — but not as the
number a deposit is valued at.

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

### Hosting — all three are live

`DEPLOYMENT.md` is the runbook. Written and committed: `apps/agent/Dockerfile`, `.dockerignore`,
`apps/agent/fly.testnet.toml`, `apps/agent/fly.mainnet.toml` (written 2026-08-17, validated by
`fly config validate`, **no app deployed from it yet**), and a `vercel.json` for each app. Still
absent: CI and a worker health endpoint.

**Deployed 2026-08-16 and verified by fetching it:** Postgres on Neon with all thirteen tables,
`https://puno-agent-web.vercel.app` serving, and `/api/pricing` returning the rate written by
`set-rate` — `source: "override"`, $0.000001, with `pricesTokens` at 10K / 500K / 250K PUNO. That
one response proves the whole chain end to end: Vercel reaches Neon, the rate is stored, and the
USD-to-PUNO conversion runs server-side as designed.

**The worker is live too, as of 2026-08-16 22:39 UTC.** `puno-worker-testnet` in `iad`, one
machine, `DRY_RUN=false`. Its startup log is the verification and each line answers a question
that mattered: it signs as `0x389AA9c0…0adD`, which is `NETWORKS.testnet.serviceAgent` and
therefore the address every testnet vault is armed with; the deposit watcher attached to
`PunoCredits` at `0xD0D4B4…D74f6`; the price keeper is running, so mock oracles stay fresh and
the demo agent has a mark it will trade against; and there is no `[rate]` warning, so the rate is
current. `fly machines list` shows exactly one machine — `--ha=false` held, which is the one
setting here whose failure spends a user's balance twice.

The release command behaved as designed and that is worth recording, because it only shows itself
on a deploy: migrations ran on their own machine, printed `Migrations applied.`, exited 0, and
were not restarted. A migration that failed would have left the running worker in place rather
than half-replacing it.

**This closes the rate-expiry gap by itself** — `rateStalenessWarning` runs inside this process
and warns with 24 h of the 72 h window left, so the rate can no longer expire unannounced.

Two things were caught by reading rather than by running, and both would have failed the first
`fly deploy`:

- `tsx` was in `devDependencies` while `start` is `tsx src/main.ts`. An image built with `--prod`
  builds cleanly and dies on boot with "command not found". Moved to `dependencies`, where it
  belongs — `@puno/shared` ships TypeScript source, so tsx is this app's runtime, not a build tool.
- **Corrected 2026-08-17, by execution.** This bullet used to say the `dockerfile` path is
  root-relative because the build context is the working directory. That is backwards on the half
  that matters, and following it produces
  `apps/agent/apps/agent/Dockerfile not found` — which is how the first `fly deploy` actually
  failed. The two paths in one command are measured from **different places**: the build context is
  the working directory (hence `fly deploy .` from the repository root, so the lockfile and
  `packages/shared` are in scope), while `dockerfile` inside `fly.testnet.toml` resolves against
  **the directory holding that file**. So it reads `Dockerfile`, not `apps/agent/Dockerfile`. The
  positional `WORKING_DIRECTORY` argument does not change the second one. Fly's own docs read the
  other way; the observed behaviour wins.

Checked 2026-08-15 and still true: `docker-compose.yml` starts **Postgres only**. The laptop no
longer hosts anything load-bearing — Neon holds the database and the worker runs on Fly — though a
local worker and both dev servers are still routinely up for development, which is why `preflight`
prints the database host.

The reason this was worth doing before the token rather than after: the largest product gap is the
absence of a public track record, and it closes only by accumulating history. Every day the worker
is not running somewhere that stays on is a day missing from that record. **As of 2026-08-16 that
clock is running** — which is also why the free-tier runs on `/app/try` matter now rather than at
T-0, since `/demo` is where the accumulated record becomes visible to a stranger.

Also load-bearing once real users exist: `tickAllAgents()` walks every live agent **sequentially**
inside one `TICK_INTERVAL_MS` window. Fine at today's count; at some N a pass outruns its own
interval. Not a launch blocker, but the first thing that will bend.
