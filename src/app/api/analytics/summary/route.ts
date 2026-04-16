import { and, eq, gte, lte, sql } from "drizzle-orm";
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

  const filters = [
    eq(transactions.userId, auth.userId),
    gte(transactions.date, fromDate),
    lte(transactions.date, toDate),
  ];

  const [row] = await db
    .select({
      income: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount} ELSE 0 END), 0)`,
      expense: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount} ELSE 0 END), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(transactions)
    .where(and(...filters));

  const income = Number(row?.income ?? 0);
  const expense = Number(row?.expense ?? 0);
  const net = income - expense;
  const savingsRate = income > 0 ? ((income - expense) / income) * 100 : 0;

  return ok({
    income,
    expense,
    net,
    savingsRate,
    count: Number(row?.count ?? 0),
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
  });
}
