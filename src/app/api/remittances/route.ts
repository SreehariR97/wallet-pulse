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

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const parsed = remittanceQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return zodFail(parsed.error);
  const q = parsed.data;

  const filters = [eq(remittances.userId, auth.userId)];
  if (q.service) filters.push(eq(remittances.service, q.service));
  if (q.from) filters.push(gte(transactions.date, new Date(q.from + "T00:00:00.000Z")));
  if (q.to) filters.push(lte(transactions.date, new Date(q.to + "T23:59:59.999Z")));

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
  return ok(
    rows.map((r) => ({
      ...r,
      fxRate: Number(r.fxRate),
      fee: Number(r.fee),
    })),
    { total, page: q.page, limit: q.limit, totalPages: Math.max(1, Math.ceil(total / q.limit)) },
  );
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
  await db.transaction(async (trx) => {
    await trx.insert(transactions).values({
      id: txId,
      userId: auth.userId,
      categoryId: cat.id,
      type: "transfer",
      amount: r.amount,
      currency: r.fromCurrency,
      description: r.description,
      notes: r.notes ?? null,
      date: new Date(r.date + "T12:00:00.000Z"),
      paymentMethod: r.paymentMethod,
      isRecurring: r.isRecurring,
      recurringFrequency: r.isRecurring ? r.recurringFrequency ?? null : null,
      tags: r.tags ?? null,
    });
    await trx.insert(remittances).values({
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
    });
  });

  const [row] = await db
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
      amount: transactions.amount,
      currency: transactions.currency,
      description: transactions.description,
      notes: transactions.notes,
      date: transactions.date,
      paymentMethod: transactions.paymentMethod,
    })
    .from(remittances)
    .innerJoin(transactions, eq(remittances.transactionId, transactions.id))
    .where(eq(remittances.id, remitId))
    .limit(1);

  return ok(
    {
      ...row,
      fxRate: row ? Number(row.fxRate) : 0,
      fee: row ? Number(row.fee) : 0,
    },
    { created: true },
  );
}
