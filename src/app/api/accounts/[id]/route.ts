import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { accountUpdateSchema } from "@/lib/validations/account";
import { fail, ok, zodFail, requireUser, isUniqueViolation } from "@/lib/api";
import { toAccountDTO } from "@/lib/dto";
import { guardOpeningBalance } from "@/lib/reconcile-lock";
import type { AccountDTO } from "@/types";

type AccountPatch = Partial<Omit<typeof accounts.$inferInsert, "id" | "userId" | "createdAt" | "updatedAt">>;

function ownedBy(id: string, userId: string) {
  return and(eq(accounts.id, id), eq(accounts.userId, userId));
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = accountUpdateSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);
  const p = parsed.data;

  const patch: AccountPatch = {};
  if (p.name !== undefined) patch.name = p.name;
  if (p.type !== undefined) patch.type = p.type;
  if (p.institution !== undefined) patch.institution = p.institution || null;
  if (p.last4 !== undefined) patch.last4 = p.last4 || null;
  if (p.openingBalance !== undefined) patch.openingBalance = p.openingBalance.toFixed(2);
  if (p.sortOrder !== undefined) patch.sortOrder = p.sortOrder;
  if (p.isActive !== undefined) patch.isActive = p.isActive;
  if (Object.keys(patch).length === 0) return fail(400, "Nothing to update");

  if (patch.openingBalance !== undefined) {
    const [current] = await db
      .select({ openingBalance: accounts.openingBalance })
      .from(accounts)
      .where(ownedBy(params.id, auth.userId))
      .limit(1);
    if (!current) return fail(404, "Account not found");
    // Shifts every balance the account was reconciled at.
    if (Number(current.openingBalance) !== Number(patch.openingBalance)) {
      const blocked = await guardOpeningBalance(req, auth.userId, params.id);
      if (blocked) return blocked;
    }
  }

  try {
    const [row] = await db.update(accounts).set(patch).where(ownedBy(params.id, auth.userId)).returning();
    if (!row) return fail(404, "Account not found");
    return ok(toAccountDTO(row) satisfies AccountDTO);
  } catch (err) {
    if (isUniqueViolation(err)) return fail(409, "You already have an account with this name");
    throw err;
  }
}

/**
 * Archives rather than deletes: transactions keep their link, so history
 * and past balances stay intact. Restore with PATCH { isActive: true }.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const [row] = await db
    .update(accounts)
    .set({ isActive: false })
    .where(ownedBy(params.id, auth.userId))
    .returning();
  if (!row) return fail(404, "Account not found");
  return ok(toAccountDTO(row) satisfies AccountDTO);
}
