/**
 * Soft lock on reconciled periods.
 *
 * A transaction is *reconciled* when it's linked to an account (as source
 * or destination) and dated on or before that account's latest
 * reconciliation. Derived, not stored: nothing to backfill, nothing to go
 * stale, and it's exactly what reconciliationStatus() checks for drift.
 *
 * A write that would change a reconciled balance — creating, deleting, or
 * editing the amount/date/type/accounts of such a transaction, or changing
 * a reconciled account's opening balance — is refused with 409 and
 * `details.reconciled` naming the accounts, unless the request carries the
 * CONFIRM_RECONCILED_HEADER (the UI asks first, then retries with it).
 * Edits that don't touch the balance (description, category, notes, tags…)
 * always go through.
 */
import { and, eq, inArray, max, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountReconciliations, accounts, transactions } from "@/lib/db/schema";
import { fail } from "@/lib/api";

export const CONFIRM_RECONCILED_HEADER = "x-confirm-reconciled";

/** The fields that decide which account balances a transaction moves, and when. */
export interface LedgerState {
  type: string;
  amount: string | number;
  date: string;
  accountId: string | null;
  transferAccountId: string | null;
}

export function confirmedReconciled(req: Request): boolean {
  return req.headers.get(CONFIRM_RECONCILED_HEADER) === "1";
}

/** Did an edit change anything that moves an account balance? */
export function balanceChanged(before: LedgerState, after: LedgerState): boolean {
  return (
    before.type !== after.type ||
    Number(before.amount) !== Number(after.amount) ||
    before.date !== after.date ||
    before.accountId !== after.accountId ||
    before.transferAccountId !== after.transferAccountId
  );
}

interface Lock {
  name: string;
  through: string;
}

/** Latest reconciled date (and name) per account, for the given accounts. */
export async function reconciledThrough(userId: string, accountIds: string[]): Promise<Map<string, Lock>> {
  const out = new Map<string, Lock>();
  const ids = Array.from(new Set(accountIds));
  if (ids.length === 0) return out;
  const rows = await db
    .select({
      accountId: accountReconciliations.accountId,
      name: accounts.name,
      through: max(accountReconciliations.statementDate),
    })
    .from(accountReconciliations)
    .innerJoin(accounts, eq(accounts.id, accountReconciliations.accountId))
    .where(and(eq(accountReconciliations.userId, userId), inArray(accountReconciliations.accountId, ids)))
    .groupBy(accountReconciliations.accountId, accounts.name);
  for (const r of rows) if (r.through) out.set(r.accountId, { name: r.name, through: r.through });
  return out;
}

/** "Checking (reconciled through 2026-10-03)" for each account a set of ledger states touches inside its lock. */
export async function reconciledConflicts(
  userId: string,
  states: Array<Pick<LedgerState, "date" | "accountId" | "transferAccountId">>,
): Promise<string[]> {
  const ids = states.flatMap((s) => [s.accountId, s.transferAccountId]).filter((v): v is string => !!v);
  const locks = await reconciledThrough(userId, ids);
  if (locks.size === 0) return [];
  const hit = new Set<string>();
  for (const s of states) {
    for (const id of [s.accountId, s.transferAccountId]) {
      const lock = id ? locks.get(id) : undefined;
      if (lock && s.date <= lock.through) hit.add(id!);
    }
  }
  return Array.from(hit, (id) => {
    const lock = locks.get(id)!;
    return `${lock.name} (reconciled through ${lock.through})`;
  });
}

function refusal(conflicts: string[]): Response {
  return fail(
    409,
    conflicts.length === 1
      ? `This changes ${conflicts[0]}. Confirm to change a reconciled period.`
      : `This changes ${conflicts.length} reconciled accounts. Confirm to change a reconciled period.`,
    { reconciled: conflicts },
  );
}

/**
 * Guard a write. `states` are every before- and after-state whose balance
 * effect changes (callers skip edits where balanceChanged() is false).
 * Returns the 409 to send, or null to proceed.
 */
export async function guardReconciled(
  req: Request,
  userId: string,
  states: Array<Pick<LedgerState, "date" | "accountId" | "transferAccountId">>,
): Promise<Response | null> {
  if (states.length === 0 || confirmedReconciled(req)) return null;
  const conflicts = await reconciledConflicts(userId, states);
  return conflicts.length ? refusal(conflicts) : null;
}

/** Guard an opening-balance change: it shifts every reconciled balance on the account. */
export async function guardOpeningBalance(req: Request, userId: string, accountId: string): Promise<Response | null> {
  if (confirmedReconciled(req)) return null;
  const lock = (await reconciledThrough(userId, [accountId])).get(accountId);
  return lock ? refusal([`${lock.name} (reconciled through ${lock.through})`]) : null;
}

/**
 * SQL boolean: is this transaction row inside a reconciled period of an
 * account it's linked to? For list responses (lock badge).
 */
export const isReconciledSql: SQL<boolean> = sql<boolean>`EXISTS (
  SELECT 1 FROM ${accountReconciliations} r
  WHERE r.user_id = ${transactions.userId}
    AND r.account_id IN (${transactions.accountId}, ${transactions.transferAccountId})
    AND r.statement_date >= ${transactions.date}
)`;
