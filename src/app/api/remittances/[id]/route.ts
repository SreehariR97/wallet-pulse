import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { remittances, transactions } from "@/lib/db/schema";
import { remittanceUpdateSchema } from "@/lib/validations/remittance";
import { ok, fail, zodFail, requireUser } from "@/lib/api";

async function loadOwned(userId: string, id: string) {
  const [row] = await db
    .select({
      id: remittances.id,
      transactionId: remittances.transactionId,
      userId: remittances.userId,
      fromCurrency: remittances.fromCurrency,
      toCurrency: remittances.toCurrency,
      fxRate: remittances.fxRate,
      fee: remittances.fee,
      service: remittances.service,
      recipientNote: remittances.recipientNote,
      createdAt: remittances.createdAt,
      amount: transactions.amount,
      currency: transactions.currency,
      description: transactions.description,
      notes: transactions.notes,
      date: transactions.date,
      paymentMethod: transactions.paymentMethod,
      isRecurring: transactions.isRecurring,
      recurringFrequency: transactions.recurringFrequency,
      tags: transactions.tags,
    })
    .from(remittances)
    .innerJoin(transactions, eq(remittances.transactionId, transactions.id))
    .where(and(eq(remittances.id, id), eq(remittances.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const row = await loadOwned(auth.userId, params.id);
  if (!row) return fail(404, "Remittance not found");

  return ok({ ...row, fxRate: Number(row.fxRate), fee: Number(row.fee) });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const existing = await loadOwned(auth.userId, params.id);
  if (!existing) return fail(404, "Remittance not found");

  const body = await req.json().catch(() => null);
  const parsed = remittanceUpdateSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);
  const p = parsed.data;

  // Split into tx-side and remittance-side partials so each UPDATE only
  // touches the columns it owns.
  const txSet: Record<string, unknown> = { updatedAt: new Date() };
  if (p.amount !== undefined) txSet.amount = p.amount;
  if (p.date !== undefined) txSet.date = new Date(p.date + "T12:00:00.000Z");
  if (p.description !== undefined) txSet.description = p.description;
  if (p.notes !== undefined) txSet.notes = p.notes;
  if (p.paymentMethod !== undefined) txSet.paymentMethod = p.paymentMethod;
  if (p.isRecurring !== undefined) txSet.isRecurring = p.isRecurring;
  if (p.recurringFrequency !== undefined) txSet.recurringFrequency = p.recurringFrequency;
  if (p.tags !== undefined) txSet.tags = p.tags;
  if (p.fromCurrency !== undefined) txSet.currency = p.fromCurrency;

  const remitSet: Record<string, unknown> = { updatedAt: new Date() };
  if (p.fromCurrency !== undefined) remitSet.fromCurrency = p.fromCurrency;
  if (p.toCurrency !== undefined) remitSet.toCurrency = p.toCurrency;
  if (p.fxRate !== undefined) remitSet.fxRate = p.fxRate.toString();
  if (p.fee !== undefined) remitSet.fee = p.fee.toString();
  if (p.service !== undefined) remitSet.service = p.service;
  if (p.recipientNote !== undefined) remitSet.recipientNote = p.recipientNote;

  await db.transaction(async (trx) => {
    if (Object.keys(txSet).length > 1) {
      await trx
        .update(transactions)
        .set(txSet)
        .where(
          and(eq(transactions.id, existing.transactionId), eq(transactions.userId, auth.userId)),
        );
    }
    if (Object.keys(remitSet).length > 1) {
      await trx
        .update(remittances)
        .set(remitSet)
        .where(and(eq(remittances.id, existing.id), eq(remittances.userId, auth.userId)));
    }
  });

  const row = await loadOwned(auth.userId, existing.id);
  return ok(row ? { ...row, fxRate: Number(row.fxRate), fee: Number(row.fee) } : null);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const existing = await loadOwned(auth.userId, params.id);
  if (!existing) return fail(404, "Remittance not found");

  // Deleting the transaction cascades to the remittance row via FK.
  await db
    .delete(transactions)
    .where(
      and(eq(transactions.id, existing.transactionId), eq(transactions.userId, auth.userId)),
    );
  return ok({ id: existing.id, deleted: true });
}
