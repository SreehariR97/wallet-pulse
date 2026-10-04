import { z } from "zod";
import { MAX_MONEY, isoDate } from "./common";

export const accountTypeEnum = z.enum(["checking", "savings", "cash", "wallet", "other"]);

const fields = {
  name: z.string().trim().min(1, "Name is required").max(60),
  type: accountTypeEnum,
  institution: z.string().trim().max(80).optional().nullable(),
  last4: z
    .string()
    .regex(/^\d{4}$/, "Last 4 must be exactly 4 digits")
    .optional()
    .nullable(),
  // May be negative (an overdrawn account) — unlike transaction amounts.
  openingBalance: z.coerce.number().min(-MAX_MONEY).max(MAX_MONEY),
  sortOrder: z.coerce.number().min(-1e6).max(1e6),
};

export const accountCreateSchema = z.object({
  ...fields,
  type: fields.type.default("checking"),
  openingBalance: fields.openingBalance.default(0),
  sortOrder: fields.sortOrder.default(0),
  /** Move every unassigned, non-card transaction onto the new account. */
  claimUnassigned: z.boolean().default(false),
});

export const accountUpdateSchema = z.object({
  name: fields.name.optional(),
  type: fields.type.optional(),
  institution: fields.institution,
  last4: fields.last4,
  openingBalance: fields.openingBalance.optional(),
  sortOrder: fields.sortOrder.optional(),
  isActive: z.boolean().optional(),
});

export type AccountCreateInput = z.infer<typeof accountCreateSchema>;

/** A signed money value with at most two decimals (balances can be negative). */
const signedMoney = (label: string) =>
  z.coerce
    .number()
    .min(-MAX_MONEY, `${label} is out of range`)
    .max(MAX_MONEY, `${label} is out of range`)
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, `${label} can have at most 2 decimals`);

export const accountReconcileSchema = z.object({
  statementDate: isoDate(),
  statementBalance: signedMoney("Statement balance"),
  /** Add a Balance Adjustment transfer for any difference. */
  adjust: z.boolean().default(true),
  /**
   * The balance the user was shown for `statementDate`. If it changed before
   * they submitted (another tab, an import), refuse rather than adjust by a
   * stale difference.
   */
  expectedBalance: signedMoney("Expected balance").optional(),
});

export const accountReconcileQuerySchema = z.object({ date: isoDate() });
