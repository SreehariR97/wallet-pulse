import { z } from "zod";

// Phase 2 of the cycle-history migration: the form now collects real dates,
// not day-of-month integers. The server derives statementDay/paymentDueDay
// from the dates to keep the existing integer columns on credit_cards
// populated (dropped in Phase 5). statement_balance / minimum_payment are
// optional — when both are present, the cycle row is stored as real
// (isProjected=false); otherwise it's a projected framework.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date (expected YYYY-MM-DD)");

export const creditCardCreateSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(80),
    issuer: z.string().min(1, "Issuer is required").max(80),
    last4: z
      .string()
      .regex(/^\d{4}$/, "Last 4 must be exactly 4 digits")
      .optional()
      .nullable(),
    creditLimit: z.coerce
      .number()
      .positive("Credit limit must be greater than 0")
      .max(99999999999.99, "Credit limit exceeds maximum value"),
    lastStatementCloseDate: isoDate,
    paymentDueDate: isoDate,
    // Both optional. When both are present, the cycle row stores a real
    // statement; otherwise a projected framework.
    statementBalance: z.coerce.number().nonnegative().optional(),
    minimumPayment: z.coerce.number().nonnegative().optional(),
    // Fallback used when the stored cycle minimum is null.
    minimumPaymentPercent: z.coerce.number().min(0).max(100).default(2),
    sortOrder: z.coerce.number().default(0),
  })
  .refine((v) => v.paymentDueDate > v.lastStatementCloseDate, {
    message: "Payment due date must be after the statement close date",
    path: ["paymentDueDate"],
  });

// Not built from .partial() because .partial() strips .refine(). We re-state
// fields so we can attach an update-specific refine: dates must be paired
// (either both present or both absent) and due > close when present.
export const creditCardUpdateSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    issuer: z.string().min(1).max(80).optional(),
    last4: z
      .string()
      .regex(/^\d{4}$/, "Last 4 must be exactly 4 digits")
      .optional()
      .nullable(),
    creditLimit: z.coerce
      .number()
      .positive()
      .max(99999999999.99)
      .optional(),
    lastStatementCloseDate: isoDate.optional(),
    paymentDueDate: isoDate.optional(),
    statementBalance: z.coerce.number().nonnegative().optional(),
    minimumPayment: z.coerce.number().nonnegative().optional(),
    minimumPaymentPercent: z.coerce.number().min(0).max(100).optional(),
    sortOrder: z.coerce.number().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (v) => {
      const a = v.lastStatementCloseDate;
      const b = v.paymentDueDate;
      if (!a && !b) return true;
      if (!a || !b) return false;
      return b > a;
    },
    {
      message:
        "Provide lastStatementCloseDate and paymentDueDate together; payment due date must be after close date",
      path: ["paymentDueDate"],
    },
  );

export const creditCardPaySchema = z.object({
  amount: z.coerce
    .number()
    .positive("Amount must be greater than 0")
    .max(99999999999.99, "Amount exceeds maximum value"),
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
