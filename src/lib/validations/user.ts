import { z } from "zod";

export const profileUpdateSchema = z.object({
  name: z.string().min(2).max(64).optional(),
  email: z.string().email().optional(),
  currency: z.string().length(3).optional(),
  monthlyBudget: z
    .number()
    .nonnegative()
    .max(99999999999.99, "Monthly budget exceeds maximum value")
    .nullable()
    .optional(),
});

export const passwordUpdateSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters").max(128),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type PasswordUpdateInput = z.infer<typeof passwordUpdateSchema>;
