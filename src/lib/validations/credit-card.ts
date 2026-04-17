import { z } from "zod";

const dayOfMonth = z.coerce.number().int().min(1).max(31);

export const creditCardCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  issuer: z.string().min(1, "Issuer is required").max(80),
  last4: z
    .string()
    .regex(/^\d{4}$/, "Last 4 must be exactly 4 digits")
    .optional()
    .nullable(),
  creditLimit: z.coerce.number().positive("Credit limit must be greater than 0"),
  statementDay: dayOfMonth,
  paymentDueDay: dayOfMonth,
  // Allow 0..100; default 2% matches the minimumPaymentPercent DB default.
  minimumPaymentPercent: z.coerce.number().min(0).max(100).default(2),
  sortOrder: z.coerce.number().default(0),
});

export const creditCardUpdateSchema = creditCardCreateSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });

export const creditCardPaySchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  notes: z.string().max(2000).optional().nullable(),
});

export const cycleQuerySchema = z.object({
  // period: "current" (offset 0) | "previous" (offset 1) | an explicit
  // non-negative integer offset (0 = current, 1 = previous, 2 = two back, ...).
  period: z
    .union([z.literal("current"), z.literal("previous"), z.coerce.number().int().min(0)])
    .default("current"),
});

export type CreditCardCreateInput = z.infer<typeof creditCardCreateSchema>;
export type CreditCardUpdateInput = z.infer<typeof creditCardUpdateSchema>;
export type CreditCardPayInput = z.infer<typeof creditCardPaySchema>;
