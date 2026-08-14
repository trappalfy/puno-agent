# Deploy readiness — 2026-08-14

Verdict: **testnet yes, mainnet no.**

Testnet is a mock sandbox and deploying there is useful — it unblocks the end-to-end
scenario and the margin measurement, both of which are still unrun. Mainnet is blocked by
two structural gaps (B1, B2) that are development work, not configuration.

Everything below was read out of the code, not inferred from the plan.

---

## Blockers for mainnet

### B1 — Swap calldata is hardcoded to the mock router

`apps/agent/src/loop/simulate.ts:28-32` builds the swap payload with `mockRouterAbi`:

```ts
const swapCalldata = encodeFunctionData({
  abi: mockRouterAbi,
  functionName: "swap",
  args: [trade.tokenIn, trade.tokenOut, trade.amountIn, trade.amountOut, vault],
});
```

There is no branch for a real router. The file's own comment states the gap plainly:

> swapCalldata targets MockRouter.swap directly (testnet-only stand-in) … **Phase 4 replaces
> this with calldata from a real router's quote API.**

Meanwhile the production wizard writes the *real* 1inch router into the vault policy —
`apps/web/src/app/app/agents/new/page.tsx:296`, `allowedRouters: [network.routers.oneInch]`
— and `risk.ts:75` picks `allowedRouters[0]`.

So on mainnet the agent would send MockRouter-shaped calldata to the 1inch router. 1inch has
no such function, so every trade reverts.

It fails **safe**: `simulateTrade` runs a real `eth_call` first, catches the revert, records
the trade as `simulated` and returns before `executeTrade` is ever reached. No funds move and
no gas is burned. But the agent cannot trade on mainnet at all.

A second, quieter consequence: `amountOut` is passed to `MockRouter.swap` as an exact
argument, so the mock always fills at the modelled price. Real DEX fills have slippage and
price impact, which means the trade sizing in `risk.ts` has never been exercised against a
venue that can fill differently than expected. Phase 4 needs a real quote, not just real
calldata.

**Effort: real. This is the Phase 4 integration that was never started.**

### B2 — A vault created through the wizard has nothing to trade

The wizard fires four signatures (`DEPLOY_STEPS`, `new/page.tsx:190-195`): `createVault`,
`setPriceFeed`, `setPolicy`, `setAgent`. It configures:

- `setPriceFeed` — for the **quote token only** (`new/page.tsx:280-284`)
- `setPolicy` — with `allowedTokens: [quoteToken]` (`new/page.tsx:297`)

So a freshly created vault allows exactly one token: USDG, the quote asset. No equity token
is ever allowlisted and no equity price feed is ever set.

`risk.ts:66` then rejects every equity ticker the model proposes:

```ts
if (!policy.allowedTokens.some((t) => t.toLowerCase() === tickerPrice.token.toLowerCase())) {
  return { verdict: "rejected", reason: `token not in vault allowlist: ${decision.ticker}` };
}
```

A user who completes the wizard gets an agent that can never trade anything. Adding equities
requires calling `setPriceFeed` and `setPolicy` by hand, outside the product.

This also means the mainnet equity feed addresses have never been sourced — the wizard takes
the quote feed address from a form field (`form.quoteFeedAddress`), and nothing in
`packages/shared/src/network/config.ts` carries aggregator addresses.

### B3 — Billing cannot work on mainnet

`NETWORKS.mainnet.punoToken` and `.punoCredits` are `null`, so `runDepositWatcher` returns
immediately (`watcher.ts:74-77`). PUNO does not exist yet, and the PUNO/USD rate is a manual
override with no liquidity behind it. Nothing to fix in code — it is a sequencing fact.

---

## Defects worth fixing regardless of network

### D1 — The agent has no memory of its own decisions — **was a blocker, now FIXED**

> **Reclassified after execution.** This was filed below as a quality defect. Running the agent
> proved it is worse than that: it is a permanent deadlock, and it stopped the end-to-end
> scenario dead. Fixed the same day — the original write-up follows for the record.
>
> The screening prompt is told it will receive "a short summary of the agent's most recent
> decisions", and is instructed **not** to escalate on "a token the vault currently holds zero
> of and has no stated interest in". Stated interest can only come from
> `recentDecisionsSummary` — so with that field permanently empty, **an agent holding nothing
> can never escalate on any price move, ever.**
>
> This is reachable in production, not just in testing: if the first decision is rejected by
> the risk engine, or its trade reverts, the vault holds nothing, the agent has no memory, and
> it goes silent forever.
>
> Observed directly: three consecutive triggers (`price_moved:AAPL:8.00%`,
> `quote_freed:$800.00`, `price_moved:AAPL:21.50%`) all declined, each citing the missing
> history — *"you hold no AAPL position and have no stated thesis on it"*. After the fix the
> very next trigger escalated, citing the restored memory: *"AAPL moved 7.69% right after you
> decided to buy it in dry-run mode 16 minutes ago"*.
>
> **Fix:** `getRecentDecisions()` in `db/queries.ts` (left-joined to `trades` so the summary
> carries whether the decision actually filled) and `formatRecentDecisions()` in
> `llm/context.ts`, wired into `tick.ts`. Carrying the fill status matters as much as the
> decision itself — "decided to buy and it filled" and "decided to buy and nothing happened"
> are different situations, and only the second leaves an open thread worth escalating on.

**Original write-up (2026-08-14, before execution):**

`apps/agent/src/loop/tick.ts:325` hardcodes:

```ts
recentDecisionsSummary: "",
```

Nothing anywhere populates it. But the L1 screening prompt feeds a meaningful value in **all
seven** of its few-shot examples (`llm/prompts.ts:65, 81, 96, 113, 131, 146, 160`), e.g.:

> recentDecisionsSummary: "Held TSLA yesterday at $250.80, confidence 0.7, thesis:
> post-earnings consolidation, no near-term catalyst expected."

Every screening call is therefore taught to reason about prior decisions and then handed an
empty string. Not a crash — a systematic quality loss, and the agent cannot notice that it
already acted on the same thesis an hour ago. The query layer for this already exists
(`db/queries.ts` has `getLatestSignalContext`); only the summary builder is missing.

### D2 — Comparison replay defaults to sampling 100% of decisions — **FIXED**

`apps/agent/src/config.ts` — `COMPARISON_SAMPLE_RATE` defaulted to `1`. Every escalated
decision fired an extra Haiku replay that we pay for and deliberately never bill
(`tick.ts:466-476`). Correct as a development default, pure margin loss in production.

Now measured rather than guessed at: a replay costs **$0.002819** against roughly **$0.019**
of total model cost per decision, so sampling all of them inflated our unit cost by about
**15%**. Against revenue it is small — the blended margin moves 96.2% → 95.6% — but it buys
nothing after the first few dozen samples.

Default lowered to **0.1**, documented in `.env.example` and `apps/agent/README.md`, with the
`compare:report` empty-state message corrected: it told the reader one L2 decision was enough,
which was true at rate 1 and is not at 0.1. Set the rate to 1 in development.

Worth doing in this order: D5's intermittent failures were dropping the *verbose* replies and
keeping the terse ones, so the sample was biased before it was small. Fixing D5 first is what
makes a 10% sample honest.

### D3 — An empty `RPC_URL=` disabled the chain client entirely — FIXED

`apps/agent/src/config.ts` read `env.RPC_URL ?? network.rpcUrl`. `??` only falls back on
`null`/`undefined`, and `.env.example` ships the line `RPC_URL=` — an empty string, which is
a valid `z.string().optional()` value and passes straight through. The result was a viem
transport with no URL: `UrlRequiredError` on the first chain call.

Anyone following `.env.example` verbatim hit this. Fixed to `||`, matching how
`agentPrivateKey` and `vaultAddress` already handle the same empty-string case two lines
below.

### D4 — `PunoCredits.deposit` reverts when the payer is the treasury

`PunoCredits.deposit` measures what arrived as the treasury's balance delta
(`PunoCredits.sol:66-73`) — correct fee-on-transfer handling. But when `msg.sender` *is* the
treasury the transfer is a self-transfer, the delta is zero, and `require(received > 0)`
fires with `PunoCredits: nothing received`.

`DeployTestnet.s.sol:109` constructs `PunoCredits` with `deployer` as the treasury, and the
deployer also receives the entire mock PUNO supply. So on a freshly deployed testnet the
billing path **cannot be exercised at all** until the treasury is rotated off the payer.

Hit for real on 2026-08-14; worked around with `setTreasury` to a dedicated address. The fix
belongs in `DeployTestnet` (deploy with a treasury distinct from the deployer), not in the
contract — on mainnet the treasury is a multisig and will not be the payer. Worth a
one-line revert message change regardless, since "nothing received" does not hint at the
real cause.

---

## Proven on testnet, 2026-08-14

Deployed and verified against chain 46630 by execution:

| Contract | Address |
|---|---|
| VaultFactory | `0x486901cBa710C5Fb1032AB1bB25d190E3f845998` |
| PunoCredits | `0xD0D4B491D8980cd49b0eCf151ad30f8f779D74f6` |
| Mock PUNO | `0x1A480B089d8A5E2B77A1bD8908aBFF9bB6af21da` |
| Demo AgentVault | `0xcFA434255f47F4C8777043540d253CEDFb36B5e9` |
| MockRouter | `0x58fc3D03E57aC4b909b04356CF9Ae8b420885719` |
| Mock USDG (quote) | `0x5fecF7bA6365E6763b8984c43307B417A498aD40` |

Actual deploy cost **0.0001124 ETH**, against the 0.000270 estimate — forge's padding is
roughly 2.4× here, not 2×.

The **billing path is proven end to end on a live chain**, which is the half of open work
item 4 that needs no Anthropic key:

- 1,000 mock PUNO deposited through `PunoCredits.deposit` → `depositNonce` 1, treasury
  balance 1e21.
- Indexer credited `+$10.0000` at the manual rate of $0.01, creating the account from the
  payer's wallet address alone.
- Ledger invariant `SUM(creditLedger.amountUsd) == accounts.creditBalanceUsd` holds on both
  seeded and credited accounts.
- **Idempotency proven the hard way**: the cursor was rewound behind the deposit block and
  the watcher re-run. Second pass reported `credited: 0`, balance stayed $10.00, ledger
  stayed at two rows. The `depositNonce` key does what CLAUDE.md claims.

### The model path and the first margin measurement — **both closed**

Open work items 4 and 5 are done. The agent ran against the live testnet with real Anthropic
calls and `DRY_RUN=false`, and **executed a real trade on chain**:
`0x082d0f731202cdc23e073089e0d821b3fa21d2b1c5a2dd53b9936905f2840952` — 180 USDG in,
0.857142857 AAPL out at $210. On-chain balances, the `trades` row, and the recorded entry
price all agree.

All three charge types landed in the ledger: `screen` ×5 at $0.01, `decision` ×2 at $0.50,
`trade` ×1 at $0.25.

**Measured cost against what the user was charged:**

| Level | Model | Calls | Our cost | Charged | Margin |
|---|---|---:|---:|---:|---:|
| L1 `screen` | Haiku 4.5 | 5 | $0.016026 | $0.05 | 67.9% |
| L2 `decision` | Opus 5 | 2 | $0.038162 | $1.00 | **96.2%** |
| L2 `comparison` | Haiku 4.5 | 1 | $0.002819 | — | our cost, never billed |
| `trade` (gas) | — | 1 | ~$0.005 | $0.25 | ~98% |
| **Total** | | | **$0.057007** | **$1.30** | **95.6%** |

Per-call detail, first decision vs. cached: input 584 / output 240 / cache **write** 1,555 =
$0.024470; the same call with a cache **read** instead prices at **$0.0097**. The prompt-cache
minimum on Opus 5 is 512 tokens and the decision system prompt is ~880, so caching engages
from the second call onward.

**The $0.50 decision price is conservative by roughly 50×.** `max_tokens: 4096` also caps the
worst case at $0.102, so no decision can ever cost more than a fifth of what it bills. The
scenario where each additional user deepens a loss is not reachable at the model layer.

Two of this file's own claims confirmed by measurement:

- **Haiku caching never engages** — `cache_creation` and `cache_read` were 0 across all five
  screen calls. The screen prompt renders at ~2,885 tokens against Haiku's 4,096 minimum.
  (Note: D1's fix adds the decision summary to that prompt, pushing it toward the threshold —
  crossing 4,096 would make screen caching engage and cut its cost. Worth measuring.)
- **Gas is cheaper than assumed** — one trade cost 0.0000026 ETH. `pricing.ts` estimates
  "~$0.02 of gas we pay from the agent wallet"; at ~$1,840/ETH the real figure is ~$0.005.

Caveats, stated plainly: this is a handful of samples on a three-token mock portfolio with a
single position. Real context will be larger — more holdings, more prices, a longer decision
history — so input tokens will grow. Output was only 240 tokens including adaptive thinking at
`effort: medium`; harder decisions will think longer. The structural ceiling does not move.

### D5 — A long string discards the whole model call — **worse than first recorded, now FIXED**

First seen as a replay defect: `replayWithHaiku` failed on the first tick with
`riskFlags.2: Too big: expected string to have <=64 characters`. Haiku wrote one risk flag
longer than the Zod schema allows and the entire response was thrown away. It is caught and
logged (`tick.ts`), so nothing broke, but the comparison measurement is the replay's whole
purpose: it failed unevenly, precisely on the verbose outputs most worth comparing.

**The scope was larger than that.** `DecisionOutputSchema` is shared — the comparison replay
and the real L2 decision use the same schema through the same `decide()`. The L2 call at
`tick.ts:396` is not wrapped in a try/catch, so the same violation from Opus aborts the tick.
`main.ts:12-18` catches it per agent, so nothing crashes, but by then the user has been
charged for the screening call and gets no decision for it. `ScreenOutputSchema.reason` (max
280) had the identical exposure one step earlier.

Root cause, and the part worth remembering: **structured output constrains shape, not string
length.** `zodOutputFormat()` emits `maxLength` into the JSON Schema, the API does not enforce
it during generation, and the helper's own parse is a hard `safeParse` that throws on the
first issue (`@anthropic-ai/sdk/helpers/zod.js`). So the cap was advisory on the way out and
fatal on the way back.

Fixed in `apps/agent/src/llm/schemas.ts`: the caps stay in the JSON Schema — the model should
still be asked for terse output — but parsing clamps prose to the cap instead of rejecting.
Everything semantic (`action`, `ticker`, `sizePct`, `confidence`, missing fields) still fails
loudly, because those are meaning rather than formatting. Truncation logs, so it is never
silent.

The line is drawn where the storage is: `decisions.thesis` is `text` and `decisions.risk_flags`
is `jsonb`, so nothing downstream cares about length. Discarding a decision whose action,
ticker, size and confidence were all valid, over the length of a label, is not a trade the
product should make.

Covered by `apps/agent/src/llm/schemas.test.ts` (11 tests), including the surrogate-pair case
— a UTF-16 slice can split one, and Postgres rejects a lone surrogate on the way into `jsonb`,
which would turn a cosmetic overrun into a write failure. Verified against the live API as
well, since the custom format object is what `messages.parse()` has to accept.

---

## What is genuinely ready

The safety architecture is the strongest part of the codebase and should not be re-litigated:

- `DRY_RUN` defaults true and is checked at the last possible moment (`execute.ts:23`), so
  `risk.ts` and `simulate.ts` behave identically in both modes and dry-run output is a
  faithful preview.
- Every send is preceded by a real `eth_call` simulation against the deployed vault.
- `guard()` blocks on pause, agent-address mismatch, and key expiry before anything else.
- The risk engine mirrors the on-chain policy, so rejections happen before gas is spent.
- Billing is idempotent per `(refType, refId)`; only `confirmed` trades are charged; the
  deposit indexer never advances its cursor past an uncredited event.
- 74 contract tests and 111 unit tests pass; both apps build.

---

## Recommended order

1. ~~**Deploy testnet now.**~~ **Done 2026-08-14** — 0.0001124 ETH actual.
2. ~~**Run the end-to-end scenario** (open work item 4)~~ **Done** — real trade on chain.
3. ~~**Measure the margin** (open work item 5)~~ **Done** — 95.6%, and the $0.50 decision
   price is conservative by roughly 50×.
4. ~~**Fix D1 and D2**~~ **Done**, along with D5, which turned out to reach the paid decision
   path and not just the replay.
5. **Phase 4: real router integration (B1)** — the actual gate on mainnet. ← next
6. **Extend the wizard to allowlist equities (B2)** and source real feed addresses.
7. Then the pre-mainnet items already recorded: fuzz tests, `Ownable2Step` transfer off the
   hot key, contract audit.

Still open and unchanged by this pass: **re-measure the screen cost**. D1's fix added the
decision summary to the ~2,885-token screen prompt; if it now clears Haiku's 4,096-token cache
minimum, caching engages and CLAUDE.md's open work item 7 resolves itself. It needs a tick
against a populated decision history to measure, not a synthetic prompt.
