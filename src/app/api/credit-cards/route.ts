import { randomUUID } from "crypto";
import { and, asc, eq, gte, inArray, lte, lt, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { creditCards, creditCardCycles, transactions } from "@/lib/db/schema";
import { creditCardCreateSchema } from "@/lib/validations/credit-card";
import { ok, fail, zodFail, requireUser } from "@/lib/api";
import { getStatementCycle, getNextDueDate } from "@/lib/credit-cards";
import type { CreditCardDTO, CreditCardListItemDTO } from "@/types";

function todayCivil(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

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
  const today = todayCivil();

  // Phase 4: fetch past-due cycles for this user in ONE query and group by
  // card. Past-due = non-projected, due date passed, outstanding balance
  // (statementBalance IS NOT NULL AND amountPaid < statementBalance).
  // Scoping on userId + active cards means we never leak cross-tenant rows.
  const cardIds = cards.map((c) => c.id);
  const pastDueRows = await db
    .select({ cardId: creditCardCycles.cardId })
    .from(creditCardCycles)
    .where(
      and(
        eq(creditCardCycles.userId, auth.userId),
        inArray(creditCardCycles.cardId, cardIds),
        eq(creditCardCycles.isProjected, false),
        lt(creditCardCycles.paymentDueDate, today),
        sql`${creditCardCycles.statementBalance} IS NOT NULL`,
        sql`${creditCardCycles.amountPaid} < ${creditCardCycles.statementBalance}`,
      ),
    );
  const pastDueCardIds = new Set(pastDueRows.map((r) => r.cardId));

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
      hasPastDueCycle: pastDueCardIds.has(c.id),
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

  // Derive the day-of-month integers from the picked dates. Phase 2 keeps
  // credit_cards.statement_day / payment_due_day populated so the existing
  // GET handler and card-tile rendering (which still read integers) work
  // unchanged. Both columns are dropped in Phase 5.
  const statementDay = Number(c.lastStatementCloseDate.slice(8, 10));
  const paymentDueDay = Number(c.paymentDueDate.slice(8, 10));

  const cardId = randomUUID();
  const cycleId = randomUUID();
  const hasBalance = c.statementBalance !== undefined;
  const hasMinPayment = c.minimumPayment !== undefined;

  const cardValues = {
    id: cardId,
    userId: auth.userId,
    name: c.name,
    issuer: c.issuer,
    last4: c.last4 ?? null,
    creditLimit: String(c.creditLimit),
    statementDay,
    paymentDueDay,
    minimumPaymentPercent: c.minimumPaymentPercent,
    sortOrder: c.sortOrder,
  };
  const cycleValues = {
    id: cycleId,
    cardId,
    userId: auth.userId,
    cycleCloseDate: c.lastStatementCloseDate,
    paymentDueDate: c.paymentDueDate,
    statementBalance: hasBalance ? String(c.statementBalance) : null,
    minimumPayment: hasMinPayment ? String(c.minimumPayment) : null,
    // Real cycle only when BOTH balance fields are present — otherwise it's
    // still a projected framework.
    isProjected: !(hasBalance && hasMinPayment),
  };

  try {
    // neon-http doesn't support db.transaction; use batch (atomic server-side
    // via Neon's implicit transaction). pg supports both — keep transaction
    // for local dev / self-host. See CLAUDE.md "atomic multi-statement writes".
    let row: typeof creditCards.$inferSelect;
    const maybeBatch = db as { batch?: unknown };
    if (typeof maybeBatch.batch === "function") {
      const neonDb = db as NeonHttpDatabase<typeof schema>;
      const [cardRows] = await neonDb.batch([
        neonDb.insert(creditCards).values(cardValues).returning(),
        neonDb.insert(creditCardCycles).values(cycleValues),
      ]);
      row = cardRows[0];
    } else {
      const result = await db.transaction(async (trx) => {
        const [cardRow] = await trx.insert(creditCards).values(cardValues).returning();
        await trx.insert(creditCardCycles).values(cycleValues);
        return cardRow;
      });
      row = result;
    }
    return ok(toCreditCardDTO(row) satisfies CreditCardDTO, { created: true });
  } catch (err) {
    console.error("[POST /api/credit-cards] insert failed", {
      userId: auth.userId,
      payload: {
        cardId,
        cycleId,
        name: c.name,
        issuer: c.issuer,
        lastStatementCloseDate: c.lastStatementCloseDate,
        paymentDueDate: c.paymentDueDate,
        hasBalance,
        hasMinPayment,
      },
      error:
        err instanceof Error
          ? { name: err.name, message: err.message, stack: err.stack }
          : err,
    });
    const message = err instanceof Error ? err.message : "Internal server error";
    return fail(500, `Credit card insert failed: ${message}`);
  }
}
