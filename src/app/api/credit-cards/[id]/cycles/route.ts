/**
 * GET /api/credit-cards/:id/cycles — full cycle history for one card, most
 * recent first. Phase 3 introduces this endpoint so the detail view can
 * render a cycle-history list (current + past statements). No pagination:
 * realistic users have at most 12–24 cycles per card.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, creditCards, creditCardCycles, transactions } from "@/lib/db/schema";
import { ok, fail, requireUser } from "@/lib/api";
import { allocateCycleForPayment } from "@/lib/credit-cards";
import type { CreditCardCycleRowDTO, CreditCardCyclePaymentDTO } from "@/types";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  // Ownership check. 404 (not 403) for cross-tenant access — don't leak
  // existence of another user's card id.
  const [card] = await db
    .select({ id: creditCards.id })
    .from(creditCards)
    .where(and(eq(creditCards.id, params.id), eq(creditCards.userId, auth.userId)))
    .limit(1);
  if (!card) return fail(404, "Card not found");

  const [rows, payments] = await Promise.all([
    db
      .select()
      .from(creditCardCycles)
      .where(eq(creditCardCycles.cardId, card.id))
      .orderBy(desc(creditCardCycles.cycleCloseDate), desc(creditCardCycles.createdAt)),
    // Payments are transfers to the card (the pay route's shape).
    db
      .select({
        id: transactions.id,
        date: transactions.date,
        amount: transactions.amount,
        accountId: transactions.accountId,
        accountName: accounts.name,
      })
      .from(transactions)
      .leftJoin(accounts, eq(accounts.id, transactions.accountId))
      .where(
        and(
          eq(transactions.userId, auth.userId),
          eq(transactions.creditCardId, card.id),
          eq(transactions.type, "transfer"),
        ),
      )
      .orderBy(asc(transactions.date), asc(transactions.id)),
  ]);

  // Group payments by cycle with the same rule that sets amount_paid
  // (allocateCycleForPayment over cycles oldest-first; first match wins).
  // Read-only: amount_paid itself is only ever written by SQL.
  const oldestFirst = [...rows].reverse();
  const byCycle = new Map<string, CreditCardCyclePaymentDTO[]>();
  for (const p of payments) {
    const cycleId = allocateCycleForPayment(oldestFirst, p.date);
    if (!cycleId) continue;
    const list = byCycle.get(cycleId) ?? [];
    list.push({ id: p.id, date: p.date, amount: Number(p.amount), accountId: p.accountId, accountName: p.accountName });
    byCycle.set(cycleId, list);
  }

  const items: CreditCardCycleRowDTO[] = rows.map((r) => ({
    id: r.id,
    cardId: r.cardId,
    cycleCloseDate: r.cycleCloseDate,
    paymentDueDate: r.paymentDueDate,
    statementBalance: r.statementBalance === null ? null : Number(r.statementBalance),
    minimumPayment: r.minimumPayment === null ? null : Number(r.minimumPayment),
    amountPaid: Number(r.amountPaid),
    isProjected: r.isProjected,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    payments: byCycle.get(r.id) ?? [],
  }));

  return ok(items satisfies CreditCardCycleRowDTO[]);
}
