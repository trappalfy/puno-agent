ALTER TABLE "accounts" ADD COLUMN "wallet_address" text;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_wallet_address_idx" ON "accounts" USING btree ("wallet_address");