import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { transactions, categories, creditCards, remittances } from "@/lib/db/schema";
import { transactionUpdateSchema } from "@/lib/validations/transaction";
import { ok, fail, zodFail, requireUser } from "@/lib/api";

async function assertOwned(id: string, userId: string) {
  const [row] = await db.select().from(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, userId))).limit(1);
  return row;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const row = await assertOwned(params.id, auth.userId);
  if (!row) return fail(404, "Transaction not found");
  return ok(row);
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

  // Coherence: if the patch moves paymentMethod away from credit_card while
  // creditCardId is still set (either in the existing row or the incoming
  // patch), reject. Callers can null creditCardId explicitly if they want
  // to sever the link.
  const finalCard = t.creditCardId === undefined ? existing.creditCardId : t.creditCardId;
  const finalMethod = t.paymentMethod ?? existing.paymentMethod;
  if (finalCard && finalMethod !== "credit_card") {
    return fail(400, "paymentMethod must be credit_card when creditCardId is set");
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

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (t.type !== undefined) patch.type = t.type;
  if (t.amount !== undefined) patch.amount = t.amount;
  if (t.categoryId !== undefined) patch.categoryId = t.categoryId;
  if (t.description !== undefined) patch.description = t.description;
  if (t.notes !== undefined) patch.notes = t.notes;
  if (t.date !== undefined) patch.date = new Date(t.date + "T12:00:00.000Z");
  if (t.paymentMethod !== undefined) patch.paymentMethod = t.paymentMethod;
  if (t.creditCardId !== undefined) patch.creditCardId = t.creditCardId;
  if (t.isRecurring !== undefined) patch.isRecurring = t.isRecurring;
  if (t.recurringFrequency !== undefined) patch.recurringFrequency = t.recurringFrequency;
  if (t.tags !== undefined) patch.tags = t.tags;

  await db.update(transactions).set(patch).where(eq(transactions.id, params.id));
  const [row] = await db.select().from(transactions).where(eq(transactions.id, params.id)).limit(1);
  return ok(row);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const existing = await assertOwned(params.id, auth.userId);
  if (!existing) return fail(404, "Transaction not found");
  await db.delete(transactions).where(eq(transactions.id, params.id));
  return ok({ id: params.id });
}
