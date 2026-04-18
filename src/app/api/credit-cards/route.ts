import { randomUUID } from "crypto";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { creditCards, transactions } from "@/lib/db/schema";
import { creditCardCreateSchema } from "@/lib/validations/credit-card";
import { ok, zodFail, requireUser } from "@/lib/api";
import { getStatementCycle, getNextDueDate } from "@/lib/credit-cards";
import type { CreditCardDTO, CreditCardListItemDTO } from "@/types";

function toCreditCardDTO(c: typeof creditCards.$inferSelect): CreditCardDTO {
  return {
    id: c.id,
    userId: c.userId,
    name: c.name,
    issuer: c.issuer,
    last4: c.last4,
    creditLimit: Number(c.creditLimit),
    statementDay: c.statementDay,
    paymentDueDay: c.paymentDueDay,
    minimumPaymentPercent: c.minimumPaymentPercent,
    isActive: c.isActive,
    sortOrder: c.sortOrder,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const includeArchived = url.searchParams.get("includeArchived") === "1";

  const filters = [eq(creditCards.userId, auth.userId)];
  if (!includeArchived) filters.push(eq(creditCards.isActive, true));

  const cards = await db
    .select()
    .from(creditCards)
    .where(and(...filters))
    .orderBy(asc(creditCards.sortOrder), asc(creditCards.name));

  if (cards.length === 0) return ok([]);

  // Balance (all-time) in one grouped query. Positive balance = owed.
  const balanceRows = await db
    .select({
      cardId: transactions.creditCardId,
      totalExpense: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount} ELSE 0 END), 0)`,
      totalPayments: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'transfer' THEN ${transactions.amount} ELSE 0 END), 0)`,
    })
    .from(transactions)
    .where(and(eq(transactions.userId, auth.userId), sql`${transactions.creditCardId} IS NOT NULL`))
    .groupBy(transactions.creditCardId);

  const balanceByCard = new Map<string, { totalExpense: number; totalPayments: number }>();
  for (const r of balanceRows) {
    if (r.cardId) {
      balanceByCard.set(r.cardId, {
        totalExpense: Number(r.totalExpense),
        totalPayments: Number(r.totalPayments),
      });
    }
  }

  const now = new Date();
  // Per-card cycle-spend aggregation in parallel. N cards → N queries; N is
  // small for real users (typically <10), and each hits the (user,card) index.
  const cycleWindows = cards.map((c) => getStatementCycle(now, c.statementDay, 0));
  const cycleSpendRows = await Promise.all(
    cards.map((c, i) => {
      const win = cycleWindows[i];
      return db
        .select({
          total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, auth.userId),
            eq(transactions.creditCardId, c.id),
            eq(transactions.type, "expense"),
            // Cycle boundaries are Dates constructed as midnight-UTC markers
            // (see lib/credit-cards.ts). `toISOString().slice(0,10)` extracts
            // the UTC civil day, which matches how transactions.date is stored.
            gte(transactions.date, win.start.toISOString().slice(0, 10)),
            lte(transactions.date, win.end.toISOString().slice(0, 10)),
          ),
        )
        .then((r) => Number(r[0]?.total ?? 0));
    }),
  );

  const enriched: CreditCardListItemDTO[] = cards.map((c, i) => {
    const b = balanceByCard.get(c.id) ?? { totalExpense: 0, totalPayments: 0 };
    const balance = b.totalExpense - b.totalPayments;
    const base = toCreditCardDTO(c);
    const utilizationPercent = base.creditLimit > 0 ? (balance / base.creditLimit) * 100 : 0;
    const win = cycleWindows[i];
    const nextDue = getNextDueDate(now, c.paymentDueDay);
    const minPaymentEstimate = Math.max(0, balance) * (c.minimumPaymentPercent / 100);
    return {
      ...base,
      balance,
      utilizationPercent,
      currentCycleStart: win.start.toISOString(),
      currentCycleEnd: win.end.toISOString(),
      cycleSpend: cycleSpendRows[i],
      nextDueDate: nextDue.toISOString(),
      minPaymentEstimate,
    };
  });

  return ok(enriched satisfies CreditCardListItemDTO[]);
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = creditCardCreateSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);
  const c = parsed.data;

  const id = randomUUID();
  const [row] = await db
    .insert(creditCards)
    .values({
      id,
      userId: auth.userId,
      name: c.name,
      issuer: c.issuer,
      last4: c.last4 ?? null,
      creditLimit: String(c.creditLimit),
      statementDay: c.statementDay,
      paymentDueDay: c.paymentDueDay,
      minimumPaymentPercent: c.minimumPaymentPercent,
      sortOrder: c.sortOrder,
    })
    .returning();
  return ok(toCreditCardDTO(row) satisfies CreditCardDTO, { created: true });
}
