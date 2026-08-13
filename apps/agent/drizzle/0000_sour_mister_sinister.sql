CREATE TYPE "public"."account_tier" AS ENUM('free', 'solo', 'pro', 'byok');--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('system', 'owner', 'agent', 'model');--> statement-breakpoint
CREATE TYPE "public"."agent_status" AS ENUM('idle', 'armed', 'running', 'paused', 'error', 'halted', 'quota_exhausted');--> statement-breakpoint
CREATE TYPE "public"."decision_action" AS ENUM('buy', 'sell', 'hold');--> statement-breakpoint
CREATE TYPE "public"."model_call_purpose" AS ENUM('decision', 'comparison');--> statement-breakpoint
CREATE TYPE "public"."model_level" AS ENUM('L1', 'L2');--> statement-breakpoint
CREATE TYPE "public"."network" AS ENUM('mainnet', 'testnet');--> statement-breakpoint
CREATE TYPE "public"."risk_verdict" AS ENUM('accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."trade_status" AS ENUM('dry_run', 'simulated', 'pending', 'confirmed', 'failed', 'reverted');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"tier" "account_tier" DEFAULT 'free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"vault_id" uuid NOT NULL,
	"name" text NOT NULL,
	"agent_address" text NOT NULL,
	"status" "agent_status" DEFAULT 'idle' NOT NULL,
	"dry_run" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_tick_at" timestamp with time zone,
	"last_action_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid,
	"actor_type" "actor_type" NOT NULL,
	"action" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"signal_id" uuid NOT NULL,
	"action" "decision_action" NOT NULL,
	"ticker" text NOT NULL,
	"size_pct" numeric(6, 3) NOT NULL,
	"confidence" numeric(5, 4) NOT NULL,
	"thesis" text NOT NULL,
	"risk_flags" jsonb NOT NULL,
	"risk_verdict" "risk_verdict" NOT NULL,
	"risk_reason" text,
	"model_call_id" uuid,
	"trade_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"stop_loss_bps" integer,
	"take_profit_bps" integer,
	"max_review_interval_hours" integer DEFAULT 24 NOT NULL,
	"price_move_trigger_bps" integer DEFAULT 300 NOT NULL,
	"max_calls_per_hour" integer DEFAULT 12 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "limits_agent_id_unique" UNIQUE("agent_id")
);
--> statement-breakpoint
CREATE TABLE "model_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid,
	"account_id" uuid,
	"level" "model_level" NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cache_read_input_tokens" integer DEFAULT 0 NOT NULL,
	"cache_creation_input_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) NOT NULL,
	"latency_ms" integer NOT NULL,
	"input_payload" jsonb NOT NULL,
	"output_payload" jsonb NOT NULL,
	"replay_of" uuid,
	"purpose" "model_call_purpose" DEFAULT 'decision' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vault_id" uuid NOT NULL,
	"token" text NOT NULL,
	"token_symbol" text NOT NULL,
	"raw_balance" numeric(78, 0) NOT NULL,
	"value_usd" numeric(24, 6) NOT NULL,
	"entry_price_usd" numeric(24, 6),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quota_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"budget_usd" numeric(12, 6) NOT NULL,
	"spent_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"opus_compare_budget" integer,
	"opus_compare_used" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"trigger_reasons" jsonb NOT NULL,
	"market_snapshot" jsonb NOT NULL,
	"escalate" boolean NOT NULL,
	"reason" text NOT NULL,
	"model_call_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"tier" "account_tier" NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"stripe_subscription_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"decision_id" uuid,
	"token_in" text NOT NULL,
	"token_out" text NOT NULL,
	"amount_in" numeric(78, 0) NOT NULL,
	"amount_out" numeric(78, 0),
	"min_out" numeric(78, 0) NOT NULL,
	"router" text NOT NULL,
	"notional_usd" numeric(24, 6) NOT NULL,
	"status" "trade_status" NOT NULL,
	"tx_hash" text,
	"simulate_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vaults" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address" text NOT NULL,
	"owner_address" text NOT NULL,
	"quote_token" text NOT NULL,
	"network" "network" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_model_call_id_model_calls_id_fk" FOREIGN KEY ("model_call_id") REFERENCES "public"."model_calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "limits" ADD CONSTRAINT "limits_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_calls" ADD CONSTRAINT "model_calls_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_calls" ADD CONSTRAINT "model_calls_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_periods" ADD CONSTRAINT "quota_periods_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_model_call_id_model_calls_id_fk" FOREIGN KEY ("model_call_id") REFERENCES "public"."model_calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_agent_idx" ON "audit_log" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "decisions_agent_idx" ON "decisions" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "model_calls_agent_idx" ON "model_calls" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "model_calls_account_idx" ON "model_calls" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "model_calls_replay_idx" ON "model_calls" USING btree ("replay_of");--> statement-breakpoint
CREATE UNIQUE INDEX "positions_vault_token_idx" ON "positions" USING btree ("vault_id","token");--> statement-breakpoint
CREATE UNIQUE INDEX "quota_periods_account_period_idx" ON "quota_periods" USING btree ("account_id","period_start");--> statement-breakpoint
CREATE INDEX "signals_agent_idx" ON "signals" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "trades_agent_idx" ON "trades" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vaults_address_network_idx" ON "vaults" USING btree ("address","network");