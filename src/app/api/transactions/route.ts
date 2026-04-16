import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, asc, desc, eq, gte, lte, ilike, sql, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { transactions, categories } from "@/lib/db/schema";
import { transactionCreateSchema, transactionQuerySchema } from "@/lib/validations/transaction";
import { ok, fail, zodFail, requireUser } from "@/lib/api";

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const parsed = transactionQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return zodFail(parsed.error);
  const q = parsed.data;

  const filters = [eq(transactions.userId, auth.userId)];
  if (q.categoryId) filters.push(eq(transactions.categoryId, q.categoryId));
  if (q.type) filters.push(eq(transactions.type, q.type));
  if (q.paymentMethod) filters.push(eq(transactions.paymentMethod, q.paymentMethod));
  if (q.from) filters.push(gte(transactions.date, new Date(q.from + "T00:00:00.000Z")));
  if (q.to) filters.push(lte(transactions.date, new Date(q.to + "T23:59:59.999Z")));
  if (q.minAmount !== undefined) filters.push(gte(transactions.amount, q.minAmount));
  if (q.maxAmount !== undefined) filters.push(lte(transactions.amount, q.maxAmount));
  if (q.search) {
    const s = `%${q.search}%`;
    filters.push(or(ilike(transactions.description, s), ilike(transactions.notes, s)) as any);
  }
  if (q.tags) filters.push(ilike(transactions.tags, `%${q.tags}%`));

  const sortCol =
    q.sort === "amount"
      ? transactions.amount
      : q.sort === "description"
        ? transactions.description
        : q.sort === "createdAt"
          ? transactions.createdAt
          : transactions.date;
  const ordering = q.order === "asc" ? asc(sortCol) : desc(sortCol);

  const whereClause = and(...filters);

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(transactions).where(whereClause);
  const total = Number(count ?? 0);

  const rows = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      currency: transactions.currency,
      description: transactions.description,
      notes: transactions.notes,
      date: transactions.date,
      paymentMethod: transactions.paymentMethod,
      isRecurring: transactions.isRecurring,
      recurringFrequency: transactions.recurringFrequency,
      tags: transactions.tags,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(whereClause)
    .orderBy(ordering)
    .limit(q.limit)
    .offset((q.page - 1) * q.limit);

  return ok(rows, { total, page: q.page, limit: q.limit, totalPages: Math.max(1, Math.ceil(total / q.limit)) });
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = transactionCreateSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);
  const t = parsed.data;

  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, t.categoryId), eq(categories.userId, auth.userId)))
    .limit(1);
  if (!cat) return fail(400, "Invalid category");

  const id = randomUUID();
  await db
    .insert(transactions)
    .values({
      id,
      userId: auth.userId,
      categoryId: t.categoryId,
      type: t.type,
      amount: t.amount,
      currency: auth.user.currency ?? "USD",
      description: t.description,
      notes: t.notes ?? null,
      date: new Date(t.date + "T12:00:00.000Z"),
      paymentMethod: t.paymentMethod,
      isRecurring: t.isRecurring,
      recurringFrequency: t.isRecurring ? t.recurringFrequency ?? null : null,
      tags: t.tags ?? null,
    });

  const [row] = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
  return NextResponse.json({ data: row }, { status: 201 });
}
