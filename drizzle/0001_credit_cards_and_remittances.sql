CREATE TABLE IF NOT EXISTS "credit_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"issuer" text NOT NULL,
	"last4" text,
	"credit_limit" double precision NOT NULL,
	"statement_day" integer NOT NULL,
	"payment_due_day" integer NOT NULL,
	"minimum_payment_percent" double precision DEFAULT 2 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "remittances" (
	"id" text PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"user_id" text NOT NULL,
	"from_currency" text DEFAULT 'USD' NOT NULL,
	"to_currency" text DEFAULT 'INR' NOT NULL,
	"fx_rate" numeric(12, 6) NOT NULL,
	"fee" numeric(12, 4) NOT NULL,
	"service" text NOT NULL,
	"recipient_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "credit_card_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "remittances" ADD CONSTRAINT "remittances_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "remittances" ADD CONSTRAINT "remittances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cc_user_idx" ON "credit_cards" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "remit_tx_uniq" ON "remittances" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "remit_user_idx" ON "remittances" USING btree ("user_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_credit_card_id_credit_cards_id_fk" FOREIGN KEY ("credit_card_id") REFERENCES "public"."credit_cards"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tx_user_card_idx" ON "transactions" USING btree ("user_id","credit_card_id");