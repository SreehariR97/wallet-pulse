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

export const transactionCreateSchema = z.object({
  type: transactionTypeEnum,
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  categoryId: z.string().min(1, "Category is required"),
  description: z.string().min(1, "Description is required").max(200),
  notes: z.string().max(2000).optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  paymentMethod: paymentMethodEnum.default("cash"),
  isRecurring: z.boolean().default(false),
  recurringFrequency: recurringFrequencyEnum.optional().nullable(),
  tags: z.string().max(500).optional().nullable(),
});

export const transactionUpdateSchema = transactionCreateSchema.partial();

export const transactionBulkDeleteSchema = z.object({
  ids: z.array(z.string()).min(1),
});

export const transactionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
  categoryId: z.string().optional(),
  type: transactionTypeEnum.optional(),
  paymentMethod: paymentMethodEnum.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().optional(),
  minAmount: z.coerce.number().optional(),
  maxAmount: z.coerce.number().optional(),
  tags: z.string().optional(),
  sort: z.enum(["date", "amount", "description", "createdAt"]).default("date"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type TransactionCreateInput = z.infer<typeof transactionCreateSchema>;
export type TransactionUpdateInput = z.infer<typeof transactionUpdateSchema>;
export type TransactionQueryInput = z.infer<typeof transactionQuerySchema>;
