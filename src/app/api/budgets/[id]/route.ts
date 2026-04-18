import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { budgets } from "@/lib/db/schema";
import { budgetUpdateSchema } from "@/lib/validations/budget";
import { ok, fail, zodFail, requireUser } from "@/lib/api";
import type { BudgetDTO, DeletedIdDTO } from "@/types";

type BudgetPatch = Partial<
  Omit<typeof budgets.$inferInsert, "id" | "userId" | "createdAt" | "updatedAt">
>;

function toBudgetDTO(b: typeof budgets.$inferSelect): BudgetDTO {
  return {
    id: b.id,
    userId: b.userId,
    categoryId: b.categoryId,
    amount: Number(b.amount),
    period: b.period,
    startDate: b.startDate,
    endDate: b.endDate,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

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

  const patch: BudgetPatch = {};
  if (b.categoryId !== undefined) patch.categoryId = b.categoryId;
  if (b.amount !== undefined) patch.amount = String(b.amount);
  if (b.period !== undefined) patch.period = b.period;
  if (b.startDate !== undefined) patch.startDate = b.startDate;
  if (b.endDate !== undefined) patch.endDate = b.endDate ?? null;

  const [row] = await db.update(budgets).set(patch).where(eq(budgets.id, params.id)).returning();
  return ok(toBudgetDTO(row) satisfies BudgetDTO);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const existing = await assertOwned(params.id, auth.userId);
  if (!existing) return fail(404, "Budget not found");
  await db.delete(budgets).where(eq(budgets.id, params.id));
  return ok({ id: params.id } satisfies DeletedIdDTO);
}
