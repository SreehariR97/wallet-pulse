import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { transactions, categories } from "@/lib/db/schema";
import { transactionUpdateSchema } from "@/lib/validations/transaction";
import { ok, fail, zodFail, requireUser } from "@/lib/api";

async function assertOwned(id: string, userId: string) {
  const [row] = await db.select().from(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, userId))).limit(1);
  return row;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const row = await assertOwned(params.id, auth.userId);
  if (!row) return fail(404, "Transaction not found");
  return ok(row);
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const existing = await assertOwned(params.id, auth.userId);
  if (!existing) return fail(404, "Transaction not found");

  const body = await req.json().catch(() => null);
  const parsed = transactionUpdateSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);
  const t = parsed.data;

  if (t.categoryId) {
    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, t.categoryId), eq(categories.userId, auth.userId)))
      .limit(1);
    if (!cat) return fail(400, "Invalid category");
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (t.type !== undefined) patch.type = t.type;
  if (t.amount !== undefined) patch.amount = t.amount;
  if (t.categoryId !== undefined) patch.categoryId = t.categoryId;
  if (t.description !== undefined) patch.description = t.description;
  if (t.notes !== undefined) patch.notes = t.notes;
  if (t.date !== undefined) patch.date = new Date(t.date + "T12:00:00.000Z");
  if (t.paymentMethod !== undefined) patch.paymentMethod = t.paymentMethod;
  if (t.isRecurring !== undefined) patch.isRecurring = t.isRecurring;
  if (t.recurringFrequency !== undefined) patch.recurringFrequency = t.recurringFrequency;
  if (t.tags !== undefined) patch.tags = t.tags;

  await db.update(transactions).set(patch).where(eq(transactions.id, params.id));
  const [row] = await db.select().from(transactions).where(eq(transactions.id, params.id)).limit(1);
  return ok(row);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const existing = await assertOwned(params.id, auth.userId);
  if (!existing) return fail(404, "Transaction not found");
  await db.delete(transactions).where(eq(transactions.id, params.id));
  return ok({ id: params.id });
}
