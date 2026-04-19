/**
 * GET /api/credit-cards/[id]/cycle?period=current|previous|N
 *
 * Returns the statement cycle window, category-grouped expenses, payments,
 * and the list of transactions falling in the window for a single card.
 *
 * Phase 5: cycle windows are derived from rows in `credit_card_cycles`
 * (source of truth). The integer-day helpers are gone. We fetch the
 * target cycle's `cycleCloseDate` plus the previous cycle's close (for
 * the window start) in a single ordered query.
 *
 *   period=current  → cycle at index 0 (latest by cycleCloseDate DESC)
 *   period=previous → cycle at index 1
 *   period=N        → cycle at index N
 *
 * Window bounds:
 *   end   = target.cycleCloseDate (inclusive)
 *   start = (prev.cycleCloseDate + 1 day) if a previous cycle exists,
 *           else target.cycleCloseDate − 30 days (estimate — same
 *           fallback as the detail GET's currentCycleStart).
 */
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, creditCards, creditCardCycles, transactions } from "@/lib/db/schema";
import { cycleQuerySchema } from "@/lib/validations/credit-card";
import { ok, fail, zodFail, requireUser } from "@/lib/api";
import type { CreditCardCycleDTO, TransactionListItem } from "@/types";

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

  // Pull offset+2 rows so we always have both the target and its
  // immediately-older sibling (used to compute the window start).
  const cycleRows = await db
    .select({
      cycleCloseDate: creditCardCycles.cycleCloseDate,
    })
    .from(creditCardCycles)
    .where(eq(creditCardCycles.cardId, card.id))
    .orderBy(desc(creditCardCycles.cycleCloseDate), desc(creditCardCycles.createdAt))
    .limit(offset + 2);

  if (cycleRows.length <= offset) {
    return fail(404, `No cycle at offset ${offset} for this card.`);
  }

  const target = cycleRows[offset];
  const prev = cycleRows[offset + 1] ?? null;

  const endUtc = new Date(`${target.cycleCloseDate}T23:59:59.999Z`);
  const startUtc = prev
    ? (() => {
        const d = new Date(`${prev.cycleCloseDate}T00:00:00.000Z`);
        d.setUTCDate(d.getUTCDate() + 1);
        return d;
      })()
    : (() => {
        const d = new Date(`${target.cycleCloseDate}T00:00:00.000Z`);
        d.setUTCDate(d.getUTCDate() - 30);
        return d;
      })();

  // transactions.date is stored as a civil date (YYYY-MM-DD) — compare
  // against civil-extracted strings, same pattern as the rest of the app.
  const startCivil = startUtc.toISOString().slice(0, 10);
  const endCivil = endUtc.toISOString().slice(0, 10);

  const baseFilters = [
    eq(transactions.userId, auth.userId),
    eq(transactions.creditCardId, card.id),
    gte(transactions.date, startCivil),
    lte(transactions.date, endCivil),
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

  // Transactions in the window, newest first. Select shape matches
  // TransactionListItem so the shared TransactionTable can render these
  // rows without any adapter layer.
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
    .where(and(...baseFilters))
    .orderBy(desc(transactions.date));

  const txItems: TransactionListItem[] = rows.map((r) => ({
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
    createdAt: r.createdAt.toISOString(),
  }));

  return ok({
    card: {
      id: card.id,
      name: card.name,
      issuer: card.issuer,
      last4: card.last4,
      creditLimit: Number(card.creditLimit),
    },
    offset,
    start: startUtc.toISOString(),
    end: endUtc.toISOString(),
    totalExpense: Number(totals?.totalExpense ?? 0),
    totalPayments: Number(totals?.totalPayments ?? 0),
    count: Number(totals?.count ?? 0),
    categoryBreakdown: breakdown.map((b) => ({
      categoryId: b.categoryId,
      name: b.name,
      icon: b.icon,
      color: b.color,
      total: Number(b.total),
      count: Number(b.count),
    })),
    transactions: txItems,
  } satisfies CreditCardCycleDTO);
}
