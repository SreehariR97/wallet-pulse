import { CredentialsSignin } from "next-auth";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { loginSchema } from "@/lib/validations/auth";
import { RATE_LIMITS, clientIp, consumeRateLimit, resetRateLimit } from "@/lib/rate-limit";

/** Surfaces as `code: "rate_limited"` on the client's signIn() result. */
export class RateLimitedSignin extends CredentialsSignin {
  code = "rate_limited";
}

// Compared against when the email doesn't exist, so an unknown email costs
// the same bcrypt work as a wrong password and response timing doesn't
// reveal which emails are registered. Cost factor matches real hashes.
const DUMMY_HASH = "$2a$10$bTquHwBCQjCaV75iX8PDAeRzOdQLp/suntRlXOOm7zy3t8nr9lvCi";

/** Credentials-provider `authorize`: rate-limited, constant-work password check. */
export async function authorizeCredentials(raw: unknown, headers: Headers) {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return null;
  const email = parsed.data.email.toLowerCase();
  const emailKey = `login:email:${email}`;

  const [byIp, byEmail] = await Promise.all([
    consumeRateLimit(`login:ip:${clientIp(headers)}`, RATE_LIMITS.loginIp),
    consumeRateLimit(emailKey, RATE_LIMITS.loginEmail),
  ]);
  if (!byIp.allowed || !byEmail.allowed) throw new RateLimitedSignin();

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const ok = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return null;

  await resetRateLimit(emailKey);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    currency: user.currency,
    sessionVersion: user.sessionVersion,
  };
}

type SessionToken = { [key: string]: unknown };

/**
 * Re-check a session token against the users row. Returns null (which makes
 * Auth.js clear the session) when the user is gone or session_version has
 * moved past the token's — password change bumps it. Also refreshes
 * currency so a profile change applies without signing in again.
 */
export async function revalidateSessionToken<T extends SessionToken>(token: T): Promise<T | null> {
  const userId = typeof token.id === "string" ? token.id : "";
  if (!userId) return null;
  // Tokens issued before session_version existed carry no `sv`; they match
  // the column default of 0 so the rollout signs nobody out.
  const tokenVersion = typeof token.sv === "number" ? token.sv : 0;
  const [row] = await db
    .select({ sessionVersion: users.sessionVersion, currency: users.currency })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row || row.sessionVersion !== tokenVersion) return null;
  (token as SessionToken).currency = row.currency;
  return token;
}
