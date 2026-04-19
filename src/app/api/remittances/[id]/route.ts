import { and, eq } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { remittances, transactions } from "@/lib/db/schema";
import { remittanceUpdateSchema } from "@/lib/validations/remittance";
import { ok, fail, zodFail, requireUser } from "@/lib/api";
import type { RemittanceDetailDTO, HardDeletedIdDTO } from "@/types";

type TransactionPatch = Partial<
  Omit<typeof transactions.$inferInsert, "id" | "userId" | "createdAt" | "updatedAt">
>;
type RemittancePatch = Partial<
  Omit<typeof remittances.$inferInsert, "id" | "userId" | "transactionId" | "createdAt" | "updatedAt">
>;

type LoadedRow = NonNullable<Awaited<ReturnType<typeof loadOwned>>>;

function toDetailDTO(row: LoadedRow): RemittanceDetailDTO {
  return {
    id: row.id,
    transactionId: row.transactionId,
    userId: row.userId,
    fromCurrency: row.fromCurrency,
    toCurrency: row.toCurrency,
    fxRate: Number(row.fxRate),
    fee: Number(row.fee),
    service: row.service,
    recipientNote: row.recipientNote,
    createdAt: row.createdAt.toISOString(),
    amount: Number(row.amount),
    currency: row.currency,
    description: row.description,
    notes: row.notes,
    date: row.date,
    paymentMethod: row.paymentMethod,
    isRecurring: row.isRecurring,
    recurringFrequency: row.recurringFrequency,
    tags: row.tags,
  };
}

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

  return ok(toDetailDTO(row) satisfies RemittanceDetailDTO);
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
  const txSet: TransactionPatch = {};
  if (p.amount !== undefined) txSet.amount = String(p.amount);
  if (p.date !== undefined) txSet.date = p.date;
  if (p.description !== undefined) txSet.description = p.description;
  if (p.notes !== undefined) txSet.notes = p.notes;
  if (p.paymentMethod !== undefined) txSet.paymentMethod = p.paymentMethod;
  if (p.isRecurring !== undefined) txSet.isRecurring = p.isRecurring;
  if (p.recurringFrequency !== undefined) txSet.recurringFrequency = p.recurringFrequency;
  if (p.tags !== undefined) txSet.tags = p.tags;
  if (p.fromCurrency !== undefined) txSet.currency = p.fromCurrency;

  const remitSet: RemittancePatch = {};
  if (p.fromCurrency !== undefined) remitSet.fromCurrency = p.fromCurrency;
  if (p.toCurrency !== undefined) remitSet.toCurrency = p.toCurrency;
  if (p.fxRate !== undefined) remitSet.fxRate = p.fxRate.toString();
  if (p.fee !== undefined) remitSet.fee = p.fee.toString();
  if (p.service !== undefined) remitSet.service = p.service;
  if (p.recipientNote !== undefined) remitSet.recipientNote = p.recipientNote;

  const hasTx = Object.keys(txSet).length > 0;
  const hasRemit = Object.keys(remitSet).length > 0;

  // Same dispatch as POST route: neon-http doesn't support db.transaction, use
  // batch (atomic server-side). pg supports both — keep transaction for local
  // dev / self-host. Atomicity only matters when both sides get updated; a
  // single-sided update is one statement and needs no wrapping. Empty PATCH
  // (both sides empty) is a no-op — skip the DB round trip entirely.
  if (hasTx && hasRemit) {
    const maybeBatch = db as { batch?: unknown };
    if (typeof maybeBatch.batch === "function") {
      const neonDb = db as NeonHttpDatabase<typeof schema>;
      await neonDb.batch([
        neonDb
          .update(transactions)
          .set(txSet)
          .where(
            and(eq(transactions.id, existing.transactionId), eq(transactions.userId, auth.userId)),
          ),
        neonDb
          .update(remittances)
          .set(remitSet)
          .where(and(eq(remittances.id, existing.id), eq(remittances.userId, auth.userId))),
      ]);
    } else {
      await db.transaction(async (trx) => {
        await trx
          .update(transactions)
          .set(txSet)
          .where(
            and(eq(transactions.id, existing.transactionId), eq(transactions.userId, auth.userId)),
          );
        await trx
          .update(remittances)
          .set(remitSet)
          .where(and(eq(remittances.id, existing.id), eq(remittances.userId, auth.userId)));
      });
    }
  } else if (hasTx) {
    await db
      .update(transactions)
      .set(txSet)
      .where(
        and(eq(transactions.id, existing.transactionId), eq(transactions.userId, auth.userId)),
      );
  } else if (hasRemit) {
    await db
      .update(remittances)
      .set(remitSet)
      .where(and(eq(remittances.id, existing.id), eq(remittances.userId, auth.userId)));
  }

  const row = await loadOwned(auth.userId, existing.id);
  return ok(row ? (toDetailDTO(row) satisfies RemittanceDetailDTO) : null);
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
  return ok({ id: existing.id, deleted: true } satisfies HardDeletedIdDTO);
}
