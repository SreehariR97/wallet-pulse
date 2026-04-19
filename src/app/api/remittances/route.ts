/**
 * Remittances API — international money transfers attached to a transfer-type
 * transaction via a 1:1 FK (remittances.transaction_id, UNIQUE).
 *
 * POST is transactional: transaction row and remittance row are committed
 * together or not at all. Works on both drivers — pg's interactive
 * transactions and Neon HTTP's batched transactions both give atomicity.
 */
import { randomUUID } from "crypto";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, remittances, transactions } from "@/lib/db/schema";
import {
  remittanceCreateSchema,
  remittanceQuerySchema,
} from "@/lib/validations/remittance";
import { TRANSFER_CATEGORY_NAMES } from "@/lib/db/defaults";
import { ok, fail, zodFail, requireUser } from "@/lib/api";
import type { RemittanceDTO } from "@/types";

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const parsed = remittanceQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return zodFail(parsed.error);
  const q = parsed.data;

  const filters = [eq(remittances.userId, auth.userId)];
  if (q.service) filters.push(eq(remittances.service, q.service));
  if (q.from) filters.push(gte(transactions.date, q.from));
  if (q.to) filters.push(lte(transactions.date, q.to));

  const whereClause = and(...filters);

  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(remittances)
    .innerJoin(transactions, eq(remittances.transactionId, transactions.id))
    .where(whereClause);
  const total = Number(count ?? 0);

  const sortCol =
    q.sort === "amount"
      ? transactions.amount
      : q.sort === "fxRate"
        ? remittances.fxRate
        : transactions.date;
  const ordering = q.order === "asc" ? asc(sortCol) : desc(sortCol);

  const rows = await db
    .select({
      id: remittances.id,
      transactionId: remittances.transactionId,
      fromCurrency: remittances.fromCurrency,
      toCurrency: remittances.toCurrency,
      fxRate: remittances.fxRate,
      fee: remittances.fee,
      service: remittances.service,
      recipientNote: remittances.recipientNote,
      createdAt: remittances.createdAt,
      // Transaction side — what left the account.
      amount: transactions.amount,
      currency: transactions.currency,
      description: transactions.description,
      notes: transactions.notes,
      date: transactions.date,
      paymentMethod: transactions.paymentMethod,
    })
    .from(remittances)
    .innerJoin(transactions, eq(remittances.transactionId, transactions.id))
    .where(whereClause)
    .orderBy(ordering)
    .limit(q.limit)
    .offset((q.page - 1) * q.limit);

  // numeric() arrives as string from pg; cast to Number for JSON. Lossless
  // for human-scale values (rates ~1–200, fees ~0–100); extreme magnitudes
  // (1e-20, 1e15) would clip precision — not a realistic concern for FX.
  const items: RemittanceDTO[] = rows.map((r) => ({
    id: r.id,
    transactionId: r.transactionId,
    fromCurrency: r.fromCurrency,
    toCurrency: r.toCurrency,
    fxRate: Number(r.fxRate),
    fee: Number(r.fee),
    service: r.service,
    recipientNote: r.recipientNote,
    createdAt: r.createdAt.toISOString(),
    amount: Number(r.amount),
    currency: r.currency,
    description: r.description,
    notes: r.notes,
    date: r.date,
    paymentMethod: r.paymentMethod,
  }));
  return ok(items satisfies RemittanceDTO[], { total, page: q.page, limit: q.limit, totalPages: Math.max(1, Math.ceil(total / q.limit)) });
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = remittanceCreateSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);
  const r = parsed.data;

  // Validate the transfer category exists for this user before opening a tx.
  // Transfer categories are seeded at registration; production users from
  // before this feature need scripts/backfill-transfer-categories.ts run.
  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.userId, auth.userId),
        eq(categories.name, TRANSFER_CATEGORY_NAMES.internationalTransfer),
      ),
    )
    .limit(1);
  if (!cat) {
    return fail(
      409,
      "Missing 'International Transfer' category. Run scripts/backfill-transfer-categories.ts.",
    );
  }

  const txId = randomUUID();
  const remitId = randomUUID();

  // Atomic: both rows commit or neither. Non-interactive on Neon HTTP — we
  // pre-generate IDs so we don't need to read one insert to write the next.
  // Each insert `.returning()` so we can shape the response without a
  // follow-up JOIN select.
  try {
    const { tx, rem } = await db.transaction(async (trx) => {
      const [txRow] = await trx
        .insert(transactions)
        .values({
          id: txId,
          userId: auth.userId,
          categoryId: cat.id,
          type: "transfer",
          amount: String(r.amount),
          currency: r.fromCurrency,
          description: r.description,
          notes: r.notes ?? null,
          date: r.date,
          paymentMethod: r.paymentMethod,
          isRecurring: r.isRecurring,
          recurringFrequency: r.isRecurring ? r.recurringFrequency ?? null : null,
          tags: r.tags ?? null,
        })
        .returning();
      const [remRow] = await trx
        .insert(remittances)
        .values({
          id: remitId,
          transactionId: txId,
          userId: auth.userId,
          fromCurrency: r.fromCurrency,
          toCurrency: r.toCurrency,
          // numeric columns take strings in Drizzle to preserve precision.
          fxRate: r.fxRate.toString(),
          fee: r.fee.toString(),
          service: r.service,
          recipientNote: r.recipientNote ?? null,
        })
        .returning();
      return { tx: txRow, rem: remRow };
    });

    return ok(
      {
        id: rem.id,
        transactionId: rem.transactionId,
        fromCurrency: rem.fromCurrency,
        toCurrency: rem.toCurrency,
        fxRate: Number(rem.fxRate),
        fee: Number(rem.fee),
        service: rem.service,
        recipientNote: rem.recipientNote,
        createdAt: rem.createdAt.toISOString(),
        amount: Number(tx.amount),
        currency: tx.currency,
        description: tx.description,
        notes: tx.notes,
        date: tx.date,
        paymentMethod: tx.paymentMethod,
      } satisfies RemittanceDTO,
      { created: true },
    );
  } catch (err) {
    console.error("[POST /api/remittances] insert failed", {
      userId: auth.userId,
      categoryId: cat.id,
      payload: {
        amount: r.amount,
        fromCurrency: r.fromCurrency,
        toCurrency: r.toCurrency,
        fxRate: r.fxRate,
        fee: r.fee,
        service: r.service,
        date: r.date,
        paymentMethod: r.paymentMethod,
      },
      error: err instanceof Error
        ? { name: err.name, message: err.message, stack: err.stack }
        : err,
    });
    const message = err instanceof Error ? err.message : "Internal server error";
    return fail(500, `Remittance insert failed: ${message}`);
  }
}
