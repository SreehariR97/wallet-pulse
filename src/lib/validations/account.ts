import { z } from "zod";
import { MAX_MONEY } from "./common";

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
