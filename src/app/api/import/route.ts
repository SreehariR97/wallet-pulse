import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { categories, transactions, type Category } from "@/lib/db/schema";
import { fail, requireUser } from "@/lib/api";
import { MAX_MONEY } from "@/lib/validations/common";
import { importText, parseImportDate, type DateOrder } from "@/lib/import";
import { validateAccountLinks } from "@/lib/accounts";

type ImportRow = {
  date?: unknown;
  type?: unknown;
  category?: unknown;
  amount?: unknown;
  description?: unknown;
  notes?: unknown;
  paymentMethod?: unknown;
  tags?: unknown;
};

// 5000 rows x 13 columns would sit right at Postgres's 65,535 bind-parameter
// limit in one INSERT; chunk well below it.
const INSERT_CHUNK = 1000;

const PAYMENT_METHODS = new Set(["cash", "credit_card", "debit_card", "bank_transfer", "upi", "other"]);
const TYPES = new Set([
  "expense",
  "income",
  "transfer",
  "loan_given",
  "loan_taken",
  "repayment_received",
  "repayment_made",
]);
const LOAN_TYPES = new Set(["loan_given", "loan_taken", "repayment_received", "repayment_made"]);

type TxTypeSql =
  | "expense"
  | "income"
  | "transfer"
  | "loan_given"
  | "loan_taken"
  | "repayment_received"
  | "repayment_made";
type PaymentMethodSql =
  | "cash"
  | "credit_card"
  | "debit_card"
  | "bank_transfer"
  | "upi"
  | "other";

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.rows)) return fail(400, "Invalid payload: expected { rows: [...] }");
  const rows = body.rows as unknown[];
  if (rows.length === 0) return fail(400, "No rows to import");
  if (rows.length > 5000) return fail(400, "Too many rows (max 5000 per import)");
  const dateOrder: DateOrder = body.dateOrder === "DMY" ? "DMY" : "MDY";
  // A bank export belongs to one account: every imported row joins it.
  let accountId: string | null = null;
  if (body.accountId != null) {
    if (typeof body.accountId !== "string" || body.accountId.length > 64) return fail(400, "Invalid account");
    accountId = body.accountId;
    const accountError = await validateAccountLinks(auth.userId, {
      type: "income",
      creditCardId: null,
      accountId,
      transferAccountId: null,
    });
    if (accountError) return fail(400, accountError);
  }

  const userCats = await db.select().from(categories).where(eq(categories.userId, auth.userId));
  // Several categories can share a name across types ("Gifts" as expense and
  // income); pick the one whose type fits the row.
  const catsByName = new Map<string, Category[]>();
  for (const c of userCats) {
    const key = c.name.toLowerCase();
    catsByName.set(key, [...(catsByName.get(key) ?? []), c]);
  }
  const fallbackExpense =
    userCats.find((c) => c.type === "expense" && c.name === "Miscellaneous") ??
    userCats.find((c) => c.type === "expense");
  const fallbackIncome = userCats.find((c) => c.type === "income");
  const fallbackLoan = userCats.find((c) => c.type === "loan");
  // Transfer rows without a named category land here. Credit-card-specific
  // and remittance-specific metadata do NOT round-trip through CSV in v1 —
  // imported transfers lose their card link / FX rate / fee.
  const fallbackTransfer =
    userCats.find((c) => c.type === "transfer") ?? fallbackExpense;

  // Validate every row first; rows with errors are skipped and reported,
  // and all valid rows are then inserted in one atomic unit.
  const inserts: Array<typeof transactions.$inferInsert> = [];
  const errors: { row: number; error: string }[] = [];

  rows.forEach((raw, idx) => {
    if (!raw || typeof raw !== "object") {
      errors.push({ row: idx + 1, error: "Invalid row" });
      return;
    }
    const r = raw as ImportRow;
    const type = String(r.type ?? "").trim().toLowerCase() || "expense";
    if (!TYPES.has(type)) {
      errors.push({ row: idx + 1, error: `Invalid type "${String(r.type).slice(0, 40)}"` });
      return;
    }

    const amountNum = Number(r.amount);
    if (!Number.isFinite(amountNum) || amountNum < 0.01 || amountNum > MAX_MONEY) {
      errors.push({ row: idx + 1, error: `Invalid amount "${String(r.amount).slice(0, 40)}"` });
      return;
    }

    if (r.date === undefined || r.date === null || r.date === "") {
      errors.push({ row: idx + 1, error: "Missing date" });
      return;
    }
    const civilDate = parseImportDate(r.date, dateOrder);
    if (!civilDate) {
      errors.push({ row: idx + 1, error: `Invalid date "${String(r.date).slice(0, 40)}"` });
      return;
    }

    const description = importText(r.description, 200) ?? "Imported transaction";

    const categoryType = LOAN_TYPES.has(type) ? "loan" : type;
    let categoryId: string | undefined;
    const categoryName = importText(r.category, 200);
    if (categoryName) {
      const named = catsByName.get(categoryName.toLowerCase()) ?? [];
      // A same-named category of another type (an "expense" row naming the
      // income category "Salary") falls through to the type's default.
      categoryId = named.find((c) => c.type === categoryType)?.id;
    }
    if (!categoryId) {
      const fb = LOAN_TYPES.has(type)
        ? fallbackLoan
        : type === "income"
          ? fallbackIncome
          : type === "transfer"
            ? fallbackTransfer
            : fallbackExpense;
      if (!fb) {
        errors.push({ row: idx + 1, error: "No category available to assign" });
        return;
      }
      categoryId = fb.id;
    }

    const method = String(r.paymentMethod ?? "").trim().toLowerCase();
    const paymentMethod = PAYMENT_METHODS.has(method)
      ? (method as PaymentMethodSql)
      : ("other" as PaymentMethodSql);

    inserts.push({
      id: randomUUID(),
      userId: auth.userId,
      categoryId,
      type: type as TxTypeSql,
      amount: String(amountNum),
      currency: auth.user.currency ?? "USD",
      description,
      notes: importText(r.notes, 2000),
      date: civilDate,
      paymentMethod,
      accountId,
      isRecurring: false,
      tags: importText(r.tags, 500),
    });
  });

  if (inserts.length > 0) {
    const chunks: Array<typeof inserts> = [];
    for (let i = 0; i < inserts.length; i += INSERT_CHUNK) chunks.push(inserts.slice(i, i + INSERT_CHUNK));
    // All chunks commit together or not at all. Dispatch per CLAUDE.md.
    const maybeBatch = db as { batch?: unknown };
    if (typeof maybeBatch.batch === "function") {
      const neonDb = db as NeonHttpDatabase<typeof schema>;
      const [first, ...rest] = chunks.map((c) => neonDb.insert(transactions).values(c));
      await neonDb.batch([first, ...rest]);
    } else {
      await db.transaction(async (trx) => {
        for (const c of chunks) await trx.insert(transactions).values(c);
      });
    }
  }

  return NextResponse.json(
    { data: { imported: inserts.length, skipped: errors.length, errors: errors.slice(0, 50) } },
    { status: 201 }
  );
}
