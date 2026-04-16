import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, transactions } from "@/lib/db/schema";
import { ok, fail, requireUser } from "@/lib/api";

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
const TYPES = new Set(["expense", "income", "transfer"]);

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
  const fallbackExpense = userCats.find((c) => c.type === "expense" && c.name === "Miscellaneous") ?? userCats.find((c) => c.type === "expense");
  const fallbackIncome = userCats.find((c) => c.type === "income");

  const inserts: { id: string; date: Date; amount: number; description: string }[] = [];
  const errors: { row: number; error: string }[] = [];

  rows.forEach((r, idx) => {
    const type = (r.type ?? "expense").toLowerCase();
    if (!TYPES.has(type)) return errors.push({ row: idx + 1, error: `Invalid type "${r.type}"` });

    const amountNum = Number(r.amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) return errors.push({ row: idx + 1, error: `Invalid amount "${r.amount}"` });

    if (!r.date) return errors.push({ row: idx + 1, error: "Missing date" });
    const parsedDate = new Date(String(r.date));
    if (isNaN(parsedDate.getTime())) return errors.push({ row: idx + 1, error: `Invalid date "${r.date}"` });

    const description = (r.description ?? "").trim() || "Imported transaction";

    let categoryId: string | undefined;
    if (r.category) {
      const match = catByName.get(String(r.category).toLowerCase());
      if (match) categoryId = match.id;
    }
    if (!categoryId) {
      const fb = type === "income" ? fallbackIncome : fallbackExpense;
      if (!fb) return errors.push({ row: idx + 1, error: "No category available to assign" });
      categoryId = fb.id;
    }

    const paymentMethod = r.paymentMethod && PAYMENT_METHODS.has(r.paymentMethod)
      ? (r.paymentMethod as string)
      : "other";

    inserts.push({
      id: randomUUID(),
      date: parsedDate,
      amount: amountNum,
      description,
    });

    db.insert(transactions).values({
      id: inserts[inserts.length - 1].id,
      userId: auth.userId,
      categoryId,
      type: type as "expense" | "income" | "transfer",
      amount: amountNum,
      currency: auth.user.currency ?? "USD",
      description,
      notes: r.notes || null,
      date: parsedDate,
      paymentMethod: paymentMethod as "cash" | "credit_card" | "debit_card" | "bank_transfer" | "upi" | "other",
      isRecurring: false,
      tags: r.tags || null,
    }).run();
  });

  return NextResponse.json(
    { data: { imported: inserts.length, skipped: errors.length, errors: errors.slice(0, 50) } },
    { status: 201 }
  );
}
