/**
 * POST /api/credit-cards/[id]/pay
 *
 * Shortcut to record a card repayment. Creates a transfer transaction
 * attached to the "Credit Card Payment" category, with creditCardId set to
 * this card. Amount positive; reduces the card's computed balance.
 *
 * Phase 4: the insert is batched atomically with per-cycle amountPaid
 * updates. We load the card's existing cycles + payments, synthesize the
 * about-to-insert payment on top, re-compute the minimal diff, and
 * dispatch [INSERT, ...UPDATEs] as a single atomic unit (batch on Neon,
 * transaction on pg). Card ownership is re-verified here — do not rely on
 * the FK to gate access.
 */
import { randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  categories,
  creditCards,
  creditCardCycles,
  transactions,
} from "@/lib/db/schema";
import { creditCardPaySchema } from "@/lib/validations/credit-card";
import { TRANSFER_CATEGORY_NAMES } from "@/lib/db/defaults";
import { ok, fail, zodFail, requireUser } from "@/lib/api";
import {
  computeCycleAmountsPaid,
  diffCycleAmounts,
  loadAllocationState,
} from "@/lib/credit-card-allocation";
import type { TransactionDTO } from "@/types";

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

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const [card] = await db
    .select()
    .from(creditCards)
    .where(and(eq(creditCards.id, params.id), eq(creditCards.userId, auth.userId)))
    .limit(1);
  if (!card) return fail(404, "Card not found");

  const body = await req.json().catch(() => null);
  const parsed = creditCardPaySchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);
  const p = parsed.data;

  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.userId, auth.userId),
        eq(categories.name, TRANSFER_CATEGORY_NAMES.creditCardPayment),
      ),
    )
    .limit(1);
  if (!cat) {
    return fail(
      409,
      "Missing 'Credit Card Payment' category. Run scripts/backfill-transfer-categories.ts.",
    );
  }

  // Load current allocation state and synthesize the new payment on top.
  // Re-derive amountPaid per cycle from the FULL payment list so we stay
  // self-healing: if a prior write somehow diverged, this sweep corrects it.
  const { cycles, payments } = await loadAllocationState(db, auth.userId, card.id);
  const { perCycle } = computeCycleAmountsPaid(cycles, [
    ...payments,
    { date: p.date, amount: p.amount },
  ]);
  const diffs = diffCycleAmounts(cycles, perCycle);

  const id = randomUUID();
  const insertValues = {
    id,
    userId: auth.userId,
    categoryId: cat.id,
    type: "transfer" as const,
    amount: String(p.amount),
    currency: auth.user.currency ?? "USD",
    description: `Payment to ${card.name}`,
    notes: p.notes ?? null,
    date: p.date,
    paymentMethod: "bank_transfer" as const,
    creditCardId: card.id,
  };

  try {
    let row: typeof transactions.$inferSelect;
    const maybeBatch = db as { batch?: unknown };
    if (typeof maybeBatch.batch === "function") {
      const neonDb = db as NeonHttpDatabase<typeof schema>;
      const queries = [
        neonDb.insert(transactions).values(insertValues).returning(),
        ...diffs.map((d) =>
          neonDb
            .update(creditCardCycles)
            .set({ amountPaid: d.newAmountStr, updatedAt: sql`now()` })
            .where(eq(creditCardCycles.id, d.cycleId)),
        ),
      ];
      const results = await neonDb.batch(
        queries as [(typeof queries)[number], ...typeof queries],
      );
      row = (results[0] as (typeof transactions.$inferSelect)[])[0];
    } else {
      row = await db.transaction(async (trx) => {
        const [inserted] = await trx
          .insert(transactions)
          .values(insertValues)
          .returning();
        for (const d of diffs) {
          await trx
            .update(creditCardCycles)
            .set({ amountPaid: d.newAmountStr, updatedAt: sql`now()` })
            .where(eq(creditCardCycles.id, d.cycleId));
        }
        return inserted;
      });
    }
    return ok(toTransactionDTO(row) satisfies TransactionDTO, { created: true });
  } catch (err) {
    console.error("[POST /api/credit-cards/:id/pay] failed", {
      userId: auth.userId,
      cardId: card.id,
      payload: { amount: p.amount, date: p.date },
      cycleUpdates: diffs.length,
      error:
        err instanceof Error
          ? { name: err.name, message: err.message, stack: err.stack }
          : err,
    });
    const message = err instanceof Error ? err.message : "Internal server error";
    return fail(500, `Payment recording failed: ${message}`);
  }
}
