import { z } from "zod";

export const remittanceServiceEnum = z.enum([
  "wise",
  "remitly",
  "western_union",
  "bank_wire",
  "other",
]);

// Currency codes are 3-letter ISO-ish strings. We don't validate against a
// hard allowlist here — CURRENCIES in lib/utils.ts is the UI-facing set, but
// users may reasonably send to currencies we haven't added yet.
const currencyCode = z.string().regex(/^[A-Z]{3}$/i, "Currency must be a 3-letter code").transform((s) => s.toUpperCase());

export const remittanceCreateSchema = z.object({
  // Transaction-side fields (type is forced to "transfer" server-side).
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  description: z.string().min(1, "Description is required").max(200),
  notes: z.string().max(2000).optional().nullable(),
  paymentMethod: z
    .enum(["cash", "credit_card", "debit_card", "bank_transfer", "upi", "other"])
    .default("bank_transfer"),
  isRecurring: z.boolean().default(false),
  recurringFrequency: z.enum(["daily", "weekly", "monthly", "yearly"]).optional().nullable(),
  tags: z.string().max(500).optional().nullable(),
  // Remittance-side fields.
  fromCurrency: currencyCode.default("USD"),
  toCurrency: currencyCode.default("INR"),
  // fxRate — stored as numeric(12,6). Accept up to 6 decimal places.
  fxRate: z.coerce.number().positive("FX rate must be greater than 0"),
  // fee — stored as numeric(12,4). Non-negative.
  fee: z.coerce.number().min(0, "Fee cannot be negative"),
  service: remittanceServiceEnum,
  recipientNote: z.string().max(200).optional().nullable(),
});

export const remittanceUpdateSchema = remittanceCreateSchema.partial();

export const remittanceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
  service: remittanceServiceEnum.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sort: z.enum(["date", "amount", "fxRate"]).default("date"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export const remittanceStatsQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export type RemittanceCreateInput = z.infer<typeof remittanceCreateSchema>;
export type RemittanceUpdateInput = z.infer<typeof remittanceUpdateSchema>;
export type RemittanceQueryInput = z.infer<typeof remittanceQuerySchema>;
