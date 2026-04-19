import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { transactions, categories, creditCards, remittances } from "@/lib/db/schema";
import { transactionUpdateSchema } from "@/lib/validations/transaction";
import { ok, fail, zodFail, requireUser } from "@/lib/api";
import { recomputeCardCycleAllocations } from "@/lib/credit-card-allocation";
import type { TransactionDTO, DeletedIdDTO } from "@/types";

type TransactionPatch = Partial<
  Omit<typeof transactions.$inferInsert, "id" | "userId" | "createdAt" | "updatedAt">
>;

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

async function assertOwned(id: string, userId: string) {
  const [row] = await db.select().from(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, userId))).limit(1);
  return row;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const row = await assertOwned(params.id, auth.userId);
  if (!row) return fail(404, "Transaction not found");
  return ok(toTransactionDTO(row) satisfies TransactionDTO);
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const existing = await assertOwned(params.id, auth.userId);
  if (!existing) return fail(404, "Transaction not found");

  const body = await req.json().catch(() => null);
  const parsed = transactionUpdateSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);
  const t = parsed.data;

  if (t.categoryId) {
    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, t.categoryId), eq(categories.userId, auth.userId)))
      .limit(1);
    if (!cat) return fail(400, "Invalid category");
  }

  // Re-verify card ownership. Passing null explicitly clears the link.
  if (t.creditCardId) {
    const [card] = await db
      .select({ id: creditCards.id })
      .from(creditCards)
      .where(
        and(
          eq(creditCards.id, t.creditCardId),
          eq(creditCards.userId, auth.userId),
          eq(creditCards.isActive, true),
        ),
      )
      .limit(1);
    if (!card) return fail(400, "Invalid credit card");
  }

  // Coherence: for a card-paid expense, paymentMethod must remain
  // credit_card while creditCardId is set. Transfers to a card (card
  // repayments) intentionally use paymentMethod=bank_transfer with
  // creditCardId set — that's the pay-route shape — so the check applies
  // only to type=expense. Callers can null creditCardId explicitly if they
  // want to sever the link.
  const finalCard = t.creditCardId === undefined ? existing.creditCardId : t.creditCardId;
  const finalMethod = t.paymentMethod ?? existing.paymentMethod;
  const finalType = t.type ?? existing.type;
  if (finalCard && finalType === "expense" && finalMethod !== "credit_card") {
    return fail(400, "paymentMethod must be credit_card when creditCardId is set on an expense");
  }

  // Invariant: a remittance row always points to a type=transfer transaction.
  // If this tx has a linked remittance and the patch would change its type,
  // refuse — the remittance would become a dangling FX/fee record attached
  // to an expense/income row. Callers should DELETE /api/remittances/:id
  // first (which cascades the tx too) if they want to remove the transfer.
  if (t.type !== undefined && t.type !== existing.type && existing.type === "transfer") {
    const [link] = await db
      .select({ id: remittances.id })
      .from(remittances)
      .where(eq(remittances.transactionId, existing.id))
      .limit(1);
    if (link) {
      return fail(
        400,
        "Cannot change type on a transaction linked to a remittance. Delete the remittance first.",
      );
    }
  }

  const patch: TransactionPatch = {};
  if (t.type !== undefined) patch.type = t.type;
  if (t.amount !== undefined) patch.amount = String(t.amount);
  if (t.categoryId !== undefined) patch.categoryId = t.categoryId;
  if (t.description !== undefined) patch.description = t.description;
  if (t.notes !== undefined) patch.notes = t.notes;
  if (t.date !== undefined) patch.date = t.date;
  if (t.paymentMethod !== undefined) patch.paymentMethod = t.paymentMethod;
  if (t.creditCardId !== undefined) patch.creditCardId = t.creditCardId;
  if (t.isRecurring !== undefined) patch.isRecurring = t.isRecurring;
  if (t.recurringFrequency !== undefined) patch.recurringFrequency = t.recurringFrequency;
  if (t.tags !== undefined) patch.tags = t.tags;

  const [row] = await db.update(transactions).set(patch).where(eq(transactions.id, params.id)).returning();

  // Phase 4: if the edit touches card-allocation inputs on a transfer
  // (date/amount/creditCardId), sweep the affected card(s). Changing the
  // linked card requires sweeping both the old and the new card so cycles
  // on either side stay consistent. Type flips into/out of transfer also
  // count — a new transfer needs allocation, an ex-transfer needs removal.
  const cardsToSweep = new Set<string>();
  const oldWasTransfer = existing.type === "transfer";
  const newIsTransfer = row.type === "transfer";
  const allocationFieldChanged =
    existing.date !== row.date ||
    existing.amount !== row.amount ||
    existing.creditCardId !== row.creditCardId ||
    oldWasTransfer !== newIsTransfer;
  if (allocationFieldChanged) {
    if (oldWasTransfer && existing.creditCardId) cardsToSweep.add(existing.creditCardId);
    if (newIsTransfer && row.creditCardId) cardsToSweep.add(row.creditCardId);
  }
  for (const cardId of cardsToSweep) {
    await recomputeCardCycleAllocations(db, auth.userId, cardId);
  }

  return ok(toTransactionDTO(row) satisfies TransactionDTO);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const existing = await assertOwned(params.id, auth.userId);
  if (!existing) return fail(404, "Transaction not found");
  await db.delete(transactions).where(eq(transactions.id, params.id));
  if (existing.type === "transfer" && existing.creditCardId) {
    await recomputeCardCycleAllocations(db, auth.userId, existing.creditCardId);
  }
  return ok({ id: params.id } satisfies DeletedIdDTO);
}
