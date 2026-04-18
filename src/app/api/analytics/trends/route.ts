import { z } from "zod";
import { and, eq, gte, lte, sql, asc } from "drizzle-orm";
import { format, startOfMonth } from "date-fns";
import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { ok, zodFail, requireUser } from "@/lib/api";
import type { AnalyticsTrendPointDTO } from "@/types";

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date (expected YYYY-MM-DD)").optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date (expected YYYY-MM-DD)").optional(),
  granularity: z.enum(["daily", "monthly"]).default("daily"),
});

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return zodFail(parsed.error);
  const { from, to, granularity } = parsed.data;
  const fromDate = from ?? format(startOfMonth(new Date()), "yyyy-MM-dd");
  const toDate = to ?? format(new Date(), "yyyy-MM-dd");

  // Postgres uses to_char() for formatted date output. We must inline the
  // format literal (not parameterize it) so the expression in SELECT and
  // GROUP BY is byte-identical — otherwise Postgres rejects the query with
  // "column must appear in the GROUP BY clause" because parameter bindings
  // differ between the two references.
  const bucket =
    granularity === "monthly"
      ? sql<string>`to_char(${transactions.date}, 'YYYY-MM')`
      : sql<string>`to_char(${transactions.date}, 'YYYY-MM-DD')`;

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

  const items: AnalyticsTrendPointDTO[] = rows.map((r) => ({
    bucket: r.bucket,
    income: Number(r.income),
    expense: Number(r.expense),
    net: Number(r.income) - Number(r.expense),
  }));
  return ok(items satisfies AnalyticsTrendPointDTO[]);
}
