CREATE TYPE "public"."ledger_kind" AS ENUM('grant', 'deposit', 'charge', 'refund', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."ledger_ref_type" AS ENUM('model_call', 'trade', 'deposit', 'manual');--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" "ledger_kind" NOT NULL,
	"amount_usd" numeric(14, 6) NOT NULL,
	"token_amount" numeric(78, 0),
	"token_price_usd" numeric(24, 12),
	"ref_type" "ledger_ref_type",
	"ref_id" uuid,
	"tx_hash" text,
	"deposit_nonce" numeric(78, 0),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indexer_state" (
	"key" text PRIMARY KEY NOT NULL,
	"last_block" numeric(78, 0) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_price_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"price_usd" numeric(24, 12) NOT NULL,
	"note" text,
	"set_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "credit_balance_usd" numeric(14, 6) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_ledger_account_idx" ON "credit_ledger" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_deposit_nonce_idx" ON "credit_ledger" USING btree ("deposit_nonce");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_ref_idx" ON "credit_ledger" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_grant_idx" ON "credit_ledger" USING btree ("account_id") WHERE "credit_ledger"."kind" = 'grant';--> statement-breakpoint
CREATE INDEX "token_price_overrides_created_idx" ON "token_price_overrides" USING btree ("created_at");