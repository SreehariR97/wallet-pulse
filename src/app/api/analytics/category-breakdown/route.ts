import { z } from "zod";
import { and, eq, gte, lte, sql, desc } from "drizzle-orm";
import { format, startOfMonth } from "date-fns";
import { db } from "@/lib/db";
import { transactions, categories } from "@/lib/db/schema";
import { ok, zodFail, requireUser } from "@/lib/api";
import type { AnalyticsCategoryBreakdownDTO } from "@/types";

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date (expected YYYY-MM-DD)").optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date (expected YYYY-MM-DD)").optional(),
  type: z
    .enum([
      "expense",
      "income",
      "transfer",
      "loan_given",
      "loan_taken",
      "repayment_received",
      "repayment_made",
    ])
    .default("expense"),
});

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return zodFail(parsed.error);
  const { from, to, type } = parsed.data;
  const fromDate = from ?? format(startOfMonth(new Date()), "yyyy-MM-dd");
  const toDate = to ?? format(new Date(), "yyyy-MM-dd");

  const rows = await db
    .select({
      categoryId: categories.id,
      name: categories.name,
      icon: categories.icon,
      color: categories.color,
      total: sql<number>`SUM(${transactions.amount})`,
      count: sql<number>`COUNT(${transactions.id})`,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        eq(transactions.userId, auth.userId),
        eq(transactions.type, type),
        gte(transactions.date, fromDate),
        lte(transactions.date, toDate)
      )
    )
    .groupBy(categories.id)
    .orderBy(desc(sql<number>`SUM(${transactions.amount})`));

  const items: AnalyticsCategoryBreakdownDTO[] = rows.map((r) => ({
    categoryId: r.categoryId,
    name: r.name,
    icon: r.icon,
    color: r.color,
    total: Number(r.total),
    count: Number(r.count),
  }));
  return ok(items satisfies AnalyticsCategoryBreakdownDTO[]);
}
