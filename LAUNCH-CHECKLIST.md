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

| #       | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Where                                                                               | State                          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------ |
| **B1**  | **Real router integration.** Steps 1–2 done: a `RouterAdapter` seam, and a `UniswapV3Adapter` that quotes all four fee tiers through `QuoterV2` and encodes `SwapRouter02.exactInputSingle`. ABIs read from the verified source of the deployed bytecode; quoting re-verified against the live chain 2026-08-15. **Step 3 is B1a.**                                                                                                                                                  | `apps/agent/src/routing/`                                                           | **Nearly closed**              |
| **B1a** | **The wizard allowlists 1inch; the adapter serves SwapRouter02.** `new/page.tsx` writes `network.routers.oneInch` into `allowedRouters`, so a mainnet vault created through the UI allowlists a router `UniswapV3Adapter` refuses to build calldata for — deliberately, since an adapter free to pick its own target would route around the allowlist. The vault must allowlist `uniswapV3.swapRouter02` instead. Small change; it is the last thing between B1 and a mainnet trade. | `apps/web/src/app/app/agents/new/page.tsx`                                          | **Open — do together with B2** |
| **B2**  | **Wizard allowlists only the quote token.** `setPolicy` gets `allowedTokens: [quoteToken]` and `setPriceFeed` is called for the quote alone, so a vault created through the UI can never trade an equity. Real Chainlink feed addresses have never been put into config.                                                                                                                                                                                                             | `apps/web/src/app/app/agents/new/page.tsx`, `packages/shared/src/network/config.ts` | **Open**                       |
| **B3**  | **PUNO does not exist on mainnet.** `NETWORKS.mainnet.punoToken`/`.punoCredits` are `null`, so `runDepositWatcher` returns immediately. Nothing to fix in code — a sequencing fact.                                                                                                                                                                                                                                                                                                  | `apps/agent/src/indexer/watcher.ts`                                                 | Blocked on the token itself    |

**B1 decision already taken (do not re-litigate):** Uniswap V3 directly first, 1inch later.
Addresses, liquidity and a live quote are in `PHASE4-ROUTING-2026-08-14.md`. Two traps recorded
there: **symbol lookup is not identity** (`loxAAPL`, `AAPLCAT`, two different `loxTSLA` all
exist), and periphery contracts must be resolved by `factory()`, never by name.

B1 needs a real _quote_, not just real calldata: `MockRouter.swap` takes `amountOut` as an exact
argument and always fills at the modelled price, so `risk.ts`'s sizing has never met a venue that
can fill differently.

### Security and ownership — must happen before mainnet money

- [ ] **Transfer `PunoCredits` ownership off the hot `.env` key** using `Ownable2Step`. Whoever
      owns `PunoCredits` owns credit issuance.
- [ ] **Contract audit.** Scope grew with `PunoCredits`; the $10–30k estimate roughly holds.
- [ ] **Fuzz tests on `AgentVault` arithmetic** — never written.
- [ ] **`DeployTestnet` deploys with `treasury == deployer`** (D4), so `PunoCredits.deposit`
      reverts on a self-transfer and the billing path is untestable out of the box. Fix belongs in
      the script, not the contract. Also worth a clearer revert string than "nothing received".
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
4. [ ] **`dry_run` is not user-settable** — honoured by the worker, shown as a badge, but the user
       cannot choose paper mode.
5. [ ] **The comparison replay is invisible** — we pay for it and show the user nothing.
6. [ ] **The oracle floor is unadvertised** — our strongest safety claim appears nowhere.

### Copy that is currently untrue

- [ ] **`Today · 1,842 ticks routed`** in `apps/site/src/components/sections/CostRouting.tsx` is
      invented and presented as live, while `ConsoleMock` right next to it _is_ labelled
      "Illustrative". For a product pitched as "proof, not promises", fix or label it.

### Housekeeping

- [ ] **`pnpm format:check` fails on 31 files** — all pre-existing, none from the UI-density or
      403 work. Not a regression. Run `pnpm format` once, in its own commit, so the check becomes
      a usable signal instead of permanent noise.

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
| `pnpm test`                          | **131** — shared 51, agent 74, web 6   |
| `forge test -vv` (from `contracts/`) | **74/74**                              |
| `pnpm -r build`                      | both apps build; `web` emits 17 routes |

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

The remote is `https://github.com/trappalfy/puno-agent`. **Git Credential Manager cannot prompt
in this non-interactive shell**, so `git push` fails here — commit locally and ask the user to run
`git push origin main` once themselves. Do not try to work around the credential prompt.

PowerShell here-strings break on `"` in commit messages. Write the message to a file and use
`git commit -F <file>`.

---

## Part 3 — Verdict

**Testnet: yes** — deployed, billing proven on chain, one real trade executed, margin measured at
95.6%.

**Mainnet: no.** B1 and B2 are development work, B3 waits on the token, and the audit and the
`Ownable2Step` transfer have not happened. Nothing in Part 1 has been descoped; it has only been
ordered.

Next action, unchanged: **B1, Uniswap V3 direct.**
