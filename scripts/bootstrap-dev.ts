/**
 * One-shot bootstrap for local development. Creates two demo users, seeds
 * default categories for each, and populates a realistic set of sample
 * transactions so every screen in the app has data to render.
 *
 *   Users created:
 *     demo@walletpulse.test  /  demo123   (landing demo, 2 budgets, 16 tx)
 *     sree@gmail.com         /  demo123   (full 41-transaction playground)
 *
 * Run with:   pnpm db:bootstrap-dev
 *
 * Idempotent — re-running only inserts what's missing. Transactions are
 * tagged with a marker row so they don't get duplicated on re-runs.
 */

import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";
import { config } from "dotenv";

// Load .env / .env.local before importing anything that touches `db`.
config({ path: ".env.local" });
config({ path: ".env" });

import { db } from "../src/lib/db";
import {
  users,
  categories,
  transactions,
  budgets,
  type Category,
} from "../src/lib/db/schema";
import { DEFAULT_CATEGORIES } from "../src/lib/db/defaults";

type PaymentMethod =
  | "cash"
  | "credit_card"
  | "debit_card"
  | "bank_transfer"
  | "upi"
  | "other";
type TxType =
  | "expense"
  | "income"
  | "transfer"
  | "loan_given"
  | "loan_taken"
  | "repayment_received"
  | "repayment_made";

type SeedRow = {
  date: string;
  type: TxType;
  amount: number;
  category: string;
  description: string;
  notes?: string;
  paymentMethod: PaymentMethod;
  isRecurring?: boolean;
  recurringFrequency?: "daily" | "weekly" | "monthly" | "yearly";
  tags?: string;
};

// ---- Sample transactions for sree@gmail.com ----
// Covers March + April 2026: income, expense, loans given/taken, repayments,
// recurring subs, multi-payment methods, tagged transactions.
const SREE_TXNS: SeedRow[] = [
  // March 2026
  { date: "2026-03-01", type: "income", amount: 6500, category: "Salary", description: "March paycheck", paymentMethod: "bank_transfer", isRecurring: true, recurringFrequency: "monthly" },
  { date: "2026-03-01", type: "expense", amount: 1800, category: "Rent/Mortgage", description: "March rent", paymentMethod: "bank_transfer", isRecurring: true, recurringFrequency: "monthly" },
  { date: "2026-03-03", type: "expense", amount: 85.4, category: "Groceries", description: "Trader Joe's weekly run", paymentMethod: "credit_card" },
  { date: "2026-03-05", type: "expense", amount: 15.99, category: "Subscriptions", description: "Netflix", paymentMethod: "credit_card", isRecurring: true, recurringFrequency: "monthly" },
  { date: "2026-03-05", type: "expense", amount: 10.99, category: "Subscriptions", description: "Spotify Family", paymentMethod: "credit_card", isRecurring: true, recurringFrequency: "monthly" },
  { date: "2026-03-07", type: "expense", amount: 42.3, category: "Dining Out", description: "Dinner at Nobu", paymentMethod: "credit_card", tags: "date-night" },
  { date: "2026-03-10", type: "income", amount: 450, category: "Freelance", description: "Logo design for Acme Co", paymentMethod: "bank_transfer", tags: "work,side-hustle" },
  { date: "2026-03-12", type: "loan_given", amount: 500, category: "Friends & Family", description: "Lent $500 to Alex for moving", notes: "Alex will pay back over the next couple months", paymentMethod: "bank_transfer", tags: "alex" },
  { date: "2026-03-14", type: "expense", amount: 72.55, category: "Utilities", description: "Electricity bill", paymentMethod: "bank_transfer", isRecurring: true, recurringFrequency: "monthly" },
  { date: "2026-03-15", type: "expense", amount: 55, category: "Transportation", description: "Gas — Shell", paymentMethod: "debit_card" },
  { date: "2026-03-17", type: "expense", amount: 118.22, category: "Groceries", description: "Whole Foods", paymentMethod: "credit_card" },
  { date: "2026-03-18", type: "expense", amount: 22, category: "Dining Out", description: "Chipotle lunch", paymentMethod: "cash" },
  { date: "2026-03-22", type: "loan_taken", amount: 200, category: "Friends & Family", description: "Borrowed $200 from Mom", notes: "Short-term until next paycheck — will pay back early April", paymentMethod: "cash", tags: "mom" },
  { date: "2026-03-25", type: "expense", amount: 38, category: "Personal Care", description: "Haircut", paymentMethod: "cash" },
  { date: "2026-03-28", type: "expense", amount: 64, category: "Entertainment", description: "Movie night + popcorn", paymentMethod: "credit_card" },
  { date: "2026-03-30", type: "expense", amount: 120, category: "Shopping", description: "New sneakers", paymentMethod: "credit_card", tags: "wants" },
  // April 2026
  { date: "2026-04-01", type: "income", amount: 6500, category: "Salary", description: "April paycheck", paymentMethod: "bank_transfer", isRecurring: true, recurringFrequency: "monthly" },
  { date: "2026-04-01", type: "expense", amount: 1800, category: "Rent/Mortgage", description: "April rent", paymentMethod: "bank_transfer", isRecurring: true, recurringFrequency: "monthly" },
  { date: "2026-04-02", type: "expense", amount: 15.99, category: "Subscriptions", description: "Netflix", paymentMethod: "credit_card", isRecurring: true, recurringFrequency: "monthly" },
  { date: "2026-04-02", type: "expense", amount: 92.5, category: "Groceries", description: "Weekly groceries", paymentMethod: "credit_card" },
  { date: "2026-04-03", type: "expense", amount: 2.99, category: "Subscriptions", description: "iCloud 200GB", paymentMethod: "credit_card", isRecurring: true, recurringFrequency: "monthly" },
  { date: "2026-04-05", type: "income", amount: 125, category: "Investments", description: "Dividend payout — VOO", paymentMethod: "bank_transfer" },
  { date: "2026-04-05", type: "loan_taken", amount: 1000, category: "Friends & Family", description: "Borrowed $1000 from Dad for car repair", notes: "Unexpected transmission issue — will repay over 3 months", paymentMethod: "bank_transfer", tags: "dad,car" },
  { date: "2026-04-05", type: "expense", amount: 1120, category: "Transportation", description: "Transmission repair at AutoZone", notes: "Used the $1000 from Dad + $120 of my own", paymentMethod: "credit_card", tags: "car,unexpected" },
  { date: "2026-04-06", type: "expense", amount: 10.99, category: "Subscriptions", description: "Spotify Family", paymentMethod: "credit_card", isRecurring: true, recurringFrequency: "monthly" },
  { date: "2026-04-07", type: "expense", amount: 52, category: "Utilities", description: "Internet — Comcast", paymentMethod: "bank_transfer", isRecurring: true, recurringFrequency: "monthly" },
  { date: "2026-04-08", type: "income", amount: 800, category: "Freelance", description: "Website build for startup", paymentMethod: "bank_transfer", tags: "work,side-hustle" },
  { date: "2026-04-08", type: "loan_given", amount: 200, category: "Friends & Family", description: "Lent $200 to sister for textbooks", notes: "She'll pay back when she gets her refund", paymentMethod: "upi", tags: "sister" },
  { date: "2026-04-09", type: "expense", amount: 6.75, category: "Dining Out", description: "Morning coffee — Blue Bottle", paymentMethod: "credit_card" },
  { date: "2026-04-10", type: "expense", amount: 40, category: "Subscriptions", description: "Gym membership", paymentMethod: "credit_card", isRecurring: true, recurringFrequency: "monthly" },
  { date: "2026-04-11", type: "expense", amount: 28.5, category: "Dining Out", description: "Ramen with friends", paymentMethod: "cash", tags: "social" },
  { date: "2026-04-12", type: "repayment_made", amount: 200, category: "Friends & Family", description: "Paid Mom back in full", notes: "For the March 22 loan — all settled", paymentMethod: "bank_transfer", tags: "mom" },
  { date: "2026-04-13", type: "expense", amount: 68.4, category: "Groceries", description: "Costco run", paymentMethod: "credit_card" },
  { date: "2026-04-13", type: "expense", amount: 14.3, category: "Transportation", description: "Uber to airport", paymentMethod: "credit_card", tags: "travel" },
  { date: "2026-04-13", type: "expense", amount: 289, category: "Travel", description: "Flight to Austin — SWA", paymentMethod: "credit_card", tags: "travel,vacation" },
  { date: "2026-04-14", type: "repayment_received", amount: 300, category: "Friends & Family", description: "Alex paid back $300", notes: "Alex still owes $200 from the original $500 loan", paymentMethod: "bank_transfer", tags: "alex" },
  { date: "2026-04-14", type: "expense", amount: 22.1, category: "Healthcare", description: "CVS pharmacy — prescription", paymentMethod: "debit_card" },
  { date: "2026-04-15", type: "expense", amount: 180, category: "Insurance", description: "Auto insurance — April", paymentMethod: "bank_transfer", isRecurring: true, recurringFrequency: "monthly" },
  { date: "2026-04-15", type: "expense", amount: 55, category: "Gifts & Donations", description: "Birthday gift for friend", paymentMethod: "credit_card", tags: "gift" },
  { date: "2026-04-15", type: "expense", amount: 7.49, category: "Dining Out", description: "Iced latte", paymentMethod: "credit_card" },
  { date: "2026-04-16", type: "expense", amount: 48, category: "Entertainment", description: "Concert tickets — Billie Eilish", paymentMethod: "credit_card", tags: "fun" },
];

// ---- A lighter set for the demo user — just enough to show every screen ----
const DEMO_TXNS: SeedRow[] = [
  { date: "2026-04-01", type: "income", amount: 4500, category: "Salary", description: "Paycheck", paymentMethod: "bank_transfer", isRecurring: true, recurringFrequency: "monthly" },
  { date: "2026-04-01", type: "expense", amount: 1200, category: "Rent/Mortgage", description: "April rent", paymentMethod: "bank_transfer", isRecurring: true, recurringFrequency: "monthly" },
  { date: "2026-04-02", type: "expense", amount: 87.3, category: "Groceries", description: "Weekly groceries", paymentMethod: "credit_card" },
  { date: "2026-04-04", type: "expense", amount: 15.99, category: "Subscriptions", description: "Netflix", paymentMethod: "credit_card", isRecurring: true, recurringFrequency: "monthly" },
  { date: "2026-04-05", type: "expense", amount: 42, category: "Dining Out", description: "Weekend brunch", paymentMethod: "credit_card" },
  { date: "2026-04-06", type: "expense", amount: 45, category: "Transportation", description: "Gas", paymentMethod: "debit_card" },
  { date: "2026-04-08", type: "expense", amount: 95, category: "Groceries", description: "Costco run", paymentMethod: "credit_card" },
  { date: "2026-04-09", type: "expense", amount: 28, category: "Dining Out", description: "Pizza night", paymentMethod: "cash" },
  { date: "2026-04-10", type: "expense", amount: 62, category: "Entertainment", description: "Movie + dinner", paymentMethod: "credit_card" },
  { date: "2026-04-11", type: "expense", amount: 110, category: "Shopping", description: "New shoes", paymentMethod: "credit_card" },
  { date: "2026-04-12", type: "expense", amount: 38.5, category: "Dining Out", description: "Sushi dinner", paymentMethod: "credit_card" },
  { date: "2026-04-13", type: "expense", amount: 120, category: "Groceries", description: "Whole Foods", paymentMethod: "credit_card" },
  { date: "2026-04-14", type: "expense", amount: 22, category: "Dining Out", description: "Lunch out", paymentMethod: "debit_card" },
  { date: "2026-04-14", type: "expense", amount: 68, category: "Utilities", description: "Phone bill", paymentMethod: "bank_transfer", isRecurring: true, recurringFrequency: "monthly" },
  { date: "2026-04-15", type: "expense", amount: 55, category: "Healthcare", description: "Prescription refill", paymentMethod: "debit_card" },
  { date: "2026-04-15", type: "expense", amount: 18.99, category: "Dining Out", description: "Chipotle", paymentMethod: "credit_card" },
];

async function ensureUser(opts: {
  email: string;
  name: string;
  password: string;
  currency?: string;
  monthlyBudget?: number;
}): Promise<{ id: string; created: boolean }> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, opts.email.toLowerCase()))
    .limit(1);
  if (existing) return { id: existing.id, created: false };

  const id = randomUUID();
  const passwordHash = await bcrypt.hash(opts.password, 10);
  await db.insert(users).values({
    id,
    email: opts.email.toLowerCase(),
    name: opts.name,
    passwordHash,
    currency: opts.currency ?? "USD",
    monthlyBudget: opts.monthlyBudget ?? null,
  });
  return { id, created: true };
}

async function ensureCategoriesForUser(userId: string): Promise<Category[]> {
  const existing = await db.select().from(categories).where(eq(categories.userId, userId));
  const byKey = new Set(existing.map((c) => `${c.type}::${c.name.toLowerCase()}`));
  const missing = DEFAULT_CATEGORIES.filter(
    (d) => !byKey.has(`${d.type}::${d.name.toLowerCase()}`)
  );
  if (missing.length > 0) {
    await db.insert(categories).values(
      missing.map((c, i) => ({
        id: randomUUID(),
        userId,
        name: c.name,
        icon: c.icon,
        color: c.color,
        type: c.type,
        isDefault: true,
        sortOrder: existing.length + i,
      }))
    );
    return db.select().from(categories).where(eq(categories.userId, userId));
  }
  return existing;
}

async function seedTransactions(
  userId: string,
  currency: string,
  rows: SeedRow[],
  marker: string
): Promise<{ inserted: number; skipped: string }> {
  // Idempotency: if our marker row is already there, we've already seeded.
  const [existingMarker] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.notes, marker)))
    .limit(1);
  if (existingMarker) return { inserted: 0, skipped: "already seeded" };

  const cats = await db.select().from(categories).where(eq(categories.userId, userId));
  const catByName = new Map(cats.map((c) => [c.name.toLowerCase(), c]));
  const firstCat = cats[0];
  if (!firstCat) throw new Error(`No categories for user ${userId}. Seed categories first.`);

  // Insert the marker first so partial reruns don't double-seed.
  await db.insert(transactions).values({
    id: randomUUID(),
    userId,
    categoryId: firstCat.id,
    type: "expense",
    amount: 0.01,
    currency,
    description: "(seed marker — safe to delete)",
    notes: marker,
    date: new Date("2026-01-01T00:00:00.000Z"),
    paymentMethod: "other",
    isRecurring: false,
    tags: null,
  });

  let inserted = 0;
  for (const r of rows) {
    const cat = catByName.get(r.category.toLowerCase());
    if (!cat) {
      console.warn(`  SKIP: no category "${r.category}" for "${r.description}"`);
      continue;
    }
    await db.insert(transactions).values({
      id: randomUUID(),
      userId,
      categoryId: cat.id,
      type: r.type,
      amount: r.amount,
      currency,
      description: r.description,
      notes: r.notes ?? null,
      date: new Date(r.date + "T12:00:00.000Z"),
      paymentMethod: r.paymentMethod,
      isRecurring: r.isRecurring ?? false,
      recurringFrequency: r.isRecurring ? r.recurringFrequency ?? null : null,
      tags: r.tags ?? null,
    });
    inserted++;
  }
  return { inserted, skipped: "" };
}

async function seedBudgetsForDemo(userId: string, cats: Category[]) {
  const existing = await db.select({ id: budgets.id }).from(budgets).where(eq(budgets.userId, userId));
  if (existing.length > 0) return 0;

  const groceries = cats.find((c) => c.name === "Groceries");
  const dining = cats.find((c) => c.name === "Dining Out");
  const startOfMonth = new Date("2026-04-01T00:00:00.000Z");

  const rows = [
    groceries && {
      id: randomUUID(),
      userId,
      categoryId: groceries.id,
      amount: 400,
      period: "monthly" as const,
      startDate: startOfMonth,
    },
    dining && {
      id: randomUUID(),
      userId,
      categoryId: dining.id,
      amount: 150,
      period: "monthly" as const,
      startDate: startOfMonth,
    },
  ].filter(Boolean) as Array<typeof budgets.$inferInsert>;

  if (rows.length > 0) await db.insert(budgets).values(rows);
  return rows.length;
}

async function main() {
  console.log("\n→ Bootstrapping WalletPulse dev environment\n");

  // --- Demo user ---
  const demo = await ensureUser({
    email: "demo@walletpulse.test",
    name: "Demo",
    password: "demo123",
    currency: "USD",
    monthlyBudget: 3000,
  });
  console.log(`  ${demo.created ? "✓ created" : "• exists"}  demo@walletpulse.test`);
  const demoCats = await ensureCategoriesForUser(demo.id);
  console.log(`           categories: ${demoCats.length}`);
  const demoTx = await seedTransactions(demo.id, "USD", DEMO_TXNS, "[bootstrap:demo-v1]");
  console.log(`           transactions: ${demoTx.inserted > 0 ? `${demoTx.inserted} inserted` : demoTx.skipped}`);
  const demoBg = await seedBudgetsForDemo(demo.id, demoCats);
  console.log(`           budgets: ${demoBg > 0 ? `${demoBg} inserted` : "already set"}`);

  // --- Sree user ---
  const sree = await ensureUser({
    email: "sree@gmail.com",
    name: "Sree",
    password: "demo123",
    currency: "USD",
  });
  console.log(`\n  ${sree.created ? "✓ created" : "• exists"}  sree@gmail.com`);
  const sreeCats = await ensureCategoriesForUser(sree.id);
  console.log(`           categories: ${sreeCats.length}`);
  const sreeTx = await seedTransactions(sree.id, "USD", SREE_TXNS, "[bootstrap:sree-v1]");
  console.log(`           transactions: ${sreeTx.inserted > 0 ? `${sreeTx.inserted} inserted` : sreeTx.skipped}`);

  console.log("\n  Done. Log in at http://localhost:3000/login with either account (password: demo123)\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
