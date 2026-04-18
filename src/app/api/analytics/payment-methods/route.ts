import { z } from "zod";
import { and, eq, gte, lte, sql, desc } from "drizzle-orm";
import { format, startOfMonth } from "date-fns";
import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { ok, zodFail, requireUser } from "@/lib/api";
import type { AnalyticsPaymentMethodDTO } from "@/types";

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
  const fromDate = parsed.data.from ?? format(startOfMonth(new Date()), "yyyy-MM-dd");
  const toDate = parsed.data.to ?? format(new Date(), "yyyy-MM-dd");

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

  const items: AnalyticsPaymentMethodDTO[] = rows.map((r) => ({
    paymentMethod: r.paymentMethod,
    total: Number(r.total),
    count: Number(r.count),
  }));
  return ok(items satisfies AnalyticsPaymentMethodDTO[]);
}
