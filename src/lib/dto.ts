import type { accountReconciliations, accounts, transactions } from "@/lib/db/schema";
import type { AccountDTO, AccountReconciliationDTO, TransactionDTO } from "@/types";

/** Transactions row → API DTO (money coerced to number, dates to ISO). */
export function toTransactionDTO(t: typeof transactions.$inferSelect): TransactionDTO {
  return {
    id: t.id,
    userId: t.userId,
    categoryId: t.categoryId,
    type: t.type,
    amount: Number(t.amount),
    currency: t.currency,
    description: t.description,
    notes: t.notes,
    date: t.date,
    paymentMethod: t.paymentMethod,
    creditCardId: t.creditCardId,
    accountId: t.accountId,
    transferAccountId: t.transferAccountId,
    isRecurring: t.isRecurring,
    recurringFrequency: t.recurringFrequency,
    tags: t.tags,
    receiptUrl: t.receiptUrl,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

/** Accounts row → API DTO. */
export function toAccountDTO(a: typeof accounts.$inferSelect): AccountDTO {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    institution: a.institution,
    last4: a.last4,
    openingBalance: Number(a.openingBalance),
    isActive: a.isActive,
    sortOrder: a.sortOrder,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

/** Reconciliation row → API DTO. */
export function toReconciliationDTO(r: typeof accountReconciliations.$inferSelect): AccountReconciliationDTO {
  const statementBalance = Number(r.statementBalance);
  const computedBalance = Number(r.computedBalance);
  return {
    id: r.id,
    accountId: r.accountId,
    statementDate: r.statementDate,
    statementBalance,
    computedBalance,
    difference: Math.round((statementBalance - computedBalance) * 100) / 100,
    adjustmentTransactionId: r.adjustmentTransactionId,
    createdAt: r.createdAt.toISOString(),
  };
}
