/**
 * One-shot helper that copies every row from your local SQLite database
 * (data/walletpulse.db) into the Postgres database pointed at by
 * DATABASE_URL. Use this once, after you've switched the project to
 * Postgres and applied the first migration to your Neon/Postgres instance.
 *
 *   SQLITE_PATH=./data/walletpulse.db DATABASE_URL=postgres://... \
 *     pnpm db:migrate-from-sqlite
 *
 * The script:
 *   - reads users / categories / transactions / budgets from SQLite
 *   - converts SQLite unix-seconds timestamps to JS Date objects
 *   - inserts them into Postgres in dependency order
 *   - skips rows whose primary key already exists (safe to re-run)
 */
import path from "path";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const sqlitePath = process.env.SQLITE_PATH ?? "./data/walletpulse.db";
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

// Defer importing Drizzle + Neon until after we've validated envs, so the
// error above surfaces quickly.
import { db } from "../src/lib/db";
import { users, categories, transactions, budgets } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";

// better-sqlite3 is listed as an optionalDependency so that Vercel builds
// don't fail when there's no prebuilt binary for their Node runtime. We
// import it dynamically below inside main(), so this script degrades with
// a clear error if the optional install was skipped on the current platform.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BetterSqlite3Ctor = new (path: string, options?: { readonly?: boolean }) => {
  prepare: (sql: string) => { all: () => unknown[] };
  close: () => void;
};

async function loadSqlite(): Promise<BetterSqlite3Ctor> {
  try {
    const mod = await import("better-sqlite3");
    return (mod.default ?? mod) as unknown as BetterSqlite3Ctor;
  } catch {
    console.error(
      "\nbetter-sqlite3 is not installed on this machine.\n" +
        "Install it temporarily for this one-shot migration:\n\n" +
        "  pnpm add -D better-sqlite3\n"
    );
    process.exit(1);
  }
}

type SqliteRow = Record<string, unknown>;

function toDate(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  // SQLite stores our timestamps as unix seconds. better-sqlite3 returns them
  // as numbers. If the column was defined as `{mode: "timestamp"}` Drizzle
  // would have converted for us, but here we're using raw SQL so we do it.
  if (typeof v === "number") return new Date(v * 1000);
  if (typeof v === "string") {
    const asNum = Number(v);
    if (Number.isFinite(asNum) && asNum > 0) return new Date(asNum * 1000);
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  if (v instanceof Date) return v;
  return null;
}

function toBool(v: unknown): boolean {
  return v === 1 || v === true || v === "1" || v === "true";
}

async function main() {
  const Database = await loadSqlite();
  const absPath = path.resolve(sqlitePath);
  console.log(`\n→ Opening SQLite at ${absPath}`);
  const sqlite = new Database(absPath, { readonly: true });

  const userRows = sqlite.prepare("SELECT * FROM users").all() as SqliteRow[];
  const categoryRows = sqlite.prepare("SELECT * FROM categories").all() as SqliteRow[];
  const transactionRows = sqlite.prepare("SELECT * FROM transactions").all() as SqliteRow[];
  const budgetRows = sqlite.prepare("SELECT * FROM budgets").all() as SqliteRow[];

  console.log(`  Found: ${userRows.length} users · ${categoryRows.length} categories · ${transactionRows.length} transactions · ${budgetRows.length} budgets\n`);

  // --- Users ---
  let usersInserted = 0;
  for (const r of userRows) {
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, r.id as string)).limit(1);
    if (existing.length) continue;
    await db.insert(users).values({
      id: r.id as string,
      name: r.name as string,
      email: r.email as string,
      passwordHash: r.password_hash as string,
      currency: (r.currency as string) ?? "USD",
      monthlyBudget: r.monthly_budget == null ? null : Number(r.monthly_budget),
      theme: (r.theme as string) ?? "dark",
      createdAt: toDate(r.created_at) ?? new Date(),
      updatedAt: toDate(r.updated_at) ?? new Date(),
    });
    usersInserted++;
  }
  console.log(`  ✓ users:        ${usersInserted} inserted / ${userRows.length - usersInserted} skipped`);

  // --- Categories ---
  let catsInserted = 0;
  for (const r of categoryRows) {
    const existing = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, r.id as string)).limit(1);
    if (existing.length) continue;
    await db.insert(categories).values({
      id: r.id as string,
      userId: r.user_id as string,
      name: r.name as string,
      icon: (r.icon as string) ?? "📦",
      color: (r.color as string) ?? "#6366F1",
      type: r.type as "expense" | "income" | "loan",
      budgetLimit: r.budget_limit == null ? null : Number(r.budget_limit),
      isDefault: toBool(r.is_default),
      sortOrder: Number(r.sort_order ?? 0),
      createdAt: toDate(r.created_at) ?? new Date(),
      updatedAt: toDate(r.updated_at) ?? new Date(),
    });
    catsInserted++;
  }
  console.log(`  ✓ categories:   ${catsInserted} inserted / ${categoryRows.length - catsInserted} skipped`);

  // --- Transactions ---
  let txInserted = 0;
  for (const r of transactionRows) {
    const existing = await db.select({ id: transactions.id }).from(transactions).where(eq(transactions.id, r.id as string)).limit(1);
    if (existing.length) continue;
    await db.insert(transactions).values({
      id: r.id as string,
      userId: r.user_id as string,
      categoryId: r.category_id as string,
      type: r.type as
        | "expense"
        | "income"
        | "transfer"
        | "loan_given"
        | "loan_taken"
        | "repayment_received"
        | "repayment_made",
      amount: Number(r.amount),
      currency: (r.currency as string) ?? "USD",
      description: r.description as string,
      notes: (r.notes as string | null) ?? null,
      date: toDate(r.date) ?? new Date(),
      paymentMethod: (r.payment_method as
        | "cash"
        | "credit_card"
        | "debit_card"
        | "bank_transfer"
        | "upi"
        | "other") ?? "cash",
      isRecurring: toBool(r.is_recurring),
      recurringFrequency:
        (r.recurring_frequency as "daily" | "weekly" | "monthly" | "yearly" | null) ?? null,
      tags: (r.tags as string | null) ?? null,
      receiptUrl: (r.receipt_url as string | null) ?? null,
      createdAt: toDate(r.created_at) ?? new Date(),
      updatedAt: toDate(r.updated_at) ?? new Date(),
    });
    txInserted++;
  }
  console.log(`  ✓ transactions: ${txInserted} inserted / ${transactionRows.length - txInserted} skipped`);

  // --- Budgets ---
  let bgInserted = 0;
  for (const r of budgetRows) {
    const existing = await db.select({ id: budgets.id }).from(budgets).where(eq(budgets.id, r.id as string)).limit(1);
    if (existing.length) continue;
    await db.insert(budgets).values({
      id: r.id as string,
      userId: r.user_id as string,
      categoryId: (r.category_id as string | null) ?? null,
      amount: Number(r.amount),
      period: (r.period as "weekly" | "monthly" | "yearly") ?? "monthly",
      startDate: toDate(r.start_date) ?? new Date(),
      endDate: toDate(r.end_date),
      createdAt: toDate(r.created_at) ?? new Date(),
      updatedAt: toDate(r.updated_at) ?? new Date(),
    });
    bgInserted++;
  }
  console.log(`  ✓ budgets:      ${bgInserted} inserted / ${budgetRows.length - bgInserted} skipped`);

  sqlite.close();
  console.log(`\n  Done. Your data is now in Postgres.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
