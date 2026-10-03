import { z } from "zod";
import { isoDate } from "@/lib/validations/common";
import { and, eq, gte, lte, or, sql, desc } from "drizzle-orm";
import { format, startOfMonth } from "date-fns";
import { db } from "@/lib/db";
import { transactions, categories } from "@/lib/db/schema";
import { ok, zodFail, requireUser } from "@/lib/api";
import type { AnalyticsCategoryBreakdownDTO } from "@/types";
import { analyticsScopeSchema, flowPredicates } from "@/lib/analytics-flows";

const querySchema = z.object({
  from: isoDate().optional(),
  to: isoDate().optional(),
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
  ...analyticsScopeSchema,
});

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return zodFail(parsed.error);
  const { from, to, type, view, accountId } = parsed.data;
  // "expense" and "income" mean the view's outflow and inflow (in cash-flow
  // view, outflows include card payments and remittances by category);
  // other types are filtered literally, narrowed to the account if given.
  const flow = flowPredicates(view, accountId);
  const typeFilter =
    type === "expense"
      ? flow.outflow
      : type === "income"
        ? flow.inflow
        : and(
            eq(transactions.type, type),
            accountId
              ? or(eq(transactions.accountId, accountId), eq(transactions.transferAccountId, accountId))
              : undefined,
          );
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
        typeFilter,
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
