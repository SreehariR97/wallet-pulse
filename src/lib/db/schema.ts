import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  boolean,
  date,
  doublePrecision,
  integer,
  numeric,
  timestamp,
  index,
  uniqueIndex,
  unique,
  check,
} from "drizzle-orm/pg-core";

const now = sql`now()`;

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  currency: text("currency").notNull().default("USD"),
  monthlyBudget: numeric("monthly_budget", { precision: 14, scale: 2 }),
  theme: text("theme").notNull().default("dark"),
  // Copied into the JWT at sign-in and re-checked on every server-side
  // auth() call (see src/lib/auth.ts). Bumping it revokes every session
  // issued before the bump — password change does this.
  sessionVersion: integer("session_version").notNull().default(0),
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
    budgetLimit: numeric("budget_limit", { precision: 14, scale: 2 }),
    isDefault: boolean("is_default").notNull().default(false),
    sortOrder: doublePrecision("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    userIdx: index("categories_user_idx").on(t.userId),
    // One copy of each seeded default per user, so the GET backfill can't
    // race itself into duplicates. User-created categories may share names.
    defaultNameUniq: uniqueIndex("categories_user_default_name_uniq")
      .on(t.userId, t.type, sql`lower(${t.name})`)
      .where(sql`${t.isDefault}`),
    typeCheck: check("categories_type_check", sql`${t.type} IN ('expense', 'income', 'loan', 'transfer')`),
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
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    description: text("description").notNull(),
    notes: text("notes"),
    // Civil date (calendar day, no timezone) — see migration 0003. Use
    // formatCivilDate() in src/lib/utils.ts for client rendering.
    date: date("date").notNull(),
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
    // Leading-column indexes for the FKs, so deleting a category or card
    // doesn't scan every transaction.
    categoryIdx: index("tx_category_idx").on(t.categoryId),
    cardIdx: index("tx_card_idx").on(t.creditCardId),
    amountCheck: check("transactions_amount_positive", sql`${t.amount} > 0`),
    typeCheck: check(
      "transactions_type_check",
      sql`${t.type} IN ('expense', 'income', 'transfer', 'loan_given', 'loan_taken', 'repayment_received', 'repayment_made')`,
    ),
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
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    period: text("period").$type<"weekly" | "monthly" | "yearly">().notNull().default("monthly"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    userIdx: index("budgets_user_idx").on(t.userId),
    categoryIdx: index("budgets_category_idx").on(t.categoryId),
    // One budget per category and period; NULLS NOT DISTINCT makes this
    // cover the overall (category-less) budget too.
    categoryPeriodUniq: unique("budgets_user_category_period_uniq")
      .on(t.userId, t.categoryId, t.period)
      .nullsNotDistinct(),
    amountCheck: check("budgets_amount_positive", sql`${t.amount} > 0`),
    periodCheck: check("budgets_period_check", sql`${t.period} IN ('weekly', 'monthly', 'yearly')`),
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
    creditLimit: numeric("credit_limit", { precision: 14, scale: 2 }).notNull(),
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

// Amounts stored as numeric(14,2) for exact decimal precision (see migration
// 0002). Remittances fx_rate and fee use tighter precisions matching their
// column definitions below.
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

// Statement history. One row per billing cycle, projected or real. The day-of-
// month integers on `credit_cards` (statement_day, payment_due_day) are being
// phased out — they model "same day every month", which real issuers (Chase,
// Amex, etc.) don't actually follow: close dates shift for weekends, holidays,
// and Fed maintenance within a ±4-day envelope, and users historically could
// save combinations that produced a sub-21-day grace period (regulatory
// minimum on any real card). This table stores the actual close and due
// calendar dates per cycle, mirroring how issuers themselves store statements,
// and unlocks per-cycle audit (late-payment detection, paid-in-full checks,
// grace-period validation) that the integer model couldn't support.
export const creditCardCycles = pgTable(
  "credit_card_cycles",
  {
    id: text("id").primaryKey(),
    cardId: text("card_id")
      .notNull()
      .references(() => creditCards.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Civil dates (calendar day, no TZ) copied from the user's statement or
    // projected forward from the card's day-of-month integers during Phase 1.
    cycleCloseDate: date("cycle_close_date").notNull(),
    paymentDueDate: date("payment_due_date").notNull(),
    // Populated once the statement is issued. Nullable until then — a
    // projected cycle doesn't know what the balance will be.
    statementBalance: numeric("statement_balance", { precision: 14, scale: 2 }),
    minimumPayment: numeric("minimum_payment", { precision: 14, scale: 2 }),
    // Running total of payments allocated to this cycle. Auto-populated in a
    // future phase by summing transfer transactions dated between
    // cycle_close_date and payment_due_date. Default 0 so SQL aggregation
    // works without coalesce on day one.
    amountPaid: numeric("amount_paid", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    // Projected = estimate shown to the user (e.g. next upcoming cycle before
    // the statement arrives). Real = locked cycle derived from a real
    // statement. Only projected cycles are freely editable by the form; real
    // cycles are historical artifacts and shouldn't be mutated except via the
    // explicit "correct this statement" flow (Phase 3).
    isProjected: boolean("is_projected").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    cardIdx: index("ccc_card_idx").on(t.cardId),
    userIdx: index("ccc_user_idx").on(t.userId),
    // Speeds up "find the next upcoming cycle for this card" — common read.
    cardDueIdx: index("ccc_card_due_idx").on(t.cardId, t.paymentDueDate),
    // Invariants: one statement per close date, and exactly one projected
    // (currently accruing) cycle per card.
    cardCloseUniq: uniqueIndex("ccc_card_close_uniq").on(t.cardId, t.cycleCloseDate),
    oneProjectedUniq: uniqueIndex("ccc_one_projected_per_card").on(t.cardId).where(sql`${t.isProjected}`),
  })
);

export type CreditCardCycle = typeof creditCardCycles.$inferSelect;
export type NewCreditCardCycle = typeof creditCardCycles.$inferInsert;

// Fixed-window counters for auth endpoints (login, register, password
// change). Lives in Postgres so limits hold across serverless instances
// without extra infrastructure. See src/lib/rate-limit.ts.
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().default(now),
});
