import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfYear, endOfYear, format } from "date-fns";
import { db } from "@/lib/db";
import { budgets, categories, transactions } from "@/lib/db/schema";
import { budgetCreateSchema } from "@/lib/validations/budget";
import { ok, fail, zodFail, requireUser } from "@/lib/api";
import type { BudgetDTO, BudgetListItemDTO } from "@/types";

function toBudgetDTO(b: typeof budgets.$inferSelect): BudgetDTO {
  return {
    id: b.id,
    userId: b.userId,
    categoryId: b.categoryId,
    amount: Number(b.amount),
    period: b.period,
    startDate: b.startDate,
    endDate: b.endDate,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

function periodRange(period: "weekly" | "monthly" | "yearly", ref = new Date()): { from: string; to: string } {
  // Returns civil-date strings ("YYYY-MM-DD") so they compare directly with
  // transactions.date (now a `date` column). `ref` is server-local-now; the
  // civil day of "now" is the intended window anchor.
  const toCivil = (d: Date) => format(d, "yyyy-MM-dd");
  switch (period) {
    case "weekly":
      return { from: toCivil(startOfWeek(ref, { weekStartsOn: 1 })), to: toCivil(endOfWeek(ref, { weekStartsOn: 1 })) };
    case "yearly":
      return { from: toCivil(startOfYear(ref)), to: toCivil(endOfYear(ref)) };
    default:
      return { from: toCivil(startOfMonth(ref)), to: toCivil(endOfMonth(ref)) };
  }
}

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const rows = await db
    .select({
      id: budgets.id,
      categoryId: budgets.categoryId,
      amount: budgets.amount,
      period: budgets.period,
      startDate: budgets.startDate,
      endDate: budgets.endDate,
      createdAt: budgets.createdAt,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
    })
    .from(budgets)
    .leftJoin(categories, eq(budgets.categoryId, categories.id))
    .where(eq(budgets.userId, auth.userId));

  const withSpent: BudgetListItemDTO[] = await Promise.all(
    rows.map(async (b) => {
      const { from, to } = periodRange(b.period);
      const filters = [
        eq(transactions.userId, auth.userId),
        eq(transactions.type, "expense"),
        gte(transactions.date, from),
        lte(transactions.date, to),
      ];
      if (b.categoryId) filters.push(eq(transactions.categoryId, b.categoryId));
      const [row] = await db
        .select({ spent: sql<number>`COALESCE(SUM(${transactions.amount}), 0)` })
        .from(transactions)
        .where(and(...filters));
      return {
        id: b.id,
        categoryId: b.categoryId,
        amount: Number(b.amount),
        period: b.period,
        startDate: b.startDate,
        endDate: b.endDate,
        createdAt: b.createdAt.toISOString(),
        categoryName: b.categoryName,
        categoryIcon: b.categoryIcon,
        categoryColor: b.categoryColor,
        spent: Number(row?.spent ?? 0),
        periodFrom: from,
        periodTo: to,
      };
    }),
  );

  return ok(withSpent satisfies BudgetListItemDTO[]);
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = budgetCreateSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);

  if (parsed.data.categoryId) {
    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, parsed.data.categoryId), eq(categories.userId, auth.userId)))
      .limit(1);
    if (!cat) return fail(400, "Invalid category");

    const existing = await db
      .select({ id: budgets.id })
      .from(budgets)
      .where(
        and(
          eq(budgets.userId, auth.userId),
          eq(budgets.categoryId, parsed.data.categoryId),
          eq(budgets.period, parsed.data.period)
        )
      )
      .limit(1);
    if (existing.length) return fail(409, "A budget for this category and period already exists");
  }

  const id = randomUUID();
  const [row] = await db
    .insert(budgets)
    .values({
      id,
      userId: auth.userId,
      categoryId: parsed.data.categoryId ?? null,
      amount: String(parsed.data.amount),
      period: parsed.data.period,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate ?? null,
    })
    .returning();
  return NextResponse.json({ data: toBudgetDTO(row) satisfies BudgetDTO }, { status: 201 });
}
