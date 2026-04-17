import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { creditCards, transactions } from "@/lib/db/schema";
import { creditCardUpdateSchema } from "@/lib/validations/credit-card";
import { ok, fail, zodFail, requireUser } from "@/lib/api";
import { getStatementCycle, getNextDueDate } from "@/lib/credit-cards";

async function loadOwned(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(creditCards)
    .where(and(eq(creditCards.id, id), eq(creditCards.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const card = await loadOwned(auth.userId, params.id);
  if (!card) return fail(404, "Card not found");

  const [agg] = await db
    .select({
      totalExpense: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount} ELSE 0 END), 0)`,
      totalPayments: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'transfer' THEN ${transactions.amount} ELSE 0 END), 0)`,
    })
    .from(transactions)
    .where(and(eq(transactions.userId, auth.userId), eq(transactions.creditCardId, card.id)));

  const totalExpense = Number(agg?.totalExpense ?? 0);
  const totalPayments = Number(agg?.totalPayments ?? 0);
  const balance = totalExpense - totalPayments;
  const utilizationPercent = card.creditLimit > 0 ? (balance / card.creditLimit) * 100 : 0;

  const now = new Date();
  const currentCycle = getStatementCycle(now, card.statementDay, 0);
  const nextDueDate = getNextDueDate(now, card.paymentDueDay);

  return ok({
    ...card,
    balance,
    utilizationPercent,
    totalExpense,
    totalPayments,
    currentCycleStart: currentCycle.start.toISOString(),
    currentCycleEnd: currentCycle.end.toISOString(),
    nextDueDate: nextDueDate.toISOString(),
    minPaymentEstimate: Math.max(0, balance) * (card.minimumPaymentPercent / 100),
  });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const existing = await loadOwned(auth.userId, params.id);
  if (!existing) return fail(404, "Card not found");

  const body = await req.json().catch(() => null);
  const parsed = creditCardUpdateSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);
  const p = parsed.data;

  await db
    .update(creditCards)
    .set({
      ...(p.name !== undefined ? { name: p.name } : {}),
      ...(p.issuer !== undefined ? { issuer: p.issuer } : {}),
      ...(p.last4 !== undefined ? { last4: p.last4 } : {}),
      ...(p.creditLimit !== undefined ? { creditLimit: p.creditLimit } : {}),
      ...(p.statementDay !== undefined ? { statementDay: p.statementDay } : {}),
      ...(p.paymentDueDay !== undefined ? { paymentDueDay: p.paymentDueDay } : {}),
      ...(p.minimumPaymentPercent !== undefined
        ? { minimumPaymentPercent: p.minimumPaymentPercent }
        : {}),
      ...(p.isActive !== undefined ? { isActive: p.isActive } : {}),
      ...(p.sortOrder !== undefined ? { sortOrder: p.sortOrder } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(creditCards.id, existing.id), eq(creditCards.userId, auth.userId)));

  const [row] = await db.select().from(creditCards).where(eq(creditCards.id, existing.id)).limit(1);
  return ok(row);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const existing = await loadOwned(auth.userId, params.id);
  if (!existing) return fail(404, "Card not found");

  const url = new URL(req.url);
  const hard = url.searchParams.get("hard") === "1";

  if (!hard) {
    // Default: archive. Hides from pickers; existing transactions keep the FK.
    await db
      .update(creditCards)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(creditCards.id, existing.id), eq(creditCards.userId, auth.userId)));
    return ok({ id: existing.id, archived: true });
  }

  // Hard delete: only if no transactions reference the card. This keeps
  // history intact even when the user "wants it gone" — they must first
  // re-home or delete those transactions.
  const [cnt] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(transactions)
    .where(and(eq(transactions.userId, auth.userId), eq(transactions.creditCardId, existing.id)));
  if (Number(cnt?.count ?? 0) > 0) {
    return fail(
      409,
      "Card has transactions — archive it, or delete/reassign the transactions first.",
    );
  }

  await db
    .delete(creditCards)
    .where(and(eq(creditCards.id, existing.id), eq(creditCards.userId, auth.userId)));
  return ok({ id: existing.id, deleted: true });
}
