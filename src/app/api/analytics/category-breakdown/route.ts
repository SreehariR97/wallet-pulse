import { and, eq, gte, lte, sql, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { transactions, categories } from "@/lib/db/schema";
import { ok, requireUser } from "@/lib/api";

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const rawType = url.searchParams.get("type") ?? "expense";
  const allowedTypes = new Set([
    "expense",
    "income",
    "transfer",
    "loan_given",
    "loan_taken",
    "repayment_received",
    "repayment_made",
  ]);
  const type = (allowedTypes.has(rawType) ? rawType : "expense") as
    | "expense"
    | "income"
    | "transfer"
    | "loan_given"
    | "loan_taken"
    | "repayment_received"
    | "repayment_made";
  const fromDate = from ? new Date(from + "T00:00:00.000Z") : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const toDate = to ? new Date(to + "T23:59:59.999Z") : new Date();

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

  return ok(rows.map((r) => ({ ...r, total: Number(r.total), count: Number(r.count) })));
}
