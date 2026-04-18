import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { creditCards, transactions } from "@/lib/db/schema";
import { creditCardUpdateSchema } from "@/lib/validations/credit-card";
import { ok, fail, zodFail, requireUser } from "@/lib/api";
import { getStatementCycle, getNextDueDate } from "@/lib/credit-cards";
import type {
  CreditCardDTO,
  CreditCardDetailDTO,
  ArchivedIdDTO,
  HardDeletedIdDTO,
} from "@/types";

type CreditCardPatch = Partial<
  Omit<typeof creditCards.$inferInsert, "id" | "userId" | "createdAt" | "updatedAt">
>;

function toCreditCardDTO(c: typeof creditCards.$inferSelect): CreditCardDTO {
  return {
    id: c.id,
    userId: c.userId,
    name: c.name,
    issuer: c.issuer,
    last4: c.last4,
    creditLimit: Number(c.creditLimit),
    statementDay: c.statementDay,
    paymentDueDay: c.paymentDueDay,
    minimumPaymentPercent: c.minimumPaymentPercent,
    isActive: c.isActive,
    sortOrder: c.sortOrder,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

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
  const creditLimit = Number(card.creditLimit);
  const utilizationPercent = creditLimit > 0 ? (balance / creditLimit) * 100 : 0;

  const now = new Date();
  const currentCycle = getStatementCycle(now, card.statementDay, 0);
  const nextDueDate = getNextDueDate(now, card.paymentDueDay);

  return ok({
    ...toCreditCardDTO(card),
    balance,
    utilizationPercent,
    totalExpense,
    totalPayments,
    currentCycleStart: currentCycle.start.toISOString(),
    currentCycleEnd: currentCycle.end.toISOString(),
    nextDueDate: nextDueDate.toISOString(),
    minPaymentEstimate: Math.max(0, balance) * (card.minimumPaymentPercent / 100),
  } satisfies CreditCardDetailDTO);
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

  const patch: CreditCardPatch = {
    ...(p.name !== undefined ? { name: p.name } : {}),
    ...(p.issuer !== undefined ? { issuer: p.issuer } : {}),
    ...(p.last4 !== undefined ? { last4: p.last4 } : {}),
    ...(p.creditLimit !== undefined ? { creditLimit: String(p.creditLimit) } : {}),
    ...(p.statementDay !== undefined ? { statementDay: p.statementDay } : {}),
    ...(p.paymentDueDay !== undefined ? { paymentDueDay: p.paymentDueDay } : {}),
    ...(p.minimumPaymentPercent !== undefined
      ? { minimumPaymentPercent: p.minimumPaymentPercent }
      : {}),
    ...(p.isActive !== undefined ? { isActive: p.isActive } : {}),
    ...(p.sortOrder !== undefined ? { sortOrder: p.sortOrder } : {}),
  };
  const [row] = await db
    .update(creditCards)
    .set(patch)
    .where(and(eq(creditCards.id, existing.id), eq(creditCards.userId, auth.userId)))
    .returning();
  return ok(toCreditCardDTO(row) satisfies CreditCardDTO);
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
      .set({ isActive: false })
      .where(and(eq(creditCards.id, existing.id), eq(creditCards.userId, auth.userId)));
    return ok({ id: existing.id, archived: true } satisfies ArchivedIdDTO);
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
  return ok({ id: existing.id, deleted: true } satisfies HardDeletedIdDTO);
}
