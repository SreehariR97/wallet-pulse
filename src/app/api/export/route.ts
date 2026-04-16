import { and, eq, gte, lte, asc } from "drizzle-orm";
import Papa from "papaparse";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { transactions, categories, budgets } from "@/lib/db/schema";
import { fail, requireUser } from "@/lib/api";

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const fmt = (url.searchParams.get("format") ?? "csv").toLowerCase();
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const filters = [eq(transactions.userId, auth.userId)];
  if (from) filters.push(gte(transactions.date, new Date(from + "T00:00:00.000Z")));
  if (to) filters.push(lte(transactions.date, new Date(to + "T23:59:59.999Z")));

  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      type: transactions.type,
      category: categories.name,
      amount: transactions.amount,
      currency: transactions.currency,
      description: transactions.description,
      notes: transactions.notes,
      paymentMethod: transactions.paymentMethod,
      isRecurring: transactions.isRecurring,
      recurringFrequency: transactions.recurringFrequency,
      tags: transactions.tags,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(...filters))
    .orderBy(asc(transactions.date));

  const stamp = format(new Date(), "yyyy-MM-dd");

  if (fmt === "json") {
    const payload = {
      exportedAt: new Date().toISOString(),
      transactions: rows.map((r) => ({
        ...r,
        date: r.date instanceof Date ? r.date.toISOString() : r.date,
      })),
      categories: await db.select().from(categories).where(eq(categories.userId, auth.userId)),
      budgets: await db.select().from(budgets).where(eq(budgets.userId, auth.userId)),
    };
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="walletpulse-${stamp}.json"`,
      },
    });
  }

  if (fmt !== "csv") return fail(400, "Unsupported format");

  const csv = Papa.unparse(
    rows.map((r) => ({
      Date: r.date instanceof Date ? format(r.date, "yyyy-MM-dd") : r.date,
      Type: r.type,
      Category: r.category ?? "",
      Amount: r.amount,
      Currency: r.currency,
      Description: r.description,
      Notes: r.notes ?? "",
      "Payment Method": r.paymentMethod,
      Recurring: r.isRecurring ? "yes" : "no",
      Frequency: r.recurringFrequency ?? "",
      Tags: r.tags ?? "",
    })),
    { quotes: true }
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="walletpulse-${stamp}.csv"`,
    },
  });
}
