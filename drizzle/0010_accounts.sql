CREATE TABLE IF NOT EXISTS "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'checking' NOT NULL,
	"institution" text,
	"last4" text,
	"opening_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_type_check" CHECK ("accounts"."type" IN ('checking', 'savings', 'cash', 'wallet', 'other'))
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "account_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "transfer_account_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_user_name_uniq" ON "accounts" USING btree ("user_id",lower("name"));--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_transfer_account_id_accounts_id_fk" FOREIGN KEY ("transfer_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tx_user_account_idx" ON "transactions" USING btree ("user_id","account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tx_transfer_account_idx" ON "transactions" USING btree ("transfer_account_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_transfer_account_check" CHECK ("transactions"."transfer_account_id" IS NULL OR ("transactions"."type" = 'transfer' AND "transactions"."credit_card_id" IS NULL AND ("transactions"."account_id" IS NULL OR "transactions"."account_id" <> "transactions"."transfer_account_id")));--> statement-breakpoint
-- Keep accounts.updated_at current like the other user-editable tables (0004).
DROP TRIGGER IF EXISTS set_updated_at ON "accounts";--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "accounts"
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();--> statement-breakpoint
-- The new "Account Transfer" default category for existing users (new users
-- get it at registration; the categories GET backfill also restores it).
INSERT INTO "categories" ("id", "user_id", "name", "icon", "color", "type", "is_default", "sort_order")
SELECT gen_random_uuid()::text, u."id", 'Account Transfer', '🔁', '#A78BFA', 'transfer', true, 100
FROM "users" u
ON CONFLICT DO NOTHING;
