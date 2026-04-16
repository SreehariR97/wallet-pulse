/**
 * One-off seed script that populates a variety of realistic sample transactions
 * for a given user email. Useful for demoing every WalletPulse feature:
 *   - expense / income flows
 *   - loans given / loans taken
 *   - repayments in / repayments out (linked to the above)
 *   - recurring transactions (subscriptions, rent)
 *   - every payment method
 *   - tags
 *
 * Run with:   pnpm tsx scripts/seed-sample-transactions.ts sree@gmail.com
 */

import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../src/lib/db";
import { users, categories, transactions } from "../src/lib/db/schema";

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
  date: string; // YYYY-MM-DD
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

const ROWS: SeedRow[] = [
  // ---------- MARCH 2026 ----------
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

  // ---------- APRIL 2026 ----------
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

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: pnpm tsx scripts/seed-sample-transactions.ts <email>");
    process.exit(1);
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    console.error(`User with email ${email} not found.`);
    process.exit(1);
  }
  console.log(`\n→ Seeding for user: ${user.name} <${user.email}> (${user.id})`);

  const cats = await db.select().from(categories).where(eq(categories.userId, user.id));
  const catByName = new Map(cats.map((c) => [c.name.toLowerCase(), c]));
  console.log(`  Found ${cats.length} categories.\n`);

  // Guard rail: stop seeding the same script twice by checking an idempotency
  // marker we embed in notes. If the user already has our seed marker, abort.
  const marker = "[seed:sample-v1]";
  const [existing] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.userId, user.id), eq(transactions.notes, marker)))
    .limit(1);
  if (existing) {
    console.log(`  ⚠️  User already has sample seed data (marker '${marker}' found). Aborting.`);
    process.exit(0);
  }

  // Pre-insert the marker row so accidental reruns bail out.
  const firstCat = cats[0];
  if (!firstCat) {
    console.error("  No categories found — user has not been bootstrapped yet.");
    process.exit(1);
  }
  const markerId = randomUUID();
  const markerDate = new Date("2026-01-01T00:00:00.000Z");
  await db
    .insert(transactions)
    .values({
      id: markerId,
      userId: user.id,
      categoryId: firstCat.id,
      type: "expense",
      amount: 0.01,
      currency: user.currency ?? "USD",
      description: "(seed marker — safe to delete)",
      notes: marker,
      date: markerDate,
      paymentMethod: "other",
      isRecurring: false,
      tags: null,
    });

  let ok = 0;
  let failed = 0;
  for (const r of ROWS) {
    const cat = catByName.get(r.category.toLowerCase());
    if (!cat) {
      console.warn(`  SKIP: no category "${r.category}" (row: ${r.description})`);
      failed++;
      continue;
    }
    await db
      .insert(transactions)
      .values({
        id: randomUUID(),
        userId: user.id,
        categoryId: cat.id,
        type: r.type,
        amount: r.amount,
        currency: user.currency ?? "USD",
        description: r.description,
        notes: r.notes ?? null,
        date: new Date(r.date + "T12:00:00.000Z"),
        paymentMethod: r.paymentMethod,
        isRecurring: r.isRecurring ?? false,
        recurringFrequency: r.isRecurring ? r.recurringFrequency ?? null : null,
        tags: r.tags ?? null,
      });
    ok++;
  }

  console.log(`\n  ✅ Inserted ${ok} transactions (${failed} skipped).`);
  console.log(`  Marker row kept at ${markerDate.toISOString().slice(0, 10)} so this script is idempotent.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
