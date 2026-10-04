import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { transactionBulkDeleteSchema } from "@/lib/validations/transaction";
import { ok, zodFail, requireUser } from "@/lib/api";
import { recomputeCardCycleAllocations } from "@/lib/credit-card-allocation";
import { guardReconciled } from "@/lib/reconcile-lock";
import type { BulkDeletedDTO } from "@/types";

export async function DELETE(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = transactionBulkDeleteSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);

  const owned = and(eq(transactions.userId, auth.userId), inArray(transactions.id, parsed.data.ids));
  const targets = await db
    .select({ date: transactions.date, accountId: transactions.accountId, transferAccountId: transactions.transferAccountId })
    .from(transactions)
    .where(owned);
  const blocked = await guardReconciled(req, auth.userId, targets);
  if (blocked) return blocked;

  const deleted = await db
    .delete(transactions)
    .where(owned)
    .returning();

  // Deleted card payments change what each statement cycle has been paid.
  const cardIds = new Set(
    deleted.filter((t) => t.type === "transfer" && t.creditCardId).map((t) => t.creditCardId!),
  );
  for (const cardId of cardIds) await recomputeCardCycleAllocations(db, auth.userId, cardId);

  return ok({ deleted: deleted.length } satisfies BulkDeletedDTO);
}
