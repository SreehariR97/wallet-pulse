import { and, eq, gte, lte, sql, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { ok, requireUser } from "@/lib/api";

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const fromDate = from ? new Date(from + "T00:00:00.000Z") : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const toDate = to ? new Date(to + "T23:59:59.999Z") : new Date();

  const rows = await db
    .select({
      paymentMethod: transactions.paymentMethod,
      total: sql<number>`SUM(${transactions.amount})`,
      count: sql<number>`COUNT(${transactions.id})`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, auth.userId),
        eq(transactions.type, "expense"),
        gte(transactions.date, fromDate),
        lte(transactions.date, toDate)
      )
    )
    .groupBy(transactions.paymentMethod)
    .orderBy(desc(sql<number>`SUM(${transactions.amount})`));

  return ok(rows.map((r) => ({ paymentMethod: r.paymentMethod, total: Number(r.total), count: Number(r.count) })));
}
