import { and, eq, gte, lte, sql, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { ok, requireUser } from "@/lib/api";

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const granularity = (url.searchParams.get("granularity") ?? "daily") as "daily" | "monthly";
  const fromDate = from ? new Date(from + "T00:00:00.000Z") : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const toDate = to ? new Date(to + "T23:59:59.999Z") : new Date();

  // Postgres uses to_char() for formatted date output, with different tokens
  // than SQLite's strftime: YYYY-MM-DD / YYYY-MM.
  const fmt = granularity === "monthly" ? "YYYY-MM" : "YYYY-MM-DD";
  const bucket = sql<string>`to_char(${transactions.date}, ${fmt})`;

  const rows = await db
    .select({
      bucket,
      income: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount} ELSE 0 END), 0)`,
      expense: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount} ELSE 0 END), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, auth.userId),
        gte(transactions.date, fromDate),
        lte(transactions.date, toDate)
      )
    )
    .groupBy(bucket)
    .orderBy(asc(bucket));

  return ok(
    rows.map((r) => ({
      bucket: r.bucket,
      income: Number(r.income),
      expense: Number(r.expense),
      net: Number(r.income) - Number(r.expense),
    }))
  );
}
