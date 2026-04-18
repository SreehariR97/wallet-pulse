import { z } from "zod";

export const categoryCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(50),
  icon: z.string().min(1).max(8).default("📦"),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a hex color like #FF6B6B")
    .default("#6366F1"),
  type: z.enum(["expense", "income", "loan"]),
  budgetLimit: z.coerce
    .number()
    .positive()
    .max(99999999999.99, "Budget limit exceeds maximum value")
    .optional()
    .nullable(),
});

export const categoryUpdateSchema = categoryCreateSchema.partial();

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
