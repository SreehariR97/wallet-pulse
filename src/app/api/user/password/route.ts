import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { passwordUpdateSchema } from "@/lib/validations/user";
import { ok, fail, zodFail, requireUser } from "@/lib/api";
import { RATE_LIMITS, consumeRateLimit } from "@/lib/rate-limit";
import type { PasswordUpdatedDTO } from "@/types";

export async function PUT(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = passwordUpdateSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);

  const limit = await consumeRateLimit(`password:user:${auth.userId}`, RATE_LIMITS.passwordChange);
  if (!limit.allowed) {
    const res = fail(429, "Too many attempts. Please try again later.");
    res.headers.set("Retry-After", String(limit.retryAfterSeconds));
    return res;
  }

  const [user] = await db.select().from(users).where(eq(users.id, auth.userId)).limit(1);
  if (!user) return fail(404, "User not found");

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return fail(400, "Current password is incorrect");

  const hash = await bcrypt.hash(parsed.data.newPassword, 10);
  // Bumping session_version signs out every existing session, including
  // this one — the client sends the user back to /login afterwards.
  await db
    .update(users)
    .set({ passwordHash: hash, sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, auth.userId));
  return ok({ updated: true } satisfies PasswordUpdatedDTO);
}
