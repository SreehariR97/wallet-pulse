import { z } from "zod";

export const transactionTypeEnum = z.enum([
  "expense",
  "income",
  "transfer",
  "loan_given",
  "loan_taken",
  "repayment_received",
  "repayment_made",
]);
export const paymentMethodEnum = z.enum(["cash", "credit_card", "debit_card", "bank_transfer", "upi", "other"]);
export const recurringFrequencyEnum = z.enum(["daily", "weekly", "monthly", "yearly"]);

export const transactionCreateSchema = z
  .object({
    type: transactionTypeEnum,
    amount: z.coerce
      .number()
      .positive("Amount must be greater than 0")
      .max(99999999999.99, "Amount exceeds maximum value"),
    categoryId: z.string().min(1, "Category is required"),
    description: z.string().min(1, "Description is required").max(200),
    notes: z.string().max(2000).optional().nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
    paymentMethod: paymentMethodEnum.default("cash"),
    // Optional FK. When set, paymentMethod must be "credit_card". The
    // cross-field rule is enforced via superRefine below. Server routes
    // separately re-verify that the card belongs to the authed user.
    creditCardId: z.string().optional().nullable(),
    isRecurring: z.boolean().default(false),
    recurringFrequency: recurringFrequencyEnum.optional().nullable(),
    tags: z.string().max(500).optional().nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.creditCardId && val.paymentMethod !== "credit_card") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["paymentMethod"],
        message: "paymentMethod must be credit_card when creditCardId is set",
      });
    }
  });

export const transactionUpdateSchema = z
  .object({
    type: transactionTypeEnum.optional(),
    amount: z.coerce
      .number()
      .positive()
      .max(99999999999.99, "Amount exceeds maximum value")
      .optional(),
    categoryId: z.string().min(1).optional(),
    description: z.string().min(1).max(200).optional(),
    notes: z.string().max(2000).optional().nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    paymentMethod: paymentMethodEnum.optional(),
    creditCardId: z.string().optional().nullable(),
    isRecurring: z.boolean().optional(),
    recurringFrequency: recurringFrequencyEnum.optional().nullable(),
    tags: z.string().max(500).optional().nullable(),
  })
  .superRefine((val, ctx) => {
    // Only enforce when both fields are present in the patch — callers
    // that clear creditCardId alone (pass null) don't need to also pass
    // paymentMethod. If creditCardId is being set to a card id, a
    // paymentMethod in the same patch must be credit_card (or absent, in
    // which case the existing value is trusted — routes re-check if needed).
    if (val.creditCardId && val.paymentMethod && val.paymentMethod !== "credit_card") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["paymentMethod"],
        message: "paymentMethod must be credit_card when creditCardId is set",
      });
    }
  });

export const transactionBulkDeleteSchema = z.object({
  // max(500) prevents oversized requests from overwhelming the serverless DB connection
  ids: z.array(z.string()).min(1).max(500),
});

export const transactionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
  categoryId: z.string().optional(),
  type: transactionTypeEnum.optional(),
  paymentMethod: paymentMethodEnum.optional(),
  // Filter by attached credit card. Pass "none" to filter for transactions
  // without a card; pass a card id to filter for that specific card.
  creditCardId: z.string().optional(),
  // Shortcut filters that combine type=transfer with the relevant FK check.
  // "card_payments" → type=transfer AND creditCardId IS NOT NULL.
  // "remittances"   → type=transfer AND a remittance row exists for the tx.
  shortcut: z.enum(["card_payments", "remittances"]).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date (expected YYYY-MM-DD)").optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date (expected YYYY-MM-DD)").optional(),
  search: z.string().max(200).optional(),
  minAmount: z.coerce.number().max(99999999999.99).optional(),
  maxAmount: z.coerce.number().max(99999999999.99).optional(),
  tags: z.string().max(200).optional(),
  sort: z.enum(["date", "amount", "description", "createdAt"]).default("date"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type TransactionCreateInput = z.infer<typeof transactionCreateSchema>;
export type TransactionUpdateInput = z.infer<typeof transactionUpdateSchema>;
export type TransactionQueryInput = z.infer<typeof transactionQuerySchema>;
