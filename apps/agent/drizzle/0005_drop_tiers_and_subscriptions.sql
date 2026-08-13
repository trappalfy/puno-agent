ALTER TABLE "quota_periods" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscriptions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "quota_periods" CASCADE;--> statement-breakpoint
DROP TABLE "subscriptions" CASCADE;--> statement-breakpoint
ALTER TABLE "limits" ALTER COLUMN "max_calls_per_hour" SET DEFAULT 6;--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN "tier";--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN "stripe_customer_id";--> statement-breakpoint
DROP TYPE "public"."account_tier";