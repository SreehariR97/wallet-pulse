ALTER TABLE "users" ALTER COLUMN "monthly_budget" TYPE numeric(14, 2) USING "monthly_budget"::numeric(14, 2);--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "budget_limit" TYPE numeric(14, 2) USING "budget_limit"::numeric(14, 2);--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "amount" TYPE numeric(14, 2) USING "amount"::numeric(14, 2);--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "amount" TYPE numeric(14, 2) USING "amount"::numeric(14, 2);--> statement-breakpoint
ALTER TABLE "credit_cards" ALTER COLUMN "credit_limit" TYPE numeric(14, 2) USING "credit_limit"::numeric(14, 2);