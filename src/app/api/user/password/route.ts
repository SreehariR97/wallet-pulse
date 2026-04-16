import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { passwordUpdateSchema } from "@/lib/validations/user";
import { ok, fail, zodFail, requireUser } from "@/lib/api";

export async function PUT(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = passwordUpdateSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);

  const [user] = await db.select().from(users).where(eq(users.id, auth.userId)).limit(1);
  if (!user) return fail(404, "User not found");

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return fail(400, "Current password is incorrect");

  const hash = await bcrypt.hash(parsed.data.newPassword, 10);
  await db.update(users).set({ passwordHash: hash, updatedAt: new Date() }).where(eq(users.id, auth.userId)).run();
  return ok({ updated: true });
}
