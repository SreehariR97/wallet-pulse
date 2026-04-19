import { randomUUID } from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { creditCards, creditCardCycles, transactions } from "@/lib/db/schema";
import { creditCardUpdateSchema } from "@/lib/validations/credit-card";
import { ok, fail, zodFail, requireUser } from "@/lib/api";
import { getStatementCycle, getNextDueDate } from "@/lib/credit-cards";
import type {
  CreditCardDTO,
  CreditCardDetailDTO,
  ArchivedIdDTO,
  HardDeletedIdDTO,
} from "@/types";

type CreditCardPatch = Partial<
  Omit<typeof creditCards.$inferInsert, "id" | "userId" | "createdAt" | "updatedAt">
>;

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

async function loadOwned(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(creditCards)
    .where(and(eq(creditCards.id, id), eq(creditCards.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const card = await loadOwned(auth.userId, params.id);
  if (!card) return fail(404, "Card not found");

  const [agg] = await db
    .select({
      totalExpense: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount} ELSE 0 END), 0)`,
      totalPayments: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'transfer' THEN ${transactions.amount} ELSE 0 END), 0)`,
    })
    .from(transactions)
    .where(and(eq(transactions.userId, auth.userId), eq(transactions.creditCardId, card.id)));

  const totalExpense = Number(agg?.totalExpense ?? 0);
  const totalPayments = Number(agg?.totalPayments ?? 0);
  const balance = totalExpense - totalPayments;
  const creditLimit = Number(card.creditLimit);
  const utilizationPercent = creditLimit > 0 ? (balance / creditLimit) * 100 : 0;

  const now = new Date();
  const currentCycle = getStatementCycle(now, card.statementDay, 0);
  const nextDueDate = getNextDueDate(now, card.paymentDueDay);

  return ok({
    ...toCreditCardDTO(card),
    balance,
    utilizationPercent,
    totalExpense,
    totalPayments,
    currentCycleStart: currentCycle.start.toISOString(),
    currentCycleEnd: currentCycle.end.toISOString(),
    nextDueDate: nextDueDate.toISOString(),
    minPaymentEstimate: Math.max(0, balance) * (card.minimumPaymentPercent / 100),
  } satisfies CreditCardDetailDTO);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const existing = await loadOwned(auth.userId, params.id);
  if (!existing) return fail(404, "Card not found");

  const body = await req.json().catch(() => null);
  const parsed = creditCardUpdateSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);
  const p = parsed.data;

  // Schema's refine guarantees lastStatementCloseDate and paymentDueDate are
  // paired (both present or both absent). When present, derive the integer
  // day-of-month so the legacy credit_cards.statement_day / payment_due_day
  // columns stay in sync (dropped in Phase 5). When absent, skip the cycle
  // upsert entirely and do a single card UPDATE — no atomic wrapper needed.
  const hasDates =
    p.lastStatementCloseDate !== undefined && p.paymentDueDate !== undefined;
  const hasBalance = p.statementBalance !== undefined;
  const hasMinPayment = p.minimumPayment !== undefined;

  const patch: CreditCardPatch = {
    ...(p.name !== undefined ? { name: p.name } : {}),
    ...(p.issuer !== undefined ? { issuer: p.issuer } : {}),
    ...(p.last4 !== undefined ? { last4: p.last4 } : {}),
    ...(p.creditLimit !== undefined ? { creditLimit: String(p.creditLimit) } : {}),
    ...(hasDates
      ? {
          statementDay: Number(p.lastStatementCloseDate!.slice(8, 10)),
          paymentDueDay: Number(p.paymentDueDate!.slice(8, 10)),
        }
      : {}),
    ...(p.minimumPaymentPercent !== undefined
      ? { minimumPaymentPercent: p.minimumPaymentPercent }
      : {}),
    ...(p.isActive !== undefined ? { isActive: p.isActive } : {}),
    ...(p.sortOrder !== undefined ? { sortOrder: p.sortOrder } : {}),
  };

  if (!hasDates) {
    // No cycle change — single-statement UPDATE, no dispatch.
    const [row] = await db
      .update(creditCards)
      .set(patch)
      .where(and(eq(creditCards.id, existing.id), eq(creditCards.userId, auth.userId)))
      .returning();
    return ok(toCreditCardDTO(row) satisfies CreditCardDTO);
  }

  // Read-before-write: find the most recent cycle to decide update-in-place
  // (projected) vs insert-new (real). Secondary sort on created_at breaks
  // close-date ties deterministically (possible after a real→projected
  // ping-pong in Phase 3).
  const [latestCycle] = await db
    .select({ id: creditCardCycles.id, isProjected: creditCardCycles.isProjected })
    .from(creditCardCycles)
    .where(eq(creditCardCycles.cardId, existing.id))
    .orderBy(desc(creditCardCycles.cycleCloseDate), desc(creditCardCycles.createdAt))
    .limit(1);

  const updateCycleInPlace = latestCycle && latestCycle.isProjected;
  const cycleId = updateCycleInPlace ? latestCycle.id : randomUUID();
  const cycleCloseDate = p.lastStatementCloseDate!;
  const paymentDueDate = p.paymentDueDate!;
  const statementBalanceVal = hasBalance ? String(p.statementBalance) : null;
  const minimumPaymentVal = hasMinPayment ? String(p.minimumPayment) : null;
  const isProjected = !(hasBalance && hasMinPayment);

  try {
    // Atomic pair: card UPDATE + cycle UPDATE/INSERT. Dispatch per CLAUDE.md.
    let row: typeof creditCards.$inferSelect;
    const maybeBatch = db as { batch?: unknown };
    if (typeof maybeBatch.batch === "function") {
      const neonDb = db as NeonHttpDatabase<typeof schema>;
      const cardUpdate = neonDb
        .update(creditCards)
        .set(patch)
        .where(and(eq(creditCards.id, existing.id), eq(creditCards.userId, auth.userId)))
        .returning();
      const cycleWrite = updateCycleInPlace
        ? neonDb
            .update(creditCardCycles)
            .set({
              cycleCloseDate,
              paymentDueDate,
              statementBalance: statementBalanceVal,
              minimumPayment: minimumPaymentVal,
              isProjected,
              // credit_card_cycles didn't exist when the 0004 updated_at
              // trigger was created, so set explicitly here. Consolidate in
              // Phase 5.
              updatedAt: sql`now()`,
            })
            .where(eq(creditCardCycles.id, latestCycle!.id))
        : neonDb.insert(creditCardCycles).values({
            id: cycleId,
            cardId: existing.id,
            userId: auth.userId,
            cycleCloseDate,
            paymentDueDate,
            statementBalance: statementBalanceVal,
            minimumPayment: minimumPaymentVal,
            isProjected,
          });
      const [cardRows] = await neonDb.batch([cardUpdate, cycleWrite]);
      row = cardRows[0];
    } else {
      const result = await db.transaction(async (trx) => {
        const [cardRow] = await trx
          .update(creditCards)
          .set(patch)
          .where(and(eq(creditCards.id, existing.id), eq(creditCards.userId, auth.userId)))
          .returning();
        if (updateCycleInPlace) {
          await trx
            .update(creditCardCycles)
            .set({
              cycleCloseDate,
              paymentDueDate,
              statementBalance: statementBalanceVal,
              minimumPayment: minimumPaymentVal,
              isProjected,
              updatedAt: sql`now()`,
            })
            .where(eq(creditCardCycles.id, latestCycle!.id));
        } else {
          await trx.insert(creditCardCycles).values({
            id: cycleId,
            cardId: existing.id,
            userId: auth.userId,
            cycleCloseDate,
            paymentDueDate,
            statementBalance: statementBalanceVal,
            minimumPayment: minimumPaymentVal,
            isProjected,
          });
        }
        return cardRow;
      });
      row = result;
    }
    return ok(toCreditCardDTO(row) satisfies CreditCardDTO);
  } catch (err) {
    console.error("[PATCH /api/credit-cards/:id] update failed", {
      userId: auth.userId,
      cardId: existing.id,
      payload: {
        updateCycleInPlace,
        cycleId,
        lastStatementCloseDate: cycleCloseDate,
        paymentDueDate,
        hasBalance,
        hasMinPayment,
      },
      error:
        err instanceof Error
          ? { name: err.name, message: err.message, stack: err.stack }
          : err,
    });
    const message = err instanceof Error ? err.message : "Internal server error";
    return fail(500, `Credit card update failed: ${message}`);
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const existing = await loadOwned(auth.userId, params.id);
  if (!existing) return fail(404, "Card not found");

  const url = new URL(req.url);
  const hard = url.searchParams.get("hard") === "1";

  if (!hard) {
    // Default: archive. Hides from pickers; existing transactions keep the FK.
    await db
      .update(creditCards)
      .set({ isActive: false })
      .where(and(eq(creditCards.id, existing.id), eq(creditCards.userId, auth.userId)));
    return ok({ id: existing.id, archived: true } satisfies ArchivedIdDTO);
  }

  // Hard delete: only if no transactions reference the card. This keeps
  // history intact even when the user "wants it gone" — they must first
  // re-home or delete those transactions.
  const [cnt] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(transactions)
    .where(and(eq(transactions.userId, auth.userId), eq(transactions.creditCardId, existing.id)));
  if (Number(cnt?.count ?? 0) > 0) {
    return fail(
      409,
      "Card has transactions — archive it, or delete/reassign the transactions first.",
    );
  }

  await db
    .delete(creditCards)
    .where(and(eq(creditCards.id, existing.id), eq(creditCards.userId, auth.userId)));
  return ok({ id: existing.id, deleted: true } satisfies HardDeletedIdDTO);
}
