/**
 * Reconcile an account against a bank statement.
 *
 * GET  ?date=YYYY-MM-DD — WalletPulse's balance for that date, plus history.
 * POST { statementDate, statementBalance, adjust, expectedBalance? } — record
 *   the check; if the balances differ and `adjust` is set, add a "Balance
 *   Adjustment" transfer dated statementDate for the difference, atomically
 *   with the record (batch/transaction dispatch per CLAUDE.md).
 *
 * The adjustment is a transfer so it never counts as spending or income:
 * out of the account (account_id) when WalletPulse is too high, into it from
 * outside (transfer_account_id only) when too low.
 */
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { accountReconciliations, accounts, categories, transactions } from "@/lib/db/schema";
import { accountReconcileQuerySchema, accountReconcileSchema } from "@/lib/validations/account";
import { fail, ok, zodFail, requireUser } from "@/lib/api";
import { accountTotals } from "@/lib/accounts";
import { DEFAULT_CATEGORIES, TRANSFER_CATEGORY_NAMES } from "@/lib/db/defaults";
import { toReconciliationDTO, toTransactionDTO } from "@/lib/dto";
import { formatCurrency } from "@/lib/utils";
import type { AccountReconcilePreviewDTO, AccountReconcileResultDTO } from "@/types";

const HISTORY_LIMIT = 10;

async function ownedAccount(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
    .limit(1);
  return row ?? null;
}

async function balanceOn(userId: string, accountId: string, date: string, opening: string): Promise<number> {
  const totals = await accountTotals(userId, [accountId], date);
  return totals.get(accountId)?.balance ?? Number(opening);
}

/** The user's Balance Adjustment category, recreated if they deleted it. */
async function adjustmentCategoryId(userId: string): Promise<string> {
  const name = TRANSFER_CATEGORY_NAMES.balanceAdjustment;
  const find = () =>
    db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.type, "transfer"), eq(categories.name, name)))
      .limit(1);
  const [found] = await find();
  if (found) return found.id;
  const def = DEFAULT_CATEGORIES.find((c) => c.name === name)!;
  // A concurrent request may insert it too; the default-name unique index
  // turns the loser into a no-op and the re-select finds the winner's row.
  await db
    .insert(categories)
    .values({ id: randomUUID(), userId, name, icon: def.icon, color: def.color, type: "transfer", isDefault: true })
    .onConflictDoNothing();
  const [created] = await find();
  return created!.id;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const parsed = accountReconcileQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return zodFail(parsed.error);

  const account = await ownedAccount(auth.userId, params.id);
  if (!account) return fail(404, "Account not found");

  const [balance, history] = await Promise.all([
    balanceOn(auth.userId, account.id, parsed.data.date, account.openingBalance),
    db
      .select()
      .from(accountReconciliations)
      .where(and(eq(accountReconciliations.accountId, account.id), eq(accountReconciliations.userId, auth.userId)))
      .orderBy(desc(accountReconciliations.statementDate), desc(accountReconciliations.createdAt))
      .limit(HISTORY_LIMIT),
  ]);
  return ok({
    date: parsed.data.date,
    balance,
    history: history.map(toReconciliationDTO),
  } satisfies AccountReconcilePreviewDTO);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => null);
  const parsed = accountReconcileSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);
  const r = parsed.data;

  const account = await ownedAccount(auth.userId, params.id);
  if (!account) return fail(404, "Account not found");
  if (!account.isActive) return fail(400, "That account is archived");

  const computed = await balanceOn(auth.userId, account.id, r.statementDate, account.openingBalance);
  if (r.expectedBalance !== undefined && Math.abs(r.expectedBalance - computed) >= 0.005) {
    return fail(409, "This account's balance for that date changed. Review the difference and try again.");
  }
  const difference = Math.round((r.statementBalance - computed) * 100) / 100;
  const currency = auth.user.currency ?? "USD";

  let txValues: typeof transactions.$inferInsert | null = null;
  if (r.adjust && difference !== 0) {
    txValues = {
      id: randomUUID(),
      userId: auth.userId,
      categoryId: await adjustmentCategoryId(auth.userId),
      type: "transfer",
      amount: Math.abs(difference).toFixed(2),
      currency,
      description: `Balance adjustment · ${account.name}`,
      notes: `Reconciled to a statement balance of ${formatCurrency(r.statementBalance, currency, r.statementBalance < 0)} on ${r.statementDate}.`,
      date: r.statementDate,
      paymentMethod: "other",
      // Too low → money in from outside; too high → money out.
      accountId: difference < 0 ? account.id : null,
      transferAccountId: difference > 0 ? account.id : null,
    };
  }
  const reconValues = {
    id: randomUUID(),
    userId: auth.userId,
    accountId: account.id,
    statementDate: r.statementDate,
    statementBalance: r.statementBalance.toFixed(2),
    computedBalance: computed.toFixed(2),
    adjustmentTransactionId: txValues?.id ?? null,
  };

  let recon: typeof accountReconciliations.$inferSelect;
  let tx: typeof transactions.$inferSelect | null = null;
  if (!txValues) {
    [recon] = await db.insert(accountReconciliations).values(reconValues).returning();
  } else {
    const maybeBatch = db as { batch?: unknown };
    if (typeof maybeBatch.batch === "function") {
      const neonDb = db as NeonHttpDatabase<typeof schema>;
      const [txRows, reconRows] = await neonDb.batch([
        neonDb.insert(transactions).values(txValues).returning(),
        neonDb.insert(accountReconciliations).values(reconValues).returning(),
      ]);
      tx = txRows[0];
      recon = reconRows[0];
    } else {
      const values = txValues;
      ({ tx, recon } = await db.transaction(async (trx) => {
        const [t] = await trx.insert(transactions).values(values).returning();
        const [rc] = await trx.insert(accountReconciliations).values(reconValues).returning();
        return { tx: t, recon: rc };
      }));
    }
  }

  return NextResponse.json(
    {
      data: {
        reconciliation: toReconciliationDTO(recon),
        adjustment: tx ? toTransactionDTO(tx) : null,
      } satisfies AccountReconcileResultDTO,
    },
    { status: 201 },
  );
}
