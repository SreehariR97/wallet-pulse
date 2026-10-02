/**
 * POST /api/credit-cards/[id]/pay
 *
 * Shortcut to record a card repayment. Creates a transfer transaction
 * attached to the "Credit Card Payment" category, with creditCardId set to
 * this card. Amount positive; reduces the card's computed balance.
 *
 * The insert runs in one atomic unit with the cycle re-allocation:
 * [lock card, INSERT payment, reallocate cycles] (batch on Neon,
 * transaction on pg). The card lock serializes concurrent payments so
 * neither can overwrite the other's amount_paid. Card ownership is
 * re-verified here — do not rely on the FK to gate access.
 */
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { categories, creditCards, transactions } from "@/lib/db/schema";
import { creditCardPaySchema } from "@/lib/validations/credit-card";
import { TRANSFER_CATEGORY_NAMES } from "@/lib/db/defaults";
import { ok, fail, zodFail, requireUser } from "@/lib/api";
import { lockCard, reallocateCardCycles } from "@/lib/credit-card-allocation";
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
        eq(categories.type, "transfer"),
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
      const [, inserted] = await neonDb.batch([
        lockCard(neonDb, card.id),
        neonDb.insert(transactions).values(insertValues).returning(),
        reallocateCardCycles(neonDb, auth.userId, card.id),
      ]);
      row = inserted[0];
    } else {
      row = await db.transaction(async (trx) => {
        await lockCard(trx, card.id);
        const [inserted] = await trx.insert(transactions).values(insertValues).returning();
        await reallocateCardCycles(trx, auth.userId, card.id);
        return inserted;
      });
    }
    return ok(toTransactionDTO(row) satisfies TransactionDTO, { created: true });
  } catch (err) {
    console.error("[POST /api/credit-cards/:id/pay] failed", {
      userId: auth.userId,
      cardId: card.id,
      payload: { amount: p.amount, date: p.date },
      error:
        err instanceof Error
          ? { name: err.name, message: err.message, stack: err.stack }
          : err,
    });
    // Details are in the server log above; driver/constraint text stays
    // out of the response.
    return fail(500, "Payment recording failed. Please try again.");
  }
}
