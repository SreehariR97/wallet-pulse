import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";

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

/**
 * Format an amount with full precision when it fits comfortably in a card,
 * and switch to compact notation ("$10M") once the magnitude crosses
 * `compactThreshold` (default 1,000,000). Use this anywhere the container
 * has a fixed width and a value like `$10,000,000.00` would clip — pair
 * with a `title={formatCurrency(...)}` for the precise value on hover.
 */
export function formatCurrencyAuto(
  amount: number,
  currency = "USD",
  options?: { signed?: boolean; compactThreshold?: number },
): string {
  const { signed = false, compactThreshold = 1_000_000 } = options ?? {};
  if (Math.abs(amount) < compactThreshold) {
    return formatCurrency(amount, currency, signed);
  }
  const compact = formatCompactCurrency(Math.abs(amount), currency);
  if (!signed || amount === 0) return compact;
  return amount > 0 ? `+${compact}` : `-${compact}`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Render an FX rate without showing sloppy trailing zeros. If the value
 * rounds losslessly to 2 decimals (e.g. `83.120000`), display as `83.12`.
 * Otherwise show up to 6 decimals (the column's storage precision) with
 * trailing zeros stripped (e.g. `83.123456` stays full, `83.100000` shows
 * as `83.10` because 2dp is already lossless).
 *
 * Input is the Number cast the API does when returning numeric() strings
 * — not the raw string from pg. Handles float-drift artifacts like
 * 83.129999999999999 by letting toFixed round them away.
 */
export function formatFxRate(n: number): string {
  const fixed2 = n.toFixed(2);
  const fixed6 = n.toFixed(6);
  if (Number(fixed2) === Number(fixed6)) return fixed2;
  return fixed6.replace(/\.?0+$/, "");
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

/**
 * Format a civil date (calendar day, no timezone) for display.
 *
 * Accepts `"YYYY-MM-DD"` strings (how the API now serves transaction and
 * budget dates) or Date objects (legacy/instant inputs). For strings, the
 * day is parsed and reconstructed as noon *local time* before formatting —
 * noon avoids DST edge cases, and "local time" here only affects the
 * rendered format, not which calendar day is shown.
 *
 * Only use this for transaction/budget dates. For `createdAt`/`updatedAt`
 * (true instants), keep using `dateFromSeconds` + `format`.
 */
export function formatCivilDate(input: string | Date | number, fmtStr: string): string {
  if (typeof input === "string") {
    const [year, month, day] = input.split("-").map(Number);
    return format(new Date(year, month - 1, day, 12, 0, 0, 0), fmtStr);
  }
  return format(dateFromSeconds(input), fmtStr);
}

/**
 * Format an ISO timestamp as a calendar day in UTC. Used for statement
 * cycle boundaries: the server returns midnight-UTC / 23:59-UTC markers,
 * which get rendered as the "wrong" day for users east/west of UTC when
 * formatted via local time. Keeping the calendar day in UTC preserves the
 * intended semantic boundary across timezones.
 */
const UTC_DAY_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const UTC_DAY_YEAR_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
export function formatUtcDay(iso: string | Date, withYear = false): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  return (withYear ? UTC_DAY_YEAR_FMT : UTC_DAY_FMT).format(d);
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
 * Transfer transactions (card payments, remittances) use the "transfer"
 * category type — seeded as system-only categories.
 */
export function categoryTypeForTransactionType(type: string): "expense" | "income" | "loan" | "transfer" {
  if (LOAN_TYPES.has(type)) return "loan";
  if (type === "transfer") return "transfer";
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
