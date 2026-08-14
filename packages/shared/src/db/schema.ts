import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const agentStatusEnum = pgEnum("agent_status", [
  "idle",
  "armed",
  "running",
  "paused",
  "error",
  "halted",
  // Kept under its original name so the enum needs no migration: since billing
  // moved to a prepaid balance this means "credit balance too low for the next
  // charge", not "monthly quota used up".
  "quota_exhausted",
]);
// What an agent is for. `trial` agents back the free tier: they point at the
// shared demo vault, are always paper, and are deliberately NOT ticked by the
// worker's interval loop — a free run happens once, when the user asks for it,
// and must never bill them again on a timer.
export const agentKindEnum = pgEnum("agent_kind", ["live", "trial"]);
export const trialRunStatusEnum = pgEnum("trial_run_status", [
  "pending",
  "running",
  "done",
  "failed",
]);
export const networkEnum = pgEnum("network", ["mainnet", "testnet"]);
export const modelLevelEnum = pgEnum("model_level", ["L1", "L2"]);
export const modelCallPurposeEnum = pgEnum("model_call_purpose", ["decision", "comparison"]);
export const tradeStatusEnum = pgEnum("trade_status", [
  "dry_run",
  "simulated",
  "pending",
  "confirmed",
  "failed",
  "reverted",
]);
export const riskVerdictEnum = pgEnum("risk_verdict", ["accepted", "rejected"]);
export const decisionActionEnum = pgEnum("decision_action", ["buy", "sell", "hold"]);
export const actorTypeEnum = pgEnum("actor_type", ["system", "owner", "agent", "model"]);
export const ledgerKindEnum = pgEnum("ledger_kind", [
  "grant",
  "deposit",
  "charge",
  "refund",
  "adjustment",
]);
export const ledgerRefTypeEnum = pgEnum("ledger_ref_type", [
  "model_call",
  "trade",
  "deposit",
  "manual",
]);

// ---------------------------------------------------------------------------
// Billing / identity
//
// There are no tiers or subscriptions. One plan: a prepaid balance topped up
// with PUNO, drawn down per billable action (see packages/shared/src/pricing.ts).
// ---------------------------------------------------------------------------

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email"),
    // Puno has no separate password/email auth — a connected wallet *is* the
    // login (apps/web resolves "which account" from the wagmi-connected
    // address). Lowercased at write time so lookups never miss on casing.
    walletAddress: text("wallet_address"),
    // Materialised running balance. Authoritative for the pre-call gate, but
    // NOT the source of truth: creditLedger is, and SUM(amountUsd) over the
    // ledger must always equal this. Kept as a column only so the hot path
    // doesn't aggregate the whole ledger on every model call.
    creditBalanceUsd: numeric("credit_balance_usd", { precision: 14, scale: 6 })
      .notNull()
      .default("0"),
    // Set once, the first time this account accepts the geo-gate/disclaimer
    // (DESIGN.md #25) — never overwritten, so it stays the original consent
    // timestamp even if the modal is somehow shown again.
    geoConsentAt: timestamp("geo_consent_at", { withTimezone: true }),
    // AES-256-GCM ciphertext (iv:authTag:ciphertext, see lib/crypto.ts) — the
    // plaintext key is never stored, logged, or returned by any route. Bringing
    // your own key is no longer a tier, it's a modifier: model calls stop being
    // charged, trades still are.
    anthropicApiKeyEncrypted: text("anthropic_api_key_encrypted"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("accounts_wallet_address_idx").on(t.walletAddress)],
);

// Append-only journal of every movement of credit. This is the source of truth
// for what an account has paid and been charged; accounts.creditBalanceUsd is a
// cache of its sum. Both are written in one transaction — a charge that updates
// the balance without a matching row here is money that vanished.
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    kind: ledgerKindEnum("kind").notNull(),
    // Signed: credits positive, charges negative.
    amountUsd: numeric("amount_usd", { precision: 14, scale: 6 }).notNull(),
    // Deposits only — what actually arrived on-chain and the rate we valued it
    // at. Stored so a credit can be re-derived and disputed later; without the
    // rate, a deposit row is just an unexplained number.
    tokenAmount: numeric("token_amount", { precision: 78, scale: 0 }),
    tokenPriceUsd: numeric("token_price_usd", { precision: 24, scale: 12 }),
    refType: ledgerRefTypeEnum("ref_type"),
    refId: uuid("ref_id"),
    txHash: text("tx_hash"),
    // PunoCredits.depositNonce — globally unique and monotonic, and therefore
    // the idempotency key for crediting a deposit. Deliberately not the tx
    // hash: one transaction can legitimately carry several deposits, and
    // deduping on the hash would silently drop all but the first.
    depositNonce: numeric("deposit_nonce", { precision: 78, scale: 0 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("credit_ledger_account_idx").on(t.accountId, t.createdAt),
    // Nulls don't collide in Postgres unique indexes, so these constrain only
    // the rows that carry the key: a deposit can be credited once, and a given
    // model call or trade can be charged once even if the worker retries.
    uniqueIndex("credit_ledger_deposit_nonce_idx").on(t.depositNonce),
    uniqueIndex("credit_ledger_ref_idx").on(t.refType, t.refId),
    // One welcome grant per account, enforced by the database rather than by a
    // read-then-write in application code: two sign-ins landing at once would
    // both see "no grant yet" and both insert.
    uniqueIndex("credit_ledger_grant_idx")
      .on(t.accountId)
      .where(sql`${t.kind} = 'grant'`),
  ],
);

// Manually-set PUNO/USD rate, used until the token has a liquid pool to read a
// TWAP from. Append-only rather than a single mutable row: the rate decides how
// much credit real money buys, so "who set it to what, and when" has to survive.
export const tokenPriceOverrides = pgTable(
  "token_price_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    priceUsd: numeric("price_usd", { precision: 24, scale: 12 }).notNull(),
    note: text("note"),
    setBy: text("set_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("token_price_overrides_created_idx").on(t.createdAt)],
);

// Where the deposit watcher left off, per contract+chain. Its own table rather
// than a config file because the worker can be restarted or rescheduled onto a
// different host, and re-scanning from genesis is not an option.
export const indexerState = pgTable("indexer_state", {
  key: text("key").primaryKey(),
  lastBlock: numeric("last_block", { precision: 78, scale: 0 }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Vaults / agents
// ---------------------------------------------------------------------------

export const vaults = pgTable(
  "vaults",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    address: text("address").notNull(),
    ownerAddress: text("owner_address").notNull(),
    quoteToken: text("quote_token").notNull(),
    network: networkEnum("network").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("vaults_address_network_idx").on(t.address, t.network)],
);

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id),
  vaultId: uuid("vault_id")
    .notNull()
    .references(() => vaults.id),
  name: text("name").notNull(),
  // The hot wallet address the runtime signs with — must equal the vault's
  // on-chain `agent` for executeTrade calls to authorize. Never the private key.
  agentAddress: text("agent_address").notNull(),
  status: agentStatusEnum("status").notNull().default("idle"),
  kind: agentKindEnum("kind").notNull().default("live"),
  // Read by runTick — an agent marked here is never broadcast for, whatever the
  // worker's process-wide DRY_RUN says. The console renders it as a "Dry run"
  // badge, so this column is a promise to the owner, not a hint.
  dryRun: boolean("dry_run").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastTickAt: timestamp("last_tick_at", { withTimezone: true }),
  lastActionAt: timestamp("last_action_at", { withTimezone: true }),
});

// Off-chain-only limits — the half of the Risk Limits Panel (design plan
// 1.6/#19) NOT enforced by the vault contract. The on-chain half
// (maxNotionalPerTrade, maxDailyNotional, maxPositionBps,
// minSecondsBetweenTrades, maxSlippageBps) is deliberately never mirrored
// here: it's read live from the vault in risk.ts so it can never drift from
// what executeTrade actually enforces.
export const limits = pgTable("limits", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id)
    .unique(),
  stopLossBps: integer("stop_loss_bps"),
  takeProfitBps: integer("take_profit_bps"),
  maxReviewIntervalHours: integer("max_review_interval_hours").notNull().default(24),
  priceMoveTriggerBps: integer("price_move_trigger_bps").notNull().default(300),
  // Lowered from 12 when billing moved to pay-per-action: this cap is now the
  // user's spend ceiling, not just ours. At 12/h a screening charge alone can
  // reach ~$86/month, which is not a bill anyone expects from "the agent looked
  // and did nothing".
  maxCallsPerHour: integer("max_calls_per_hour").notNull().default(6),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Free-tier trial queue
//
// The free run is executed by the worker, not by the web app, so that agent
// logic lives in exactly one process forever. The web route inserts a row here
// and polls it; the worker claims it, runs one paper tick, and writes the
// outcome back. The latency this adds is not a cost worth engineering away —
// an L2 decision takes seconds regardless, and a console that says
// "screening… deciding…" is the thing the user came to watch.
// ---------------------------------------------------------------------------

export const trialRuns = pgTable(
  "trial_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    status: trialRunStatusEnum("status").notNull().default("pending"),
    // Why the run ended the way it did — an exhausted balance, a paused demo
    // vault, an RPC failure. Shown to the user, so it has to read as an
    // explanation rather than a stack trace.
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    // The worker's claim query orders by this; the partial index keeps that scan
    // proportional to the backlog rather than to every trial ever run.
    index("trial_runs_pending_idx")
      .on(t.createdAt)
      .where(sql`status = 'pending'`),
    index("trial_runs_account_idx").on(t.accountId, t.createdAt),
  ],
);

export const positions = pgTable(
  "positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vaultId: uuid("vault_id")
      .notNull()
      .references(() => vaults.id),
    token: text("token").notNull(),
    tokenSymbol: text("token_symbol").notNull(),
    // Persisted alongside the balance (rather than re-derived from chain
    // reads) so USD cost-basis math — rawBalance/entryPriceUsd → P&L — can
    // be done anywhere that reads this row, including apps/web.
    decimals: integer("decimals").notNull().default(18),
    rawBalance: numeric("raw_balance", { precision: 78, scale: 0 }).notNull(),
    valueUsd: numeric("value_usd", { precision: 24, scale: 6 }).notNull(),
    // Weighted-average cost basis, set/updated on trades that increase the
    // position. Null for a token never bought through the agent (e.g. the
    // quote token). Drives protect.ts's stop-loss / take-profit check.
    entryPriceUsd: numeric("entry_price_usd", { precision: 24, scale: 6 }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("positions_vault_token_idx").on(t.vaultId, t.token)],
);

// ---------------------------------------------------------------------------
// Cost accounting — the economics of the whole product rest on this table
// being written for every model call, including rejected/failed ones
// (plan 2.3). purpose='comparison' + replayOf is the Haiku/Opus divergence
// harness from plan 3.3.1, reused unchanged for the phase-3 measurement.
// Declared before signals/decisions so both can hold a plain forward FK.
// ---------------------------------------------------------------------------

export const modelCalls = pgTable(
  "model_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").references(() => agents.id),
    accountId: uuid("account_id").references(() => accounts.id),
    level: modelLevelEnum("level").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    cacheReadInputTokens: integer("cache_read_input_tokens").notNull().default(0),
    cacheCreationInputTokens: integer("cache_creation_input_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull(),
    latencyMs: integer("latency_ms").notNull(),
    // Full request/response, byte-reproducible — required by the replay
    // mechanism (plan 2.3 "Требование к воспроизводимости").
    inputPayload: jsonb("input_payload").notNull(),
    outputPayload: jsonb("output_payload").notNull(),
    replayOf: uuid("replay_of"),
    purpose: modelCallPurposeEnum("purpose").notNull().default("decision"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("model_calls_agent_idx").on(t.agentId, t.createdAt),
    index("model_calls_account_idx").on(t.accountId, t.createdAt),
    index("model_calls_replay_idx").on(t.replayOf),
  ],
);

// ---------------------------------------------------------------------------
// Decision trail
// ---------------------------------------------------------------------------

// L1 (Haiku) screening output — one row per triggered tick, escalate or not.
export const signals = pgTable(
  "signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    triggerReasons: jsonb("trigger_reasons").notNull().$type<string[]>(),
    marketSnapshot: jsonb("market_snapshot").notNull(),
    escalate: boolean("escalate").notNull(),
    reason: text("reason").notNull(),
    modelCallId: uuid("model_call_id").references(() => modelCalls.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("signals_agent_idx").on(t.agentId, t.createdAt)],
);

// L2 (Opus) decision output — one row per escalated signal.
export const decisions = pgTable(
  "decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    signalId: uuid("signal_id")
      .notNull()
      .references(() => signals.id),
    action: decisionActionEnum("action").notNull(),
    ticker: text("ticker").notNull(),
    sizePct: numeric("size_pct", { precision: 6, scale: 3 }).notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
    thesis: text("thesis").notNull(),
    riskFlags: jsonb("risk_flags").notNull().$type<string[]>(),
    riskVerdict: riskVerdictEnum("risk_verdict").notNull(),
    riskReason: text("risk_reason"),
    modelCallId: uuid("model_call_id").references(() => modelCalls.id),
    // Not a FK — trades.decisionId is the authoritative link. Keeping this as
    // a plain column avoids a circular foreign-key pair between the two tables.
    tradeId: uuid("trade_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("decisions_agent_idx").on(t.agentId, t.createdAt)],
);

export const trades = pgTable(
  "trades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    decisionId: uuid("decision_id").references(() => decisions.id),
    tokenIn: text("token_in").notNull(),
    tokenOut: text("token_out").notNull(),
    amountIn: numeric("amount_in", { precision: 78, scale: 0 }).notNull(),
    amountOut: numeric("amount_out", { precision: 78, scale: 0 }),
    minOut: numeric("min_out", { precision: 78, scale: 0 }).notNull(),
    router: text("router").notNull(),
    notionalUsd: numeric("notional_usd", { precision: 24, scale: 6 }).notNull(),
    status: tradeStatusEnum("status").notNull(),
    txHash: text("tx_hash"),
    simulateError: text("simulate_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("trades_agent_idx").on(t.agentId, t.createdAt)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").references(() => agents.id),
    actorType: actorTypeEnum("actor_type").notNull(),
    action: text("action").notNull(),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_agent_idx").on(t.agentId, t.createdAt)],
);
