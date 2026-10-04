import { z } from "zod";

/**
 * Rules for a new password. bcrypt only hashes the first 72 bytes, so a
 * longer password would silently lose its tail — reject it instead.
 */
export function newPasswordField(label = "Password") {
  return z
    .string()
    .min(8, `${label} must be at least 8 characters`)
    .refine((p) => new TextEncoder().encode(p).length <= 72, `${label} must be at most 72 bytes`);
}

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  // Existing accounts may have 6-7 character passwords from before the
  // minimum was raised, so sign-in only requires non-empty.
  password: z.string().min(1, "Password is required").max(128),
});

export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(64),
  email: z.string().email("Enter a valid email"),
  password: newPasswordField(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
