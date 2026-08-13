# @puno/agent

The trading agent worker: the three-level loop (L0 deterministic tick → L1 Haiku screening → L2 Opus decision), risk enforcement, cost accounting, and the Haiku/Opus divergence measurement harness. See `docs` — plan Part 2.3 for the architecture this implements.

## Layout

```
src/
├─ config.ts          env loading + validation (zod)
├─ chain/              viem client, on-chain reads (vault.ts), decimal helpers (money.ts)
├─ db/                 Drizzle schema, migrations, seed script, read queries
├─ loop/                L0 (guard/market/portfolio/protect/triggers), risk.ts, simulate.ts,
│                       execute.ts, persist.ts, tick.ts (orchestration)
├─ llm/                 Anthropic client, prompts, zod schemas, screen.ts (L1), decide.ts (L2),
│                       cost.ts (pricing table), context.ts (deterministic prompt payload)
├─ quota/               gate.ts (pure budget/rate-limit checks), service.ts (DB-backed wrapper)
├─ compare/             replay.ts (Haiku/Opus divergence harness), report.ts (CLI report)
└─ main.ts              entrypoint — ticks every agent in the DB on an interval
```

`gate.ts` is deliberately dependency-free (no db/config imports) so the pure budget/rate-limit
logic stays unit-testable without a live database — see `quota/service.ts` for the DB-backed
wrapper that actually gates `tick.ts`.

## Setup

```bash
cp ../../.env.example ../../.env   # if not already done at repo root
# fill in DATABASE_URL, VAULT_ADDRESS, AGENT_PRIVATE_KEY, ANTHROPIC_API_KEY

pnpm install
pnpm --filter @puno/agent db:generate   # generate SQL from schema.ts (only after schema changes)
pnpm --filter @puno/agent db:migrate    # apply migrations
pnpm --filter @puno/agent db:seed       # create one account/vault/agent/limits row,
                                         # reading owner/quoteToken/agent live from VAULT_ADDRESS
pnpm --filter @puno/agent dev           # run the worker (tsx watch)
```

`DRY_RUN=true` is the default (see `.env.example`) — the full pipeline runs, including real LLM
calls and real `eth_call` simulation, but `executeTrade` is never broadcast. Flip to `false` only
with a funded `AGENT_PRIVATE_KEY` and full understanding that trades will actually execute.

## Tests

```bash
pnpm --filter @puno/agent test
```

Covers the deterministic modules only — `risk.ts`, `triggers.ts`, `protect.ts`, `llm/cost.ts`,
`quota/gate.ts` — using Node's built-in test runner via `tsx`. `guard.ts`/`market.ts`/`portfolio.ts`
and the LLM call sites are integration-level (live chain / live API) and are exercised by running
the worker itself, not by this suite.

## Local verification against Anvil

No Docker required — any local Postgres works, including a throwaway `initdb`-created instance
that doesn't touch a system install. Point `NETWORK=testnet` with `RPC_URL` overridden to your
local Anvil:

```bash
anvil --chain-id 46630 --port 8545

# in contracts/:
DEPLOYER_PRIVATE_KEY=<anvil account #0> forge script script/DeployTestnet.s.sol \
  --rpc-url http://127.0.0.1:8545 --broadcast

# arm the demo vault's agent key (the script itself doesn't call setAgent):
cast send <vault> "setAgent(address,uint256)" <anvil account #1 address> <future unix ts> \
  --rpc-url http://127.0.0.1:8545 --private-key <anvil account #0 key>
```

Then set `RPC_URL=http://127.0.0.1:8545`, `VAULT_ADDRESS=<vault>`, `AGENT_PRIVATE_KEY=<account #1 key>`
in `.env`, run migrate + seed, and `pnpm dev`. Without `ANTHROPIC_API_KEY` set, L0 (guard, market,
portfolio, protect, triggers) still runs and persists correctly against the real chain; the L1 call
fails with a clear, caught error rather than crashing the process or any other agent's tick — this
is the same safety property the plan's verification checklist asks for when Anthropic is
unreachable.

**Real send path (Phase 4), verified against the same local Anvil setup:** with `DRY_RUN=false`
and a funded `AGENT_PRIVATE_KEY` (Anvil account #1 has test ETH by default), feeding a hand-built
decision through `risk.ts` → `simulate.ts` → `execute.ts` → `persist.ts` (bypassing only the LLM
layer, which needs a real API key) broadcasts a real `executeTrade` transaction, waits for the
receipt, and persists a `trades` row with `status: "confirmed"` and the real `txHash`. Confirmed by
comparing the vault's pre/post ERC-20 balance delta against the risk engine's computed `amountOut`
— they matched exactly. `tick.ts` logs `<explorerUrl>/tx/<hash>` whenever a real send produces a
hash, so a genuine testnet transaction is trivially checkable in
`explorer.testnet.chain.robinhood.com` once one is broadcast there.

## Haiku/Opus divergence report

```bash
pnpm --filter @puno/agent compare:report
```

Reads `model_calls` rows with `purpose = 'comparison'` (written by `tick.ts`'s sampled replay call
after every real L2 decision — rate controlled by `COMPARISON_SAMPLE_RATE`, default 1.0) and
reports the divergence rate that decides whether plan 3.3.1's Opus trial mechanism is worth
building. See `compare/replay.ts` for the tolerance constants used to call a divergence.

## Known limitations (tracked, not silently assumed away)

- **Haiku 4.5's prompt-cache minimum is 4096 tokens**; `SCREEN_SYSTEM_PROMPT` (llm/prompts.ts) is
  shorter than that as written, so `cache_creation_input_tokens` will read 0 for L1 calls until
  the prompt is fleshed out further. Opus 5's minimum (512 tokens) is comfortably cleared by
  `DECIDE_SYSTEM_PROMPT`. Do not pad the Haiku prompt with filler just to clear the threshold.
- **The rolling 24h notional cap is not mirrored in `risk.ts`** — it lives in a private array on
  `AgentVault` with no public getter, so it can't be reconstructed off-chain without risking
  silent drift from the real on-chain state. `simulate.ts`'s `eth_call` is the ground truth for
  that one check; everything else in `risk.ts` is checked off-chain first as a fast filter.
- **`amountOut`/router quoting assumes MockRouter's testnet-only fair-value fill** (see
  `contracts/mocks/MockRouter.sol` and `contracts/script/DeployTestnet.s.sol`) — a real DEX
  integration (Phase 4) replaces this with an actual router quote.
- **Post-fill cost-basis tracking (`persist.ts`) only updates on `status: "confirmed"` trades** —
  verified against a real confirmed fill during the Phase 4 local-Anvil send (see above); still not
  exercised by a fill on the public testnet, since `DRY_RUN=true` is the default there and no run
  with `DRY_RUN=false` against the public testnet has happened yet.
- **No real transaction has been broadcast to the public testnet 46630 yet.** The send path itself
  is proven end-to-end (see above) — what's missing is a funded deployer key. Deploying to 46630
  needs `DEPLOYER_PRIVATE_KEY` funded via `faucet.testnet.chain.robinhood.com`, which has been
  returning 429/403 (rate-limited or down) as of 2026-08-11; the RPC and explorer endpoints for
  46630 are both healthy. Blocked on the faucet recovering or an alternate way to fund a deployer
  address, not on anything in this codebase.
