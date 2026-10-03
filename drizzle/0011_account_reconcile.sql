CREATE TABLE IF NOT EXISTS "account_reconciliations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"statement_date" date NOT NULL,
	"statement_balance" numeric(14, 2) NOT NULL,
	"computed_balance" numeric(14, 2) NOT NULL,
	"adjustment_transaction_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "account_reconciliations" ADD CONSTRAINT "account_reconciliations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "account_reconciliations" ADD CONSTRAINT "account_reconciliations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "account_reconciliations" ADD CONSTRAINT "account_reconciliations_adjustment_transaction_id_transactions_id_fk" FOREIGN KEY ("adjustment_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "acct_recon_account_date_idx" ON "account_reconciliations" USING btree ("account_id","statement_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "acct_recon_user_idx" ON "account_reconciliations" USING btree ("user_id");--> statement-breakpoint
-- The new "Balance Adjustment" default category for existing users (new users
-- get it at registration; the categories GET backfill also restores it).
INSERT INTO "categories" ("id", "user_id", "name", "icon", "color", "type", "is_default", "sort_order")
SELECT gen_random_uuid()::text, u."id", 'Balance Adjustment', '⚖️', '#A78BFA', 'transfer', true, 101
FROM "users" u
ON CONFLICT DO NOTHING;
