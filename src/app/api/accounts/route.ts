import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, asc, eq } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { accounts, transactions } from "@/lib/db/schema";
import { accountCreateSchema } from "@/lib/validations/account";
import { fail, ok, zodFail, requireUser, isUniqueViolation } from "@/lib/api";
import { accountTotals, claimableByNewAccount } from "@/lib/accounts";
import { toAccountDTO } from "@/lib/dto";
import type { AccountDTO, AccountListItemDTO } from "@/types";

/** GET /api/accounts[?includeArchived=1] — accounts with live balances. */
export async function GET(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const includeArchived = new URL(req.url).searchParams.get("includeArchived") === "1";

  const rows = await db
    .select()
    .from(accounts)
    .where(includeArchived ? eq(accounts.userId, auth.userId) : and(eq(accounts.userId, auth.userId), eq(accounts.isActive, true)))
    .orderBy(asc(accounts.sortOrder), asc(accounts.name));
  const totals = await accountTotals(
    auth.userId,
    rows.map((r) => r.id),
  );

  const items: AccountListItemDTO[] = rows.map((a) => ({
    ...toAccountDTO(a),
    balance: totals.get(a.id)?.balance ?? Number(a.openingBalance),
    transactionCount: totals.get(a.id)?.transactionCount ?? 0,
  }));
  return ok(items satisfies AccountListItemDTO[]);
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = accountCreateSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);
  const a = parsed.data;

  const values = {
    id: randomUUID(),
    userId: auth.userId,
    name: a.name,
    type: a.type,
    institution: a.institution || null,
    last4: a.last4 || null,
    openingBalance: a.openingBalance.toFixed(2),
    sortOrder: a.sortOrder,
  };

  try {
    let row: typeof accounts.$inferSelect;
    if (!a.claimUnassigned) {
      [row] = await db.insert(accounts).values(values).returning();
    } else {
      // Create the account and adopt existing unassigned transactions in
      // one atomic unit. Dispatch per CLAUDE.md.
      const claim = claimableByNewAccount(auth.userId);
      const maybeBatch = db as { batch?: unknown };
      if (typeof maybeBatch.batch === "function") {
        const neonDb = db as NeonHttpDatabase<typeof schema>;
        const [inserted] = await neonDb.batch([
          neonDb.insert(accounts).values(values).returning(),
          neonDb.update(transactions).set({ accountId: values.id }).where(claim),
        ]);
        row = inserted[0];
      } else {
        row = await db.transaction(async (trx) => {
          const [inserted] = await trx.insert(accounts).values(values).returning();
          await trx.update(transactions).set({ accountId: values.id }).where(claim);
          return inserted;
        });
      }
    }
    return NextResponse.json({ data: toAccountDTO(row) satisfies AccountDTO }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) return fail(409, "You already have an account with this name");
    throw err;
  }
}
