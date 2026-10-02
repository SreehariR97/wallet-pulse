import { z } from "zod";
import { isoDate, moneyAmount } from "./common";

export const budgetCreateSchema = z.object({
  categoryId: z.string().optional().nullable(),
  amount: moneyAmount(),
  period: z.enum(["weekly", "monthly", "yearly"]).default("monthly"),
  startDate: isoDate(),
  endDate: isoDate().optional().nullable(),
});

export const budgetUpdateSchema = budgetCreateSchema.partial();

export type BudgetCreateInput = z.infer<typeof budgetCreateSchema>;
export type BudgetUpdateInput = z.infer<typeof budgetUpdateSchema>;
