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
