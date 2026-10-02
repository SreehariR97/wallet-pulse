import { z } from "zod";
import { isRealCivilDate } from "@/lib/civil-date";

export { isRealCivilDate };

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
