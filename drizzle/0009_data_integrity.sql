-- Data-integrity constraints (Phase 3). The first block repairs rows that
-- would violate the new unique indexes; CHECK constraints are NOT VALID so
-- they guard every new write without failing on a legacy row.

-- 1. Merge duplicate seeded default categories (the GET backfill could race
--    itself). Keep the oldest copy; repoint transactions and budgets first.
UPDATE "transactions" t SET "category_id" = d.keeper
FROM (
  SELECT "id", first_value("id") OVER (PARTITION BY "user_id", "type", lower("name") ORDER BY "created_at", "id") AS keeper
  FROM "categories" WHERE "is_default"
) d
WHERE t."category_id" = d."id" AND d."id" <> d.keeper;--> statement-breakpoint
UPDATE "budgets" b SET "category_id" = d.keeper
FROM (
  SELECT "id", first_value("id") OVER (PARTITION BY "user_id", "type", lower("name") ORDER BY "created_at", "id") AS keeper
  FROM "categories" WHERE "is_default"
) d
WHERE b."category_id" = d."id" AND d."id" <> d.keeper;--> statement-breakpoint
DELETE FROM "categories" c
USING (
  SELECT "id", first_value("id") OVER (PARTITION BY "user_id", "type", lower("name") ORDER BY "created_at", "id") AS keeper
  FROM "categories" WHERE "is_default"
) d
WHERE c."id" = d."id" AND d."id" <> d.keeper;--> statement-breakpoint

-- 2. One budget per (user, category, period); the overall budget has a NULL
--    category. Keep the most recently edited one.
DELETE FROM "budgets" b
USING (
  SELECT "id", row_number() OVER (PARTITION BY "user_id", "category_id", "period" ORDER BY "updated_at" DESC, "created_at" DESC, "id") AS rn
  FROM "budgets"
) d
WHERE b."id" = d."id" AND d.rn > 1;--> statement-breakpoint

-- 3a. One cycle per (card, close date): prefer the issued (real) row, then
--     the most recently edited.
DELETE FROM "credit_card_cycles" c
USING (
  SELECT "id", row_number() OVER (PARTITION BY "card_id", "cycle_close_date" ORDER BY "is_projected", "updated_at" DESC, "id") AS rn
  FROM "credit_card_cycles"
) d
WHERE c."id" = d."id" AND d.rn > 1;--> statement-breakpoint
-- 3b. Only a card's newest cycle may be projected; older projected rows are
--     stale history.
UPDATE "credit_card_cycles" c SET "is_projected" = false, "updated_at" = now()
FROM (
  SELECT "id", "is_projected", row_number() OVER (PARTITION BY "card_id" ORDER BY "cycle_close_date" DESC) AS rn
  FROM "credit_card_cycles"
) d
WHERE c."id" = d."id" AND d."is_projected" AND d.rn > 1;--> statement-breakpoint
-- 3c. Cards whose newest cycle is a real statement get the projected cycle
--     that should follow it (close +30 days, same grace period — matches
--     nextProjectedCycleDates in src/lib/credit-cards.ts).
INSERT INTO "credit_card_cycles" ("id", "card_id", "user_id", "cycle_close_date", "payment_due_date", "is_projected")
SELECT gen_random_uuid()::text, l."card_id", l."user_id", l."cycle_close_date" + 30, l."payment_due_date" + 30, true
FROM (
  SELECT DISTINCT ON ("card_id") "card_id", "user_id", "cycle_close_date", "payment_due_date", "is_projected"
  FROM "credit_card_cycles"
  ORDER BY "card_id", "cycle_close_date" DESC
) l
WHERE NOT l."is_projected";--> statement-breakpoint
-- 3d. Re-derive amount_paid for every cycle (same rule as
--     reallocateCardCycles in src/lib/credit-card-allocation.ts). Also sweeps
--     in drift from CSV imports and bulk deletes.
UPDATE "credit_card_cycles" SET "amount_paid" = a.total, "updated_at" = now()
FROM (
  SELECT c."id", COALESCE((
    SELECT SUM(t."amount") FROM "transactions" t
    WHERE t."user_id" = c."user_id"
      AND t."credit_card_id" = c."card_id"
      AND t."type" = 'transfer'
      AND t."date" > c."cycle_close_date"
      AND t."date" <= c."payment_due_date"
      AND NOT EXISTS (
        SELECT 1 FROM "credit_card_cycles" c2
        WHERE c2."card_id" = c."card_id"
          AND c2."cycle_close_date" < c."cycle_close_date"
          AND t."date" > c2."cycle_close_date"
          AND t."date" <= c2."payment_due_date"
      )
  ), 0) AS total
  FROM "credit_card_cycles" c
) a
WHERE "credit_card_cycles"."id" = a."id" AND "credit_card_cycles"."amount_paid" IS DISTINCT FROM a.total;--> statement-breakpoint

-- 4. Constraints and indexes.
CREATE INDEX IF NOT EXISTS "budgets_category_idx" ON "budgets" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "categories_user_default_name_uniq" ON "categories" USING btree ("user_id","type",lower("name")) WHERE "categories"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ccc_card_close_uniq" ON "credit_card_cycles" USING btree ("card_id","cycle_close_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ccc_one_projected_per_card" ON "credit_card_cycles" USING btree ("card_id") WHERE "credit_card_cycles"."is_projected";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tx_category_idx" ON "transactions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tx_card_idx" ON "transactions" USING btree ("credit_card_id");--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_category_period_uniq" UNIQUE NULLS NOT DISTINCT("user_id","category_id","period");--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_amount_positive" CHECK ("budgets"."amount" > 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_period_check" CHECK ("budgets"."period" IN ('weekly', 'monthly', 'yearly')) NOT VALID;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_type_check" CHECK ("categories"."type" IN ('expense', 'income', 'loan', 'transfer')) NOT VALID;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_positive" CHECK ("transactions"."amount" > 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_type_check" CHECK ("transactions"."type" IN ('expense', 'income', 'transfer', 'loan_given', 'loan_taken', 'repayment_received', 'repayment_made')) NOT VALID;