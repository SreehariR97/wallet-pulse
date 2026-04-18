import { eq, and, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { profileUpdateSchema } from "@/lib/validations/user";
import { ok, fail, zodFail, requireUser } from "@/lib/api";
import type { UserProfileDTO, DeletedIdDTO } from "@/types";

type UserPatch = Partial<
  Omit<typeof users.$inferInsert, "id" | "passwordHash" | "createdAt" | "updatedAt">
>;

function toUserProfileDTO(row: {
  id: string;
  name: string;
  email: string;
  currency: string;
  monthlyBudget: string | null;
}): UserProfileDTO {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    currency: row.currency,
    monthlyBudget: row.monthlyBudget != null ? Number(row.monthlyBudget) : null,
  };
}

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email, currency: users.currency, monthlyBudget: users.monthlyBudget })
    .from(users)
    .where(eq(users.id, auth.userId))
    .limit(1);
  if (!row) return fail(404, "User not found");
  return ok(toUserProfileDTO(row) satisfies UserProfileDTO);
}

export async function PUT(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);
  const p = parsed.data;

  if (p.email) {
    const email = p.email.toLowerCase();
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), ne(users.id, auth.userId)))
      .limit(1);
    if (existing.length) return fail(409, "This email is already in use");
  }

  const patch: UserPatch = {};
  if (p.name !== undefined) patch.name = p.name;
  if (p.email !== undefined) patch.email = p.email.toLowerCase();
  if (p.currency !== undefined) patch.currency = p.currency.toUpperCase();
  if (p.monthlyBudget !== undefined) patch.monthlyBudget = p.monthlyBudget != null ? String(p.monthlyBudget) : null;

  await db.update(users).set(patch).where(eq(users.id, auth.userId));
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email, currency: users.currency, monthlyBudget: users.monthlyBudget })
    .from(users)
    .where(eq(users.id, auth.userId))
    .limit(1);
  return ok(toUserProfileDTO(row) satisfies UserProfileDTO);
}

export async function DELETE() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  await db.delete(users).where(eq(users.id, auth.userId));
  return ok({ id: auth.userId } satisfies DeletedIdDTO);
}
