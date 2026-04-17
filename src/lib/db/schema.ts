import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  boolean,
  doublePrecision,
  integer,
  numeric,
  timestamp,
  index,
  uniqueIndex,
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
    type: text("type").$type<"expense" | "income" | "loan" | "transfer">().notNull(),
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
    // When set, the transaction is either a card-paid expense (type=expense)
    // or a card repayment (type=transfer). FK → credit_cards; ON DELETE SET
    // NULL so archiving/deleting a card never orphans history.
    creditCardId: text("credit_card_id").references(() => creditCards.id, {
      onDelete: "set null",
    }),
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
    userCardIdx: index("tx_user_card_idx").on(t.userId, t.creditCardId),
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

export const creditCards = pgTable(
  "credit_cards",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    issuer: text("issuer").notNull(),
    last4: text("last4"),
    creditLimit: doublePrecision("credit_limit").notNull(),
    // statementDay is the LAST day of the closing cycle (Chase / Amex
    // convention). Transactions dated on this day belong to the cycle that
    // just closed; the new cycle starts the following day. Values 1..31
    // are stored as-is; computation caps to month-end for short months.
    statementDay: integer("statement_day").notNull(),
    paymentDueDay: integer("payment_due_day").notNull(),
    minimumPaymentPercent: doublePrecision("minimum_payment_percent")
      .notNull()
      .default(2),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: doublePrecision("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    userIdx: index("cc_user_idx").on(t.userId),
  })
);

// fx_rate and fee use numeric() for exact decimal precision — FX audits and
// fee accumulation accrue rounding errors in float64. Other money values
// (amount, credit_limit) use doublePrecision per house convention.
export const remittances = pgTable(
  "remittances",
  {
    id: text("id").primaryKey(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fromCurrency: text("from_currency").notNull().default("USD"),
    toCurrency: text("to_currency").notNull().default("INR"),
    fxRate: numeric("fx_rate", { precision: 12, scale: 6 }).notNull(),
    fee: numeric("fee", { precision: 12, scale: 4 }).notNull(),
    service: text("service")
      .$type<"wise" | "remitly" | "western_union" | "bank_wire" | "other">()
      .notNull(),
    recipientNote: text("recipient_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    transactionIdx: uniqueIndex("remit_tx_uniq").on(t.transactionId),
    userIdx: index("remit_user_idx").on(t.userId),
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
export type CreditCard = typeof creditCards.$inferSelect;
export type NewCreditCard = typeof creditCards.$inferInsert;
export type Remittance = typeof remittances.$inferSelect;
export type NewRemittance = typeof remittances.$inferInsert;
