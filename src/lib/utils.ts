import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "USD", signed = false): string {
  const abs = Math.abs(amount);
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  if (!signed) return formatted;
  if (amount === 0) return formatted;
  return amount > 0 ? `+${formatted}` : `-${formatted}`;
}

export function formatCompactCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function percentChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function dateFromSeconds(v: number | Date | string): Date {
  if (v instanceof Date) return v;
  if (typeof v === "string") return new Date(v);
  return new Date(v * 1000);
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  credit_card: "Credit Card",
  debit_card: "Debit Card",
  bank_transfer: "Bank Transfer",
  upi: "UPI",
  other: "Other",
};

export function paymentMethodLabel(v: string): string {
  return PAYMENT_METHOD_LABELS[v] ?? v;
}

export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
  loan_given: "Loan Given",
  loan_taken: "Loan Taken",
  repayment_received: "Repayment In",
  repayment_made: "Repayment Out",
};

export function transactionTypeLabel(v: string): string {
  return TRANSACTION_TYPE_LABELS[v] ?? v;
}

// Types where money flows INTO the user's wallet
const INFLOW_TYPES = new Set(["income", "loan_taken", "repayment_received"]);
// Types where money flows OUT of the user's wallet
const OUTFLOW_TYPES = new Set(["expense", "loan_given", "repayment_made"]);
// Loan-related types (don't count as real income/expense)
const LOAN_TYPES = new Set(["loan_given", "loan_taken", "repayment_received", "repayment_made"]);

export function isInflow(type: string): boolean {
  return INFLOW_TYPES.has(type);
}
export function isOutflow(type: string): boolean {
  return OUTFLOW_TYPES.has(type);
}
export function isLoanType(type: string): boolean {
  return LOAN_TYPES.has(type);
}

/**
 * Which category type should a given transaction type be paired with?
 * - income / loan_taken / repayment_received map to "income" (conceptually inflows) — BUT loans get their own category type
 * - expense / loan_given / repayment_made map to "expense" — BUT loans get their own category type
 *
 * All four loan-related transaction types use the "loan" category type.
 */
export function categoryTypeForTransactionType(type: string): "expense" | "income" | "loan" {
  if (LOAN_TYPES.has(type)) return "loan";
  if (type === "income") return "income";
  return "expense";
}

export const CURRENCIES = [
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
  { code: "CAD", symbol: "$", name: "Canadian Dollar" },
  { code: "AUD", symbol: "$", name: "Australian Dollar" },
];

export function currencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? "$";
}
