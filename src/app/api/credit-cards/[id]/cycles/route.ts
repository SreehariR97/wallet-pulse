/**
 * GET /api/credit-cards/:id/cycles — full cycle history for one card, most
 * recent first. Phase 3 introduces this endpoint so the detail view can
 * render a cycle-history list (current + past statements). No pagination:
 * realistic users have at most 12–24 cycles per card.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { creditCards, creditCardCycles } from "@/lib/db/schema";
import { ok, fail, requireUser } from "@/lib/api";
import type { CreditCardCycleRowDTO } from "@/types";

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

  const rows = await db
    .select()
    .from(creditCardCycles)
    .where(eq(creditCardCycles.cardId, card.id))
    .orderBy(desc(creditCardCycles.cycleCloseDate), desc(creditCardCycles.createdAt));

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
  }));

  return ok(items satisfies CreditCardCycleRowDTO[]);
}
