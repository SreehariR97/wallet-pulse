/**
 * Cycle allocation DB layer.
 *
 * Allocation rule: see `allocateCycleForPayment` in `credit-cards.ts`. The
 * pure `computeCycleAmountsPaid` below is the reference implementation;
 * `reallocateCardCycles` is the same rule as one SQL UPDATE, which is what
 * every write path persists with (a test pins the two together).
 *
 * Why SQL instead of read-compute-write in JS: two concurrent payments that
 * each read a snapshot, add their own amount and write back would lose one
 * update. Every writer instead runs, in one atomic batch/transaction:
 *
 *   lockCard → (its own writes) → reallocateCardCycles
 *
 * The lock serializes writers per card, and because Postgres takes a fresh
 * snapshot per statement under READ COMMITTED, the UPDATE that runs after
 * the lock sees every payment committed before it.
 */
import { and, eq, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { creditCards, creditCardCycles } from "@/lib/db/schema";
import { allocateCycleForPayment } from "@/lib/credit-cards";
import { db as defaultDb } from "@/lib/db";

type DB = typeof defaultDb;
/** A db handle or an open transaction — anything that builds pg queries. */
export type QueryBuilder = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Cycle rows ordered ASC by close date — allocation relies on that order. */
export interface CycleSlim {
  id: string;
  cycleCloseDate: string;
  paymentDueDate: string;
}

export interface PaymentSlim {
  /** YYYY-MM-DD */
  date: string;
  /** Positive. A payment reduces the balance. */
  amount: number;
}

/**
 * Pure: returns a map `cycleId → total allocated`, plus count of payments
 * that didn't fall in any cycle. Every cycle in `cycles` appears in the
 * returned map (0 if no payments land in it) so callers don't have to
 * distinguish "not present" from "0" downstream.
 */
export function computeCycleAmountsPaid(
  cycles: CycleSlim[],
  payments: PaymentSlim[],
): { perCycle: Map<string, number>; unallocated: number } {
  const perCycle = new Map<string, number>();
  for (const c of cycles) perCycle.set(c.id, 0);
  let unallocated = 0;
  for (const p of payments) {
    const cycleId = allocateCycleForPayment(cycles, p.date);
    if (cycleId === null) {
      unallocated += 1;
      continue;
    }
    perCycle.set(cycleId, (perCycle.get(cycleId) ?? 0) + p.amount);
  }
  return { perCycle, unallocated };
}

/**
 * `SELECT ... FOR UPDATE` on the card row. Put it first in any atomic unit
 * that writes payments or cycles for the card.
 */
export function lockCard(q: QueryBuilder, cardId: string) {
  return q.select({ id: creditCards.id }).from(creditCards).where(eq(creditCards.id, cardId)).for("update");
}

/**
 * Re-derive amount_paid for every cycle of the card from its transfer
 * transactions, in one statement. SQL port of `allocateCycleForPayment`: a
 * payment on date D counts toward cycle c when D is in (c.close, c.due] and
 * no earlier-closing cycle of the card also contains D. Rows whose total is
 * already right are left untouched.
 */
export function reallocateCardCycles(q: QueryBuilder, userId: string, cardId: string) {
  const allocated = sql`COALESCE((
    SELECT SUM(t.amount) FROM transactions t
    WHERE t.user_id = credit_card_cycles.user_id
      AND t.credit_card_id = credit_card_cycles.card_id
      AND t.type = 'transfer'
      AND t.date > credit_card_cycles.cycle_close_date
      AND t.date <= credit_card_cycles.payment_due_date
      AND NOT EXISTS (
        SELECT 1 FROM credit_card_cycles c2
        WHERE c2.card_id = credit_card_cycles.card_id
          AND c2.cycle_close_date < credit_card_cycles.cycle_close_date
          AND t.date > c2.cycle_close_date
          AND t.date <= c2.payment_due_date
      )
  ), 0)`;
  return q
    .update(creditCardCycles)
    .set({ amountPaid: allocated, updatedAt: sql`now()` })
    .where(
      and(
        eq(creditCardCycles.cardId, cardId),
        eq(creditCardCycles.userId, userId),
        sql`${creditCardCycles.amountPaid} IS DISTINCT FROM ${allocated}`,
      ),
    );
}

/**
 * Self-healing full recompute of a card's amount_paid totals. Call after
 * any write that could affect allocation (editing, inserting or deleting a
 * transfer on the card) that isn't already part of an atomic unit ending
 * in `reallocateCardCycles`.
 */
export async function recomputeCardCycleAllocations(
  db: DB,
  userId: string,
  cardId: string,
): Promise<void> {
  const maybeBatch = db as { batch?: unknown };
  if (typeof maybeBatch.batch === "function") {
    const neonDb = db as NeonHttpDatabase<typeof schema>;
    await neonDb.batch([lockCard(neonDb, cardId), reallocateCardCycles(neonDb, userId, cardId)]);
  } else {
    await db.transaction(async (trx) => {
      await lockCard(trx, cardId);
      await reallocateCardCycles(trx, userId, cardId);
    });
  }
}
