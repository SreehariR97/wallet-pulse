/**
 * PATCH /api/credit-cards/:id/cycles/:cycleId — "Mark statement issued":
 * promotes a projected cycle row into a locked/real one AND inserts the
 * next projected cycle so the detail view always has an upcoming row to
 * render. Two writes, atomic via the neon-batch / pg-transaction dispatch
 * (CLAUDE.md convention).
 *
 * Invariants:
 *  - Cycle must be owned by the authed user AND match the :id card
 *    (belt-and-suspenders — neither alone is sufficient: cross-tenant
 *    cycleId from a cross-tenant card must 404, not 403, to avoid leaking
 *    ids).
 *  - Cycle must be isProjected=true. Real/locked cycles are historical
 *    artifacts; a future "correct this statement" flow (Phase 5 territory)
 *    will handle edits.
 */
import { randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { creditCards, creditCardCycles } from "@/lib/db/schema";
import { markStatementIssuedSchema } from "@/lib/validations/credit-card";
import { ok, fail, zodFail, requireUser } from "@/lib/api";
import type { CreditCardCycleRowDTO } from "@/types";

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

  // Compute the NEXT projected cycle. Close +30 days, due +(grace) to
  // preserve whatever grace period the just-issued statement had.
  const gracePeriodDays = Math.round(
    (new Date(`${p.paymentDueDate}T00:00:00Z`).getTime() -
      new Date(`${p.cycleCloseDate}T00:00:00Z`).getTime()) /
      86400000,
  );
  const nextClose = new Date(`${p.cycleCloseDate}T00:00:00Z`);
  nextClose.setUTCDate(nextClose.getUTCDate() + 30);
  const nextDue = new Date(nextClose);
  nextDue.setUTCDate(nextDue.getUTCDate() + gracePeriodDays);
  const nextCycleValues = {
    id: randomUUID(),
    cardId: existing.cardId,
    userId: auth.userId,
    cycleCloseDate: nextClose.toISOString().slice(0, 10),
    paymentDueDate: nextDue.toISOString().slice(0, 10),
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

  try {
    // Atomic pair: flip the projected row to real + insert next projected.
    let issuedRow: typeof creditCardCycles.$inferSelect;
    const maybeBatch = db as { batch?: unknown };
    if (typeof maybeBatch.batch === "function") {
      const neonDb = db as NeonHttpDatabase<typeof schema>;
      const [issuedRows] = await neonDb.batch([
        neonDb
          .update(creditCardCycles)
          .set(issuedUpdates)
          .where(eq(creditCardCycles.id, existing.id))
          .returning(),
        neonDb.insert(creditCardCycles).values(nextCycleValues),
      ]);
      issuedRow = issuedRows[0];
    } else {
      const result = await db.transaction(async (trx) => {
        const [row] = await trx
          .update(creditCardCycles)
          .set(issuedUpdates)
          .where(eq(creditCardCycles.id, existing.id))
          .returning();
        await trx.insert(creditCardCycles).values(nextCycleValues);
        return row;
      });
      issuedRow = result;
    }

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
    } satisfies CreditCardCycleRowDTO);
  } catch (err) {
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
    const message = err instanceof Error ? err.message : "Internal server error";
    return fail(500, `Cycle update failed: ${message}`);
  }
}
