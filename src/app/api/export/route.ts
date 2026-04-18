import { z } from "zod";
import { and, eq, gte, lte, asc } from "drizzle-orm";
import Papa from "papaparse";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { transactions, categories, budgets } from "@/lib/db/schema";
import { zodFail, requireUser } from "@/lib/api";
import type {
  ExportJsonDTO,
  TransactionExportRowDTO,
  CategoryDTO,
  BudgetDTO,
} from "@/types";

const querySchema = z.object({
  // .toLowerCase() in the pre-Zod code accepted arbitrary strings and fell
  // through to the final `fmt !== "csv"` check. Tighten to an explicit enum.
  format: z.enum(["csv", "json"]).default("csv"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date (expected YYYY-MM-DD)").optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date (expected YYYY-MM-DD)").optional(),
});

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const rawParams = Object.fromEntries(url.searchParams);
  if (typeof rawParams.format === "string") rawParams.format = rawParams.format.toLowerCase();
  const parsed = querySchema.safeParse(rawParams);
  if (!parsed.success) return zodFail(parsed.error);
  const { format: fmt, from, to } = parsed.data;

  const filters = [eq(transactions.userId, auth.userId)];
  if (from) filters.push(gte(transactions.date, from));
  if (to) filters.push(lte(transactions.date, to));

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
    const catRows = await db.select().from(categories).where(eq(categories.userId, auth.userId));
    const budgetRows = await db.select().from(budgets).where(eq(budgets.userId, auth.userId));
    const txItems: TransactionExportRowDTO[] = rows.map((r) => ({
      id: r.id,
      date: r.date,
      type: r.type,
      category: r.category,
      amount: Number(r.amount),
      currency: r.currency,
      description: r.description,
      notes: r.notes,
      paymentMethod: r.paymentMethod,
      isRecurring: r.isRecurring,
      recurringFrequency: r.recurringFrequency,
      tags: r.tags,
    }));
    const catItems: CategoryDTO[] = catRows.map((c) => ({
      id: c.id,
      userId: c.userId,
      name: c.name,
      icon: c.icon,
      color: c.color,
      type: c.type,
      budgetLimit: c.budgetLimit != null ? Number(c.budgetLimit) : null,
      isDefault: c.isDefault,
      sortOrder: c.sortOrder,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));
    const budgetItems: BudgetDTO[] = budgetRows.map((b) => ({
      id: b.id,
      userId: b.userId,
      categoryId: b.categoryId,
      amount: Number(b.amount),
      period: b.period,
      startDate: b.startDate,
      endDate: b.endDate,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
    }));
    const payload: ExportJsonDTO = {
      exportedAt: new Date().toISOString(),
      transactions: txItems,
      categories: catItems,
      budgets: budgetItems,
    };
    return new Response(JSON.stringify(payload satisfies ExportJsonDTO, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="walletpulse-${stamp}.json"`,
      },
    });
  }

  // fmt is Zod-narrowed to "csv" | "json"; the "json" branch returned above,
  // so the only remaining possibility is "csv". Leaving this comment where
  // the historical fallback used to live.

  const csv = Papa.unparse(
    rows.map((r) => ({
      Date: r.date,
      Type: r.type,
      Category: r.category ?? "",
      Amount: Number(r.amount),
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
