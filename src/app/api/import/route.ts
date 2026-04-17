import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, transactions } from "@/lib/db/schema";
import { fail, requireUser } from "@/lib/api";

type ImportRow = {
  date?: string;
  type?: string;
  category?: string;
  amount?: string | number;
  description?: string;
  notes?: string | null;
  paymentMethod?: string;
  tags?: string | null;
};

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
  const rows = body.rows as ImportRow[];
  if (rows.length === 0) return fail(400, "No rows to import");
  if (rows.length > 5000) return fail(400, "Too many rows (max 5000 per import)");

  const userCats = await db.select().from(categories).where(eq(categories.userId, auth.userId));
  const catByName = new Map(userCats.map((c) => [c.name.toLowerCase(), c]));
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

  // Two-pass: first validate every row and build the insert payload, then
  // commit the batch. That way we never leave a partial import behind even
  // if one row is malformed.
  const inserts: Array<typeof transactions.$inferInsert> = [];
  const errors: { row: number; error: string }[] = [];

  rows.forEach((r, idx) => {
    const type = (r.type ?? "expense").toLowerCase();
    if (!TYPES.has(type)) {
      errors.push({ row: idx + 1, error: `Invalid type "${r.type}"` });
      return;
    }

    const amountNum = Number(r.amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      errors.push({ row: idx + 1, error: `Invalid amount "${r.amount}"` });
      return;
    }

    if (!r.date) {
      errors.push({ row: idx + 1, error: "Missing date" });
      return;
    }
    const parsedDate = new Date(String(r.date));
    if (isNaN(parsedDate.getTime())) {
      errors.push({ row: idx + 1, error: `Invalid date "${r.date}"` });
      return;
    }

    const description = (r.description ?? "").trim() || "Imported transaction";

    let categoryId: string | undefined;
    if (r.category) {
      const match = catByName.get(String(r.category).toLowerCase());
      if (match) categoryId = match.id;
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

    const paymentMethod = r.paymentMethod && PAYMENT_METHODS.has(r.paymentMethod)
      ? (r.paymentMethod as PaymentMethodSql)
      : ("other" as PaymentMethodSql);

    inserts.push({
      id: randomUUID(),
      userId: auth.userId,
      categoryId,
      type: type as TxTypeSql,
      amount: amountNum,
      currency: auth.user.currency ?? "USD",
      description,
      notes: r.notes || null,
      date: parsedDate,
      paymentMethod,
      isRecurring: false,
      tags: r.tags || null,
    });
  });

  if (inserts.length > 0) {
    // Postgres handles multi-row inserts natively; one round-trip for the batch.
    await db.insert(transactions).values(inserts);
  }

  return NextResponse.json(
    { data: { imported: inserts.length, skipped: errors.length, errors: errors.slice(0, 50) } },
    { status: 201 }
  );
}
