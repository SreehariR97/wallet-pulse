/**
 * Phase 4 — cycle allocation DB layer.
 *
 * Splits cleanly from `credit-cards.ts` (pure date math) so the pure side
 * stays DB-free and testable in isolation. This module owns:
 *   - Computing per-cycle amountPaid totals (pure helper).
 *   - Computing the minimal diff against the DB's current totals (pure).
 *   - Full recompute of a card's cycle rows from scratch (DB-touching).
 *
 * Allocation rule: see `allocateCycleForPayment` in `credit-cards.ts`. This
 * module is the single caller responsible for persisting the result.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "@/lib/db/schema";
import { creditCardCycles, transactions } from "@/lib/db/schema";
import { allocateCycleForPayment } from "@/lib/credit-cards";
import { db as defaultDb } from "@/lib/db";

type DB = typeof defaultDb;

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

export interface CycleAmountDiff {
  cycleId: string;
  /** New amountPaid total to persist, formatted as numeric(14,2) string. */
  newAmountStr: string;
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
 * Pure: compare computed totals against the current DB snapshot and return
 * a minimal diff list. Skips cycles where the delta is smaller than half a
 * cent — dodges floating-point noise on repeated recomputes.
 */
export function diffCycleAmounts(
  cycles: Array<CycleSlim & { amountPaid: number }>,
  perCycle: Map<string, number>,
): CycleAmountDiff[] {
  const diffs: CycleAmountDiff[] = [];
  for (const c of cycles) {
    const next = perCycle.get(c.id) ?? 0;
    if (Math.abs(next - c.amountPaid) < 0.005) continue;
    diffs.push({ cycleId: c.id, newAmountStr: next.toFixed(2) });
  }
  return diffs;
}

/**
 * Fetch this card's cycles (ASC by close) + all card-scoped transfer
 * transactions for the user. Used by both the recompute path and the pay
 * route — the pay route synthesizes its about-to-insert payment on top.
 */
export async function loadAllocationState(
  db: DB,
  userId: string,
  cardId: string,
): Promise<{
  cycles: Array<CycleSlim & { amountPaid: number }>;
  payments: PaymentSlim[];
}> {
  const [cycleRows, paymentRows] = await Promise.all([
    db
      .select({
        id: creditCardCycles.id,
        cycleCloseDate: creditCardCycles.cycleCloseDate,
        paymentDueDate: creditCardCycles.paymentDueDate,
        amountPaid: creditCardCycles.amountPaid,
      })
      .from(creditCardCycles)
      .where(
        and(
          eq(creditCardCycles.cardId, cardId),
          eq(creditCardCycles.userId, userId),
        ),
      )
      .orderBy(asc(creditCardCycles.cycleCloseDate)),
    db
      .select({
        date: transactions.date,
        amount: transactions.amount,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.creditCardId, cardId),
          eq(transactions.type, "transfer"),
        ),
      ),
  ]);

  return {
    cycles: cycleRows.map((r) => ({
      id: r.id,
      cycleCloseDate: r.cycleCloseDate,
      paymentDueDate: r.paymentDueDate,
      amountPaid: Number(r.amountPaid),
    })),
    payments: paymentRows.map((r) => ({
      date: r.date,
      amount: Number(r.amount),
    })),
  };
}

/**
 * Full recompute: re-derive amountPaid for every cycle of `cardId` from
 * existing transfer transactions, and persist. Atomic via the
 * batch / transaction dispatch (CLAUDE.md convention). A no-op if nothing
 * changed.
 *
 * Call this after any write that could affect allocation:
 *   - Editing a transfer tx (date / amount / creditCardId change).
 *   - Deleting a transfer tx.
 *   - Inserting a transfer tx via the generic /api/transactions POST.
 *
 * The pay route does NOT call this — it composes its own atomic batch
 * that includes both the INSERT and the per-cycle updates together, so
 * the post-state is visible in one round-trip.
 */
export async function recomputeCardCycleAllocations(
  db: DB,
  userId: string,
  cardId: string,
): Promise<void> {
  const { cycles, payments } = await loadAllocationState(db, userId, cardId);
  if (cycles.length === 0) return;
  const { perCycle, unallocated } = computeCycleAmountsPaid(cycles, payments);
  const diffs = diffCycleAmounts(cycles, perCycle);

  if (diffs.length === 0) {
    if (unallocated > 0) warnUnallocated(userId, cardId, unallocated);
    return;
  }

  const maybeBatch = db as { batch?: unknown };
  if (typeof maybeBatch.batch === "function") {
    const neonDb = db as NeonHttpDatabase<typeof schema>;
    const queries = diffs.map((d) =>
      neonDb
        .update(creditCardCycles)
        .set({ amountPaid: d.newAmountStr, updatedAt: sql`now()` })
        .where(eq(creditCardCycles.id, d.cycleId)),
    );
    await neonDb.batch(queries as [(typeof queries)[number], ...typeof queries]);
  } else {
    await db.transaction(async (trx) => {
      for (const d of diffs) {
        await trx
          .update(creditCardCycles)
          .set({ amountPaid: d.newAmountStr, updatedAt: sql`now()` })
          .where(eq(creditCardCycles.id, d.cycleId));
      }
    });
  }

  if (unallocated > 0) warnUnallocated(userId, cardId, unallocated);
}

function warnUnallocated(userId: string, cardId: string, unallocated: number) {
  console.warn("[recomputeCardCycleAllocations] payments not allocated", {
    userId,
    cardId,
    unallocated,
  });
}
