import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { categories, users } from "@/lib/db/schema";
import { registerSchema } from "@/lib/validations/auth";
import { defaultCategoryRows } from "@/lib/db/seed";
import { fail, zodFail, isUniqueViolation } from "@/lib/api";
import { RATE_LIMITS, clientIp, consumeRateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const limit = await consumeRateLimit(`register:ip:${clientIp(req.headers)}`, RATE_LIMITS.register);
  if (!limit.allowed) {
    const res = fail(429, "Too many sign-up attempts. Please try again later.");
    res.headers.set("Retry-After", String(limit.retryAfterSeconds));
    return res;
  }

  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);

  const email = parsed.data.email.toLowerCase();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) return fail(409, "An account with this email already exists");

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const id = randomUUID();
  const userValues = { id, name: parsed.data.name, email, passwordHash };
  const categoryRows = defaultCategoryRows(id);

  // User + default categories in one atomic unit: a failure halfway used to
  // leave a user with no categories for good (the GET backfill skips users
  // with zero categories). Dispatch per CLAUDE.md.
  try {
    const maybeBatch = db as { batch?: unknown };
    if (typeof maybeBatch.batch === "function") {
      const neonDb = db as NeonHttpDatabase<typeof schema>;
      await neonDb.batch([
        neonDb.insert(users).values(userValues),
        neonDb.insert(categories).values(categoryRows),
      ]);
    } else {
      await db.transaction(async (trx) => {
        await trx.insert(users).values(userValues);
        await trx.insert(categories).values(categoryRows);
      });
    }
  } catch (err) {
    // Two sign-ups for the same email racing past the check above.
    if (isUniqueViolation(err)) return fail(409, "An account with this email already exists");
    throw err;
  }

  return NextResponse.json({ data: { id, email } }, { status: 201 });
}
