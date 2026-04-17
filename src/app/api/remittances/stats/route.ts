/**
 * GET /api/remittances/stats?from=&to=
 *
 * Aggregated view: grouped by service, how much did you send, what did you
 * pay in fees, what was your average FX rate, and (approximate) how much
 * was delivered in the destination currency.
 *
 * deliveredTotal uses a simple (amount * fxRate - fee * fxRate) approximation
 * per-row. This is summed — not an average-rate computation — so it reflects
 * what you actually received, row-by-row.
 */
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { remittances, transactions } from "@/lib/db/schema";
import { remittanceStatsQuerySchema } from "@/lib/validations/remittance";
import { ok, zodFail, requireUser } from "@/lib/api";

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const parsed = remittanceStatsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return zodFail(parsed.error);
  const q = parsed.data;

  const filters = [eq(remittances.userId, auth.userId)];
  if (q.from) filters.push(gte(transactions.date, new Date(q.from + "T00:00:00.000Z")));
  if (q.to) filters.push(lte(transactions.date, new Date(q.to + "T23:59:59.999Z")));

  const rows = await db
    .select({
      service: remittances.service,
      count: sql<number>`COUNT(*)`,
      totalSent: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
      totalFees: sql<number>`COALESCE(SUM(${remittances.fee}), 0)`,
      avgFxRate: sql<number>`COALESCE(AVG(${remittances.fxRate}), 0)`,
      // (amount - fee) * fxRate is the net delivered per row; summing gives
      // the total delivered in the destination currency.
      totalDelivered: sql<number>`COALESCE(SUM((${transactions.amount} - ${remittances.fee}) * ${remittances.fxRate}), 0)`,
    })
    .from(remittances)
    .innerJoin(transactions, eq(remittances.transactionId, transactions.id))
    .where(and(...filters))
    .groupBy(remittances.service)
    .orderBy(desc(sql<number>`SUM(${transactions.amount})`));

  return ok(
    rows.map((r) => ({
      service: r.service,
      count: Number(r.count),
      totalSent: Number(r.totalSent),
      totalFees: Number(r.totalFees),
      avgFxRate: Number(r.avgFxRate),
      totalDelivered: Number(r.totalDelivered),
    })),
  );
}
