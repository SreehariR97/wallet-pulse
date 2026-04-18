ALTER TABLE "transactions" ALTER COLUMN "date" TYPE date USING "date"::date;--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "start_date" TYPE date USING "start_date"::date;--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "end_date" TYPE date USING "end_date"::date;