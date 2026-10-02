import { z } from "zod";

/**
 * A real calendar date in YYYY-MM-DD form. The regex alone accepts
 * "2026-02-31", which Postgres rejects with a 500 at insert time — the
 * round-trip through Date.UTC catches impossible days and months here.
 */
export function isoDate(message = "Invalid date (expected YYYY-MM-DD)") {
  return z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, message)
    .refine(isRealCivilDate, message);
}

export function isRealCivilDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Largest value numeric(14,2) can hold. */
export const MAX_MONEY = 99999999999.99;

/**
 * A positive money amount. `.positive()` let 0.001 through, which numeric(14,2)
 * rounds to 0.00 — now rejected by the amount > 0 CHECK constraints.
 */
export function moneyAmount(label = "Amount") {
  return z.coerce
    .number()
    .min(0.01, `${label} must be at least 0.01`)
    .max(MAX_MONEY, `${label} exceeds maximum value`);
}
