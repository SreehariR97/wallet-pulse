import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  boolean,
  doublePrecision,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

const now = sql`now()`;

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  currency: text("currency").notNull().default("USD"),
  monthlyBudget: doublePrecision("monthly_budget"),
  theme: text("theme").notNull().default("dark"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
});

export const categories = pgTable(
  "categories",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon").notNull().default("📦"),
    color: text("color").notNull().default("#6366F1"),
    // Enum values are validated in the Zod layer; keeping this as plain text
    // avoids a PG native enum type and keeps migrations trivially additive.
    type: text("type").$type<"expense" | "income" | "loan">().notNull(),
    budgetLimit: doublePrecision("budget_limit"),
    isDefault: boolean("is_default").notNull().default(false),
    sortOrder: doublePrecision("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    userIdx: index("categories_user_idx").on(t.userId),
  })
);

export const transactions = pgTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    type: text("type")
      .$type<
        | "expense"
        | "income"
        | "transfer"
        | "loan_given"
        | "loan_taken"
        | "repayment_received"
        | "repayment_made"
      >()
      .notNull(),
    amount: doublePrecision("amount").notNull(),
    currency: text("currency").notNull().default("USD"),
    description: text("description").notNull(),
    notes: text("notes"),
    date: timestamp("date", { withTimezone: true }).notNull(),
    paymentMethod: text("payment_method")
      .$type<"cash" | "credit_card" | "debit_card" | "bank_transfer" | "upi" | "other">()
      .notNull()
      .default("cash"),
    isRecurring: boolean("is_recurring").notNull().default(false),
    recurringFrequency: text("recurring_frequency").$type<
      "daily" | "weekly" | "monthly" | "yearly"
    >(),
    tags: text("tags"),
    receiptUrl: text("receipt_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    userDateIdx: index("tx_user_date_idx").on(t.userId, t.date),
    userCategoryIdx: index("tx_user_category_idx").on(t.userId, t.categoryId),
    userTypeIdx: index("tx_user_type_idx").on(t.userId, t.type),
  })
);

export const budgets = pgTable(
  "budgets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "cascade" }),
    amount: doublePrecision("amount").notNull(),
    period: text("period").$type<"weekly" | "monthly" | "yearly">().notNull().default("monthly"),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    userIdx: index("budgets_user_idx").on(t.userId),
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;
