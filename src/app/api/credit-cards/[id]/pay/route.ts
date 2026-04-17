/**
 * POST /api/credit-cards/[id]/pay
 *
 * Shortcut to record a card repayment. Creates a transfer transaction
 * attached to the "Credit Card Payment" category, with creditCardId set to
 * this card. Amount positive; reduces the card's computed balance.
 *
 * Card ownership is re-verified here — do not rely on the FK to gate access.
 */
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, creditCards, transactions } from "@/lib/db/schema";
import { creditCardPaySchema } from "@/lib/validations/credit-card";
import { TRANSFER_CATEGORY_NAMES } from "@/lib/db/defaults";
import { ok, fail, zodFail, requireUser } from "@/lib/api";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const [card] = await db
    .select()
    .from(creditCards)
    .where(and(eq(creditCards.id, params.id), eq(creditCards.userId, auth.userId)))
    .limit(1);
  if (!card) return fail(404, "Card not found");

  const body = await req.json().catch(() => null);
  const parsed = creditCardPaySchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);
  const p = parsed.data;

  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.userId, auth.userId),
        eq(categories.name, TRANSFER_CATEGORY_NAMES.creditCardPayment),
      ),
    )
    .limit(1);
  if (!cat) {
    return fail(
      409,
      "Missing 'Credit Card Payment' category. Run scripts/backfill-transfer-categories.ts.",
    );
  }

  const id = randomUUID();
  await db.insert(transactions).values({
    id,
    userId: auth.userId,
    categoryId: cat.id,
    type: "transfer",
    amount: p.amount,
    currency: auth.user.currency ?? "USD",
    description: `Payment to ${card.name}`,
    notes: p.notes ?? null,
    date: new Date(p.date + "T12:00:00.000Z"),
    paymentMethod: "bank_transfer",
    creditCardId: card.id,
  });

  const [row] = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
  return ok(row, { created: true });
}
