import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { budgets } from "@/lib/db/schema";
import { budgetUpdateSchema } from "@/lib/validations/budget";
import { ok, fail, zodFail, requireUser } from "@/lib/api";

async function assertOwned(id: string, userId: string) {
  const [row] = await db.select().from(budgets).where(and(eq(budgets.id, id), eq(budgets.userId, userId))).limit(1);
  return row;
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const existing = await assertOwned(params.id, auth.userId);
  if (!existing) return fail(404, "Budget not found");

  const body = await req.json().catch(() => null);
  const parsed = budgetUpdateSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);
  const b = parsed.data;

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (b.categoryId !== undefined) patch.categoryId = b.categoryId;
  if (b.amount !== undefined) patch.amount = b.amount;
  if (b.period !== undefined) patch.period = b.period;
  if (b.startDate !== undefined) patch.startDate = new Date(b.startDate + "T00:00:00.000Z");
  if (b.endDate !== undefined) patch.endDate = b.endDate ? new Date(b.endDate + "T23:59:59.999Z") : null;

  await db.update(budgets).set(patch).where(eq(budgets.id, params.id)).run();
  const [row] = await db.select().from(budgets).where(eq(budgets.id, params.id)).limit(1);
  return ok(row);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const existing = await assertOwned(params.id, auth.userId);
  if (!existing) return fail(404, "Budget not found");
  await db.delete(budgets).where(eq(budgets.id, params.id)).run();
  return ok({ id: params.id });
}
