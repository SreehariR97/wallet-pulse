/**
 * GET /api/credit-cards/[id]/cycle?period=current|previous|N
 *
 * Returns the statement cycle window, category-grouped expenses, payments,
 * and the list of transactions falling in the window for a single card.
 *
 * Cycle convention (see lib/credit-cards.ts for the full helper): the card's
 * statementDay is the LAST day of the closing cycle. Transactions dated on
 * statementDay belong to the cycle that just closed; the next cycle starts
 * the following day.
 *
 *   period=current  → the cycle currently accruing (offset 0)
 *   period=previous → the cycle that most recently closed (offset 1)
 *   period=N        → N cycles before the current one
 */
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, creditCards, transactions } from "@/lib/db/schema";
import { cycleQuerySchema } from "@/lib/validations/credit-card";
import { ok, fail, zodFail, requireUser } from "@/lib/api";
import { getStatementCycle } from "@/lib/credit-cards";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const [card] = await db
    .select()
    .from(creditCards)
    .where(and(eq(creditCards.id, params.id), eq(creditCards.userId, auth.userId)))
    .limit(1);
  if (!card) return fail(404, "Card not found");

  const url = new URL(req.url);
  const parsed = cycleQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return zodFail(parsed.error);
  const p = parsed.data;

  const offset =
    p.period === "current" ? 0 : p.period === "previous" ? 1 : Number(p.period);

  const win = getStatementCycle(new Date(), card.statementDay, offset);

  const baseFilters = [
    eq(transactions.userId, auth.userId),
    eq(transactions.creditCardId, card.id),
    gte(transactions.date, win.start),
    lte(transactions.date, win.end),
  ];

  // Category breakdown — expenses only.
  const breakdown = await db
    .select({
      categoryId: categories.id,
      name: categories.name,
      icon: categories.icon,
      color: categories.color,
      total: sql<number>`SUM(${transactions.amount})`,
      count: sql<number>`COUNT(${transactions.id})`,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(...baseFilters, eq(transactions.type, "expense")))
    .groupBy(categories.id)
    .orderBy(desc(sql<number>`SUM(${transactions.amount})`));

  // Totals — expense and payment sides, split so the UI can show "you spent
  // $X, paid back $Y, net $Z" for the cycle.
  const [totals] = await db
    .select({
      totalExpense: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount} ELSE 0 END), 0)`,
      totalPayments: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'transfer' THEN ${transactions.amount} ELSE 0 END), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(transactions)
    .where(and(...baseFilters));

  // Transactions in the window, newest first.
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
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(...baseFilters))
    .orderBy(desc(transactions.date));

  return ok({
    card: {
      id: card.id,
      name: card.name,
      issuer: card.issuer,
      last4: card.last4,
      creditLimit: card.creditLimit,
      statementDay: card.statementDay,
      paymentDueDay: card.paymentDueDay,
    },
    offset,
    start: win.start.toISOString(),
    end: win.end.toISOString(),
    totalExpense: Number(totals?.totalExpense ?? 0),
    totalPayments: Number(totals?.totalPayments ?? 0),
    count: Number(totals?.count ?? 0),
    categoryBreakdown: breakdown.map((b) => ({
      ...b,
      total: Number(b.total),
      count: Number(b.count),
    })),
    transactions: rows,
  });
}
