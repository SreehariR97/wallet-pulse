import { z } from "zod";

export const budgetCreateSchema = z.object({
  categoryId: z.string().optional().nullable(),
  amount: z.coerce
    .number()
    .positive("Amount must be greater than 0")
    .max(99999999999.99, "Amount exceeds maximum value"),
  period: z.enum(["weekly", "monthly", "yearly"]).default("monthly"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export const budgetUpdateSchema = budgetCreateSchema.partial();

export type BudgetCreateInput = z.infer<typeof budgetCreateSchema>;
export type BudgetUpdateInput = z.infer<typeof budgetUpdateSchema>;
