import { randomUUID } from "crypto";
import { and, asc, desc, eq, gte, inArray, lte, lt, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { creditCards, creditCardCycles, transactions } from "@/lib/db/schema";
import { creditCardCreateSchema } from "@/lib/validations/credit-card";
import { ok, fail, zodFail, requireUser } from "@/lib/api";
import type { CreditCardDTO, CreditCardListItemDTO } from "@/types";

function toCreditCardDTO(c: typeof creditCards.$inferSelect): CreditCardDTO {
  return {
    id: c.id,
    userId: c.userId,
    name: c.name,
    issuer: c.issuer,
    last4: c.last4,
    creditLimit: Number(c.creditLimit),
    minimumPaymentPercent: c.minimumPaymentPercent,
    isActive: c.isActive,
    sortOrder: c.sortOrder,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function todayCivil(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
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

  const cardIds = cards.map((c) => c.id);
  const today = todayCivil();

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

  // Phase 5: fetch the most-recent cycle per card. N cards → N queries; N is
  // small for real users (typically <10). Cleaner than a DISTINCT ON across
  // drivers (pglite/neon/pg) and each hits the (card, cycle_close_date) index.
  // Secondary createdAt sort breaks close-date ties deterministically.
  const latestCycleByCard = new Map<
    string,
    {
      cycleCloseDate: string;
      paymentDueDate: string;
      isProjected: boolean;
      minimumPayment: number | null;
    }
  >();
  const latestCycleRows = await Promise.all(
    cards.map((c) =>
      db
        .select({
          cycleCloseDate: creditCardCycles.cycleCloseDate,
          paymentDueDate: creditCardCycles.paymentDueDate,
          isProjected: creditCardCycles.isProjected,
          minimumPayment: creditCardCycles.minimumPayment,
        })
        .from(creditCardCycles)
        .where(
          and(
            eq(creditCardCycles.cardId, c.id),
            eq(creditCardCycles.userId, auth.userId),
          ),
        )
        .orderBy(desc(creditCardCycles.cycleCloseDate), desc(creditCardCycles.createdAt))
        .limit(1),
    ),
  );
  cards.forEach((c, i) => {
    const [r] = latestCycleRows[i];
    if (!r) return;
    latestCycleByCard.set(c.id, {
      cycleCloseDate: r.cycleCloseDate,
      paymentDueDate: r.paymentDueDate,
      isProjected: r.isProjected,
      minimumPayment: r.minimumPayment === null ? null : Number(r.minimumPayment),
    });
  });

  // Past-due flags: non-projected cycles with due date passed AND balance
  // still outstanding. One query, grouped by card for the set lookup.
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
  // small for real users (typically <10). Cycle window is derived from the
  // latest cycle row: spends in (prevCycleClose, currentCycleClose].
  const cycleSpendRows = await Promise.all(
    cards.map(async (c) => {
      const latest = latestCycleByCard.get(c.id);
      if (!latest) return 0;

      // Find the cycle immediately preceding the latest one — its close
      // date + 1 is the current cycle's open. If there's no previous,
      // estimate with a 30-day window.
      const [prev] = await db
        .select({ cycleCloseDate: creditCardCycles.cycleCloseDate })
        .from(creditCardCycles)
        .where(
          and(
            eq(creditCardCycles.cardId, c.id),
            lt(creditCardCycles.cycleCloseDate, latest.cycleCloseDate),
          ),
        )
        .orderBy(desc(creditCardCycles.cycleCloseDate))
        .limit(1);

      let startCivil: string;
      if (prev) {
        const d = new Date(`${prev.cycleCloseDate}T00:00:00.000Z`);
        d.setUTCDate(d.getUTCDate() + 1);
        startCivil = d.toISOString().slice(0, 10);
      } else {
        const d = new Date(`${latest.cycleCloseDate}T00:00:00.000Z`);
        d.setUTCDate(d.getUTCDate() - 30);
        startCivil = d.toISOString().slice(0, 10);
      }

      const [r] = await db
        .select({ total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)` })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, auth.userId),
            eq(transactions.creditCardId, c.id),
            eq(transactions.type, "expense"),
            gte(transactions.date, startCivil),
            lte(transactions.date, latest.cycleCloseDate),
          ),
        );
      return Number(r?.total ?? 0);
    }),
  );

  const enriched: CreditCardListItemDTO[] = [];
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const latest = latestCycleByCard.get(c.id);
    if (!latest) {
      // Post-Phase-5 invariant: every card has at least one cycle row.
      // Log and skip so the list still renders for healthy cards.
      console.error("[GET /api/credit-cards] card missing cycle row", {
        userId: auth.userId,
        cardId: c.id,
      });
      continue;
    }
    const b = balanceByCard.get(c.id) ?? { totalExpense: 0, totalPayments: 0 };
    const balance = b.totalExpense - b.totalPayments;
    const base = toCreditCardDTO(c);
    const utilizationPercent = base.creditLimit > 0 ? (balance / base.creditLimit) * 100 : 0;
    const minPaymentEstimate =
      latest.minimumPayment !== null
        ? latest.minimumPayment
        : Math.max(0, balance) * (c.minimumPaymentPercent / 100);
    enriched.push({
      ...base,
      balance,
      utilizationPercent,
      cycleSpend: cycleSpendRows[i],
      minPaymentEstimate,
      currentCycleCloseDate: latest.cycleCloseDate,
      currentPaymentDueDate: latest.paymentDueDate,
      currentIsProjected: latest.isProjected,
      hasPastDueCycle: pastDueCardIds.has(c.id),
    });
  }

  return ok(enriched satisfies CreditCardListItemDTO[]);
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = creditCardCreateSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);
  const c = parsed.data;

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
