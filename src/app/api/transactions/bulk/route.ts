import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { transactionBulkDeleteSchema } from "@/lib/validations/transaction";
import { ok, zodFail, requireUser } from "@/lib/api";

export async function DELETE(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = transactionBulkDeleteSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);

  await db
    .delete(transactions)
    .where(and(eq(transactions.userId, auth.userId), inArray(transactions.id, parsed.data.ids)));

  return ok({ deleted: parsed.data.ids.length });
}
