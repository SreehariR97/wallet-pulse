CREATE TABLE IF NOT EXISTS "credit_card_cycles" (
	"id" text PRIMARY KEY NOT NULL,
	"card_id" text NOT NULL,
	"user_id" text NOT NULL,
	"cycle_close_date" date NOT NULL,
	"payment_due_date" date NOT NULL,
	"statement_balance" numeric(14, 2),
	"minimum_payment" numeric(14, 2),
	"amount_paid" numeric(14, 2) DEFAULT '0' NOT NULL,
	"is_projected" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_card_cycles" ADD CONSTRAINT "credit_card_cycles_card_id_credit_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."credit_cards"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_card_cycles" ADD CONSTRAINT "credit_card_cycles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ccc_card_idx" ON "credit_card_cycles" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ccc_user_idx" ON "credit_card_cycles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ccc_card_due_idx" ON "credit_card_cycles" USING btree ("card_id","payment_due_date");