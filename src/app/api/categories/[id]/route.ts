import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, transactions } from "@/lib/db/schema";
import { categoryUpdateSchema } from "@/lib/validations/category";
import { ok, fail, zodFail, requireUser } from "@/lib/api";
import type { CategoryDTO, DeletedIdDTO } from "@/types";

type CategoryPatch = Partial<
  Omit<typeof categories.$inferInsert, "id" | "userId" | "createdAt" | "updatedAt">
>;

function toCategoryDTO(c: typeof categories.$inferSelect): CategoryDTO {
  return {
    id: c.id,
    userId: c.userId,
    name: c.name,
    icon: c.icon,
    color: c.color,
    type: c.type,
    budgetLimit: c.budgetLimit != null ? Number(c.budgetLimit) : null,
    isDefault: c.isDefault,
    sortOrder: c.sortOrder,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

async function assertOwned(id: string, userId: string) {
  const [row] = await db.select().from(categories).where(and(eq(categories.id, id), eq(categories.userId, userId))).limit(1);
  return row;
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const existing = await assertOwned(params.id, auth.userId);
  if (!existing) return fail(404, "Category not found");

  const body = await req.json().catch(() => null);
  const parsed = categoryUpdateSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);

  const { budgetLimit, ...rest } = parsed.data;
  const patch: CategoryPatch = {
    ...rest,
    ...(budgetLimit !== undefined
      ? { budgetLimit: budgetLimit != null ? String(budgetLimit) : null }
      : {}),
  };
  const [row] = await db
    .update(categories)
    .set(patch)
    .where(eq(categories.id, params.id))
    .returning();
  return ok(toCategoryDTO(row) satisfies CategoryDTO);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const existing = await assertOwned(params.id, auth.userId);
  if (!existing) return fail(404, "Category not found");

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactions)
    .where(and(eq(transactions.categoryId, params.id), eq(transactions.userId, auth.userId)));

  if (Number(count) > 0) {
    return fail(409, `This category has ${count} transactions. Reassign them first.`, { transactionCount: Number(count) });
  }

  await db.delete(categories).where(eq(categories.id, params.id));
  return ok({ id: params.id } satisfies DeletedIdDTO);
}
