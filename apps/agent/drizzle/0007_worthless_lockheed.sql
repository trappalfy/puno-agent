CREATE TYPE "public"."agent_kind" AS ENUM('live', 'trial');--> statement-breakpoint
CREATE TYPE "public"."trial_run_status" AS ENUM('pending', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "trial_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"status" "trial_run_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "kind" "agent_kind" DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "trial_runs" ADD CONSTRAINT "trial_runs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_runs" ADD CONSTRAINT "trial_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trial_runs_pending_idx" ON "trial_runs" USING btree ("created_at") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "trial_runs_account_idx" ON "trial_runs" USING btree ("account_id","created_at");