/**
 * PATCH /api/credit-cards/:id/cycles/:cycleId — "Mark statement issued":
 * promotes a projected cycle row into a locked/real one AND inserts the
 * next projected cycle so the detail view always has an upcoming row to
 * render, then re-allocates payments (the issued cycle's dates may have
 * moved). Atomic via the neon-batch / pg-transaction dispatch (CLAUDE.md
 * convention), behind a lock on the card row.
 *
 * Invariants:
 *  - Cycle must be owned by the authed user AND match the :id card
 *    (belt-and-suspenders — neither alone is sufficient: cross-tenant
 *    cycleId from a cross-tenant card must 404, not 403, to avoid leaking
 *    ids).
 *  - Cycle must be isProjected=true. Real/locked cycles are historical
 *    artifacts; a future "correct this statement" flow (Phase 5 territory)
 *    will handle edits.
 *  - A double-submit can't create two projected cycles: the second request
 *    waits on the card lock, its UPDATE (guarded by is_projected) matches
 *    nothing, and its INSERT hits the one-projected-cycle-per-card unique
 *    index, so it rolls back and returns 409.
 */
import { randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { creditCards, creditCardCycles } from "@/lib/db/schema";
import { markStatementIssuedSchema } from "@/lib/validations/credit-card";
import { ok, fail, zodFail, requireUser, isUniqueViolation } from "@/lib/api";
import { nextProjectedCycleDates } from "@/lib/credit-cards";
import { lockCard, reallocateCardCycles } from "@/lib/credit-card-allocation";
import type { CreditCardCycleRecordDTO } from "@/types";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string; cycleId: string } },
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = markStatementIssuedSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);
  const p = parsed.data;

  // Load cycle + ownership in one query. We hit credit_cards via FK to
  // confirm the card belongs to the user AND the URL :id matches.
  const [existing] = await db
    .select({
      id: creditCardCycles.id,
      cardId: creditCardCycles.cardId,
      isProjected: creditCardCycles.isProjected,
    })
    .from(creditCardCycles)
    .innerJoin(creditCards, eq(creditCardCycles.cardId, creditCards.id))
    .where(
      and(
        eq(creditCardCycles.id, params.cycleId),
        eq(creditCardCycles.cardId, params.id),
        eq(creditCards.userId, auth.userId),
      ),
    )
    .limit(1);
  if (!existing) return fail(404, "Cycle not found");

  if (!existing.isProjected) {
    return fail(
      403,
      "Real/locked cycles can't be re-issued — only projected cycles can be marked as issued.",
    );
  }

  // The NEXT projected cycle: close +30 days, same grace period.
  const nextCycleValues = {
    id: randomUUID(),
    cardId: existing.cardId,
    userId: auth.userId,
    ...nextProjectedCycleDates(p.cycleCloseDate, p.paymentDueDate),
    statementBalance: null,
    minimumPayment: null,
    isProjected: true,
  };

  const issuedUpdates = {
    cycleCloseDate: p.cycleCloseDate,
    paymentDueDate: p.paymentDueDate,
    statementBalance: String(p.statementBalance),
    minimumPayment: String(p.minimumPayment),
    isProjected: false,
    // credit_card_cycles predates the 0004 updated_at trigger; set
    // explicitly (Phase 5 will consolidate the triggers).
    updatedAt: sql`now()`,
  };

  const stillProjected = and(
    eq(creditCardCycles.id, existing.id),
    eq(creditCardCycles.isProjected, true),
  );

  try {
    // Atomic: lock card, flip the projected row to real, insert the next
    // projected row, re-allocate payments across the new dates.
    let issuedRow: typeof creditCardCycles.$inferSelect | undefined;
    const maybeBatch = db as { batch?: unknown };
    if (typeof maybeBatch.batch === "function") {
      const neonDb = db as NeonHttpDatabase<typeof schema>;
      const [, issuedRows] = await neonDb.batch([
        lockCard(neonDb, existing.cardId),
        neonDb.update(creditCardCycles).set(issuedUpdates).where(stillProjected).returning(),
        neonDb.insert(creditCardCycles).values(nextCycleValues),
        reallocateCardCycles(neonDb, auth.userId, existing.cardId),
      ]);
      issuedRow = issuedRows[0];
    } else {
      issuedRow = await db.transaction(async (trx) => {
        await lockCard(trx, existing.cardId);
        const [row] = await trx
          .update(creditCardCycles)
          .set(issuedUpdates)
          .where(stillProjected)
          .returning();
        if (!row) return undefined;
        await trx.insert(creditCardCycles).values(nextCycleValues);
        await reallocateCardCycles(trx, auth.userId, existing.cardId);
        return row;
      });
    }
    if (!issuedRow) return alreadyIssued();

    // amount_paid on the returned row predates the re-allocation.
    const [fresh] = await db
      .select({ amountPaid: creditCardCycles.amountPaid })
      .from(creditCardCycles)
      .where(eq(creditCardCycles.id, issuedRow.id));
    issuedRow = { ...issuedRow, amountPaid: fresh?.amountPaid ?? issuedRow.amountPaid };

    return ok({
      id: issuedRow.id,
      cardId: issuedRow.cardId,
      cycleCloseDate: issuedRow.cycleCloseDate,
      paymentDueDate: issuedRow.paymentDueDate,
      statementBalance:
        issuedRow.statementBalance === null ? null : Number(issuedRow.statementBalance),
      minimumPayment:
        issuedRow.minimumPayment === null ? null : Number(issuedRow.minimumPayment),
      amountPaid: Number(issuedRow.amountPaid),
      isProjected: issuedRow.isProjected,
      createdAt: issuedRow.createdAt.toISOString(),
      updatedAt: issuedRow.updatedAt.toISOString(),
    } satisfies CreditCardCycleRecordDTO);
  } catch (err) {
    if (isUniqueViolation(err)) return alreadyIssued();
    console.error("[PATCH /api/credit-cards/:id/cycles/:cycleId] failed", {
      userId: auth.userId,
      cardId: existing.cardId,
      cycleId: existing.id,
      payload: p,
      error:
        err instanceof Error
          ? { name: err.name, message: err.message, stack: err.stack }
          : err,
    });
    // Details are in the server log above; driver/constraint text stays
    // out of the response.
    return fail(500, "Cycle update failed. Please try again.");
  }
}

function alreadyIssued() {
  return fail(409, "This statement was already marked as issued. Refresh to see the latest cycle.");
}
