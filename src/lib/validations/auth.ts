import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(64),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters").max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
