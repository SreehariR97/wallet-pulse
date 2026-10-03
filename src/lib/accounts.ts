import { and, eq, inArray, isNotNull, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountReconciliations, accounts, transactions } from "@/lib/db/schema";
import type { TxType } from "@/types";

/**
 * How a transaction moves money in its `account_id`:
 *  - in:  income, loan_taken, repayment_received
 *  - out: expense, loan_given, repayment_made, transfer (card payments,
 *         remittances, and moves to another account)
 * A transfer's `transfer_account_id` receives the same amount. A transfer
 * with only `transfer_account_id` is money arriving from outside your
 * accounts (e.g. a positive balance adjustment from reconciling).
 *
 * Card-paid expenses carry no account (the card is the instrument); the
 * money leaves an account when the card is paid, as a transfer.
 */
export const INFLOW_TYPES = ["income", "loan_taken", "repayment_received"] as const satisfies readonly TxType[];

const inflowList = sql.raw(INFLOW_TYPES.map((t) => `'${t}'`).join(", "));

/** Signed effect of a transaction on its `account_id` (SQL). */
export const signedAmountForAccount = sql`CASE WHEN ${transactions.type} IN (${inflowList}) THEN ${transactions.amount} ELSE -${transactions.amount} END`;

export interface AccountTotals {
  balance: number;
  transactionCount: number;
}

/**
 * Balance of each of the user's accounts: opening balance plus every signed
 * transaction on it, plus transfers into it — as of `asOf` (inclusive) when
 * given, otherwise today. Three queries regardless of how many accounts.
 */
export async function accountTotals(
  userId: string,
  accountIds: string[],
  asOf?: string,
): Promise<Map<string, AccountTotals>> {
  const result = new Map<string, AccountTotals>();
  if (accountIds.length === 0) return result;

  const [rows, own, incoming] = await Promise.all([
    db
      .select({ id: accounts.id, opening: accounts.openingBalance })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), inArray(accounts.id, accountIds))),
    db
      .select({
        accountId: transactions.accountId,
        delta: sql<string>`COALESCE(SUM(${signedAmountForAccount}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          inArray(transactions.accountId, accountIds),
          asOf ? lte(transactions.date, asOf) : undefined,
        ),
      )
      .groupBy(transactions.accountId),
    db
      .select({
        accountId: transactions.transferAccountId,
        total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          isNotNull(transactions.transferAccountId),
          inArray(transactions.transferAccountId, accountIds),
          asOf ? lte(transactions.date, asOf) : undefined,
        ),
      )
      .groupBy(transactions.transferAccountId),
  ]);

  for (const r of rows) result.set(r.id, { balance: Number(r.opening), transactionCount: 0 });
  for (const r of own) {
    const t = r.accountId ? result.get(r.accountId) : undefined;
    if (t) {
      t.balance += Number(r.delta);
      t.transactionCount += Number(r.count);
    }
  }
  for (const r of incoming) {
    const t = r.accountId ? result.get(r.accountId) : undefined;
    if (t) {
      t.balance += Number(r.total);
      t.transactionCount += Number(r.count);
    }
  }
  // Sums are exact in SQL; round away float noise from the final additions.
  for (const t of result.values()) t.balance = Math.round(t.balance * 100) / 100;
  return result;
}

export interface AccountLinkInput {
  type: TxType;
  creditCardId: string | null;
  accountId: string | null;
  transferAccountId: string | null;
}

/**
 * Validate the account fields of a transaction write. Returns an error
 * message for a 400, or null. Accounts must belong to the user; linking to
 * an archived account is refused, but a transaction already on one keeps
 * it (`previous`), mirroring the credit-card rule.
 */
export async function validateAccountLinks(
  userId: string,
  next: AccountLinkInput,
  previous?: Pick<AccountLinkInput, "accountId" | "transferAccountId">,
): Promise<string | null> {
  if (next.type === "expense" && next.creditCardId && next.accountId) {
    return "A card-paid expense can't also come from an account; the account is charged when you pay the card";
  }
  if (next.transferAccountId) {
    if (next.type !== "transfer") return "Only transfers can move money to another account";
    if (next.creditCardId) return "A card payment can't also be a transfer to another account";
    // No source account is fine: money arriving from outside your accounts.
    if (next.accountId === next.transferAccountId) return "Choose two different accounts";
  }

  const ids = [next.accountId, next.transferAccountId].filter((v): v is string => !!v);
  if (ids.length === 0) return null;
  const owned = await db
    .select({ id: accounts.id, isActive: accounts.isActive })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), inArray(accounts.id, ids)));
  const byId = new Map(owned.map((a) => [a.id, a]));
  const kept = new Set([previous?.accountId, previous?.transferAccountId].filter(Boolean));
  for (const id of ids) {
    const a = byId.get(id);
    if (!a) return "Invalid account";
    if (!a.isActive && !kept.has(id)) return "That account is archived";
  }
  return null;
}

/** Rows a newly created account can adopt: everything not tied to an account or paid by card. */
export function claimableByNewAccount(userId: string): SQL | undefined {
  return and(
    eq(transactions.userId, userId),
    sql`${transactions.accountId} IS NULL`,
    sql`${transactions.transferAccountId} IS NULL`,
    sql`NOT (${transactions.type} = 'expense' AND ${transactions.creditCardId} IS NOT NULL)`,
  );
}

export interface ReconciliationStatus {
  statementDate: string;
  statementBalance: number;
  /** The balance WalletPulse computes for that date right now. */
  balanceNow: number;
}

/**
 * Each account's latest reconciliation, with the balance recomputed for its
 * statement date today. If someone has since edited or added a transaction
 * on or before that date, `balanceNow` no longer equals `statementBalance`.
 * One query (Postgres DISTINCT ON).
 */
export async function reconciliationStatus(userId: string): Promise<Map<string, ReconciliationStatus>> {
  const inflow = inflowList;
  const res = await db.execute<{
    account_id: string;
    statement_date: string;
    statement_balance: string;
    balance_now: string;
  }>(sql`
    SELECT r.account_id, r.statement_date::text AS statement_date, r.statement_balance,
      a.opening_balance
        + COALESCE((SELECT SUM(CASE WHEN t.type IN (${inflow}) THEN t.amount ELSE -t.amount END)
                    FROM ${transactions} t
                    WHERE t.user_id = ${userId} AND t.account_id = r.account_id AND t.date <= r.statement_date), 0)
        + COALESCE((SELECT SUM(t.amount)
                    FROM ${transactions} t
                    WHERE t.user_id = ${userId} AND t.transfer_account_id = r.account_id AND t.date <= r.statement_date), 0)
        AS balance_now
    FROM (
      SELECT DISTINCT ON (account_id) account_id, statement_date, statement_balance
      FROM ${accountReconciliations}
      WHERE user_id = ${userId}
      ORDER BY account_id, statement_date DESC, created_at DESC
    ) r
    JOIN ${accounts} a ON a.id = r.account_id
  `);
  const out = new Map<string, ReconciliationStatus>();
  for (const r of res.rows) {
    out.set(r.account_id, {
      statementDate: r.statement_date,
      statementBalance: Number(r.statement_balance),
      balanceNow: Math.round(Number(r.balance_now) * 100) / 100,
    });
  }
  return out;
}
