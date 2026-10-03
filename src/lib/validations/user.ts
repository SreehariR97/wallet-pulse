import { z } from "zod";
import { newPasswordField } from "./auth";

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
  newPassword: newPasswordField("New password"),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type PasswordUpdateInput = z.infer<typeof passwordUpdateSchema>;
