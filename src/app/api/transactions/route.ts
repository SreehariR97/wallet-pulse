import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, asc, desc, eq, gte, lte, ilike, isNotNull, isNull, sql, or, exists, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { transactions, categories, creditCards, remittances } from "@/lib/db/schema";
import { transactionCreateSchema, transactionQuerySchema } from "@/lib/validations/transaction";
import { ok, fail, zodFail, requireUser } from "@/lib/api";
import type { TransactionDTO, TransactionListItem } from "@/types";

function toTransactionDTO(t: typeof transactions.$inferSelect): TransactionDTO {
  return {
    id: t.id,
    userId: t.userId,
    categoryId: t.categoryId,
    type: t.type,
    amount: Number(t.amount),
    currency: t.currency,
    description: t.description,
    notes: t.notes,
    date: t.date,
    paymentMethod: t.paymentMethod,
    creditCardId: t.creditCardId,
    isRecurring: t.isRecurring,
    recurringFrequency: t.recurringFrequency,
    tags: t.tags,
    receiptUrl: t.receiptUrl,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const parsed = transactionQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return zodFail(parsed.error);
  const q = parsed.data;

  const filters: (SQL | undefined)[] = [eq(transactions.userId, auth.userId)];
  if (q.categoryId) filters.push(eq(transactions.categoryId, q.categoryId));
  if (q.type) filters.push(eq(transactions.type, q.type));
  if (q.paymentMethod) filters.push(eq(transactions.paymentMethod, q.paymentMethod));
  if (q.creditCardId) {
    // "none" → no card attached; any other value → specific card.
    if (q.creditCardId === "none") filters.push(isNull(transactions.creditCardId));
    else filters.push(eq(transactions.creditCardId, q.creditCardId));
  }
  // Shortcut filters — layered on top of other filters.
  if (q.shortcut === "card_payments") {
    filters.push(eq(transactions.type, "transfer"));
    filters.push(isNotNull(transactions.creditCardId));
  } else if (q.shortcut === "remittances") {
    filters.push(eq(transactions.type, "transfer"));
    filters.push(
      exists(
        db
          .select({ one: sql<number>`1` })
          .from(remittances)
          .where(eq(remittances.transactionId, transactions.id)),
      ),
    );
  }
  if (q.from) filters.push(gte(transactions.date, q.from));
  if (q.to) filters.push(lte(transactions.date, q.to));
  if (q.minAmount !== undefined) filters.push(gte(transactions.amount, String(q.minAmount)));
  if (q.maxAmount !== undefined) filters.push(lte(transactions.amount, String(q.maxAmount)));
  if (q.search) {
    const s = `%${q.search}%`;
    filters.push(or(ilike(transactions.description, s), ilike(transactions.notes, s)));
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
      creditCardId: transactions.creditCardId,
      creditCardName: creditCards.name,
      creditCardLast4: creditCards.last4,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(creditCards, eq(transactions.creditCardId, creditCards.id))
    .where(whereClause)
    .orderBy(ordering)
    .limit(q.limit)
    .offset((q.page - 1) * q.limit);

  const normalized: TransactionListItem[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    amount: Number(r.amount),
    currency: r.currency,
    description: r.description,
    notes: r.notes,
    date: r.date,
    paymentMethod: r.paymentMethod,
    isRecurring: r.isRecurring,
    recurringFrequency: r.recurringFrequency,
    tags: r.tags,
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    categoryIcon: r.categoryIcon,
    categoryColor: r.categoryColor,
    creditCardId: r.creditCardId,
    creditCardName: r.creditCardName,
    creditCardLast4: r.creditCardLast4,
    createdAt: r.createdAt.toISOString(),
  }));
  return ok(normalized satisfies TransactionListItem[], { total, page: q.page, limit: q.limit, totalPages: Math.max(1, Math.ceil(total / q.limit)) });
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

  // Re-verify card ownership server-side — a malicious payload could reference
  // another user's card id. Only accept active cards via the standard flow;
  // archived cards are edit-only through the admin/hard-delete path.
  if (t.creditCardId) {
    const [card] = await db
      .select({ id: creditCards.id })
      .from(creditCards)
      .where(
        and(
          eq(creditCards.id, t.creditCardId),
          eq(creditCards.userId, auth.userId),
          eq(creditCards.isActive, true),
        ),
      )
      .limit(1);
    if (!card) return fail(400, "Invalid credit card");
  }

  const [row] = await db
    .insert(transactions)
    .values({
      id: randomUUID(),
      userId: auth.userId,
      categoryId: t.categoryId,
      type: t.type,
      amount: String(t.amount),
      currency: auth.user.currency ?? "USD",
      description: t.description,
      notes: t.notes ?? null,
      date: t.date,
      paymentMethod: t.paymentMethod,
      creditCardId: t.creditCardId ?? null,
      isRecurring: t.isRecurring,
      recurringFrequency: t.isRecurring ? t.recurringFrequency ?? null : null,
      tags: t.tags ?? null,
    })
    .returning();
  return NextResponse.json({ data: toTransactionDTO(row) satisfies TransactionDTO }, { status: 201 });
}
