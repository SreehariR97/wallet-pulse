import { z } from "zod";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { format, startOfMonth } from "date-fns";
import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { ok, zodFail, requireUser } from "@/lib/api";
import type { AnalyticsSummaryDTO } from "@/types";

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date (expected YYYY-MM-DD)").optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date (expected YYYY-MM-DD)").optional(),
});

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return zodFail(parsed.error);
  // Default window: start-of-month … today, as civil-date strings.
  const fromDate = parsed.data.from ?? format(startOfMonth(new Date()), "yyyy-MM-dd");
  const toDate = parsed.data.to ?? format(new Date(), "yyyy-MM-dd");

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
    from: fromDate,
    to: toDate,
  } satisfies AnalyticsSummaryDTO);
}
