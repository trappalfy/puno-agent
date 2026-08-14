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

### D1 — The agent has no memory of its own decisions

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

### D2 — Comparison replay defaults to sampling 100% of decisions

`apps/agent/src/config.ts:35` — `COMPARISON_SAMPLE_RATE` defaults to `1`. Every escalated
decision fires an extra Haiku replay that we pay for and deliberately never bill
(`tick.ts:466-476`). Correct as a development default, pure margin loss in production.

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

Still unproven, blocked only on `ANTHROPIC_API_KEY`: the L1/L2 model path, the screen and
decision charges, and therefore the margin measurement (open work item 5).

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
- 74 contract tests and 100 unit tests pass; both apps build.

---

## Recommended order

1. **Deploy testnet now.** It is a mock sandbox, costs 0.000270 ETH, and unblocks items 4 and
   5 below. Nothing here is blocked by B1/B2 because the testnet script wires the mock router
   and mock feeds itself.
2. **Run the end-to-end scenario** (open work item 4) with `DRY_RUN=false` against the mocks.
3. **Measure the margin** (open work item 5) — the first real test of the $0.50 decision
   price. Everything in the business plan rests on this number and it has never been taken.
4. **Fix D1 and D2** — small, and D1 materially improves decision quality before anyone sees
   the output.
5. **Phase 4: real router integration (B1)** — the actual gate on mainnet.
6. **Extend the wizard to allowlist equities (B2)** and source real feed addresses.
7. Then the pre-mainnet items already recorded: fuzz tests, `Ownable2Step` transfer off the
   hot key, contract audit.
