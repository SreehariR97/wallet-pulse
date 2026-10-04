import type { TxFilterValues } from "@/components/transactions/transaction-filters";
import type { AnalyticsView, PaymentMethod, TxType } from "@/types";
import { isRealCivilDate } from "@/lib/civil-date";

/**
 * Query-string <-> view state for the list pages. Parsing is defensive:
 * anything malformed in a hand-edited or stale URL falls back to the
 * default instead of producing a 400 from the API.
 */

type Params = Pick<URLSearchParams, "get">;

export type TxSortKey = "date" | "amount" | "description" | "createdAt";
export type TxSortOrder = "asc" | "desc";

export interface TransactionsUrlState {
  filters: TxFilterValues;
  search: string;
  sort: TxSortKey;
  order: TxSortOrder;
  page: number;
}

const SORT_KEYS: readonly TxSortKey[] = ["date", "amount", "description", "createdAt"];
// Plain lists rather than the Zod enums in validations/transaction.ts: this
// module runs in the browser, and importing Zod added ~15 kB per page.
// url-state.test.ts checks these stay in sync with the Zod enums.
export const TX_TYPES: readonly TxType[] = [
  "expense",
  "income",
  "transfer",
  "loan_given",
  "loan_taken",
  "repayment_received",
  "repayment_made",
];
export const PAYMENT_METHODS: readonly PaymentMethod[] = ["cash", "credit_card", "debit_card", "bank_transfer", "upi", "other"];

function oneOf<T extends string>(list: readonly T[], v: string | null): T | undefined {
  return v && (list as readonly string[]).includes(v) ? (v as T) : undefined;
}
const AMOUNT = /^\d{1,11}(\.\d{1,2})?$/;

function date(v: string | null): string | undefined {
  return v && isRealCivilDate(v) ? v : undefined;
}
function text(v: string | null, max: number): string | undefined {
  const t = v?.trim();
  return t ? t.slice(0, max) : undefined;
}

export function parseTransactionsUrl(sp: Params): TransactionsUrlState {
  const shortcut = sp.get("shortcut");
  const min = sp.get("minAmount");
  const max = sp.get("maxAmount");
  const sort = sp.get("sort") as TxSortKey | null;
  const page = Number(sp.get("page"));
  return {
    filters: {
      type: oneOf(TX_TYPES, sp.get("type")),
      paymentMethod: oneOf(PAYMENT_METHODS, sp.get("paymentMethod")),
      shortcut: shortcut === "card_payments" || shortcut === "remittances" ? shortcut : undefined,
      categoryId: text(sp.get("categoryId"), 64),
      creditCardId: text(sp.get("creditCardId"), 64),
      accountId: text(sp.get("accountId"), 64),
      from: date(sp.get("from")),
      to: date(sp.get("to")),
      minAmount: min && AMOUNT.test(min) ? min : undefined,
      maxAmount: max && AMOUNT.test(max) ? max : undefined,
      tags: text(sp.get("tags"), 500),
    },
    search: text(sp.get("q"), 200) ?? "",
    sort: sort && SORT_KEYS.includes(sort) ? sort : "date",
    order: sp.get("order") === "asc" ? "asc" : "desc",
    page: Number.isInteger(page) && page >= 1 && page <= 10000 ? page : 1,
  };
}

/** Defaults are omitted so a plain /transactions stays a plain URL. */
export function transactionsUrlParams(s: TransactionsUrlState): Record<string, string | undefined> {
  return {
    ...s.filters,
    q: s.search || undefined,
    sort: s.sort === "date" ? undefined : s.sort,
    order: s.order === "desc" ? undefined : s.order,
    page: s.page > 1 ? String(s.page) : undefined,
  };
}

/** Dashboard month: `?month=2026-04`. */
export function parseMonthParam(v: string | null): Date | undefined {
  const m = v ? /^(\d{4})-(\d{2})$/.exec(v) : null;
  if (!m) return undefined;
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? new Date(Number(m[1]), month - 1, 1) : undefined;
}

export const ANALYTICS_PRESETS = ["thisMonth", "last3", "last6", "thisYear", "lastYear", "all", "custom"] as const;
export type AnalyticsPreset = (typeof ANALYTICS_PRESETS)[number];

export interface AnalyticsUrlState {
  preset: AnalyticsPreset;
  from?: string;
  to?: string;
  view: AnalyticsView;
  accountId?: string;
}

/** `?range=last6&view=cashflow&account=<id>`; spending and all accounts are the defaults. */
export function parseAnalyticsUrl(sp: Params): AnalyticsUrlState {
  const range = sp.get("range") as AnalyticsPreset | null;
  const preset = range && ANALYTICS_PRESETS.includes(range) ? range : "thisMonth";
  const scope = {
    view: sp.get("view") === "cashflow" ? ("cashflow" as const) : ("spending" as const),
    accountId: text(sp.get("account"), 64),
  };
  return preset === "custom"
    ? { preset, from: date(sp.get("from")), to: date(sp.get("to")), ...scope }
    : { preset, ...scope };
}
