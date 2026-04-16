import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

const now = sql`(strftime('%s', 'now'))`;

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  currency: text("currency").notNull().default("USD"),
  monthlyBudget: real("monthly_budget"),
  theme: text("theme").notNull().default("dark"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(now),
});

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon").notNull().default("📦"),
    color: text("color").notNull().default("#6366F1"),
    type: text("type", { enum: ["expense", "income"] }).notNull(),
    budgetLimit: real("budget_limit"),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(now),
  },
  (t) => ({
    userIdx: index("categories_user_idx").on(t.userId),
  })
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    type: text("type", { enum: ["expense", "income", "transfer"] }).notNull(),
    amount: real("amount").notNull(),
    currency: text("currency").notNull().default("USD"),
    description: text("description").notNull(),
    notes: text("notes"),
    date: integer("date", { mode: "timestamp" }).notNull(),
    paymentMethod: text("payment_method", {
      enum: ["cash", "credit_card", "debit_card", "bank_transfer", "upi", "other"],
    })
      .notNull()
      .default("cash"),
    isRecurring: integer("is_recurring", { mode: "boolean" }).notNull().default(false),
    recurringFrequency: text("recurring_frequency", { enum: ["daily", "weekly", "monthly", "yearly"] }),
    tags: text("tags"),
    receiptUrl: text("receipt_url"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(now),
  },
  (t) => ({
    userDateIdx: index("tx_user_date_idx").on(t.userId, t.date),
    userCategoryIdx: index("tx_user_category_idx").on(t.userId, t.categoryId),
    userTypeIdx: index("tx_user_type_idx").on(t.userId, t.type),
  })
);

export const budgets = sqliteTable(
  "budgets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "cascade" }),
    amount: real("amount").notNull(),
    period: text("period", { enum: ["weekly", "monthly", "yearly"] }).notNull().default("monthly"),
    startDate: integer("start_date", { mode: "timestamp" }).notNull(),
    endDate: integer("end_date", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(now),
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
