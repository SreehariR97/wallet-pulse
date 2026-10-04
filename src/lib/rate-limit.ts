import { eq, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";

/**
 * Postgres-backed fixed-window rate limiter for the auth endpoints.
 *
 * In-memory counters don't work on serverless (every instance has its own
 * memory), and Redis/Upstash would be a new piece of infrastructure. One
 * upsert per check is cheap and atomic on every driver we run (neon-http,
 * node-postgres, PGlite in tests): concurrent requests serialize on the
 * row lock, so the count can't be under-reported.
 */

export type RateLimitRule = { limit: number; windowSeconds: number };

export const RATE_LIMITS = {
  // Per-IP covers credential stuffing across many accounts; per-email covers
  // targeted guessing from rotating IPs. The email counter is reset on a
  // successful sign-in so a user who fat-fingers a few times isn't punished.
  loginIp: { limit: 30, windowSeconds: 15 * 60 },
  loginEmail: { limit: 10, windowSeconds: 15 * 60 },
  register: { limit: 5, windowSeconds: 60 * 60 },
  // Guessing the current password from a hijacked session.
  passwordChange: { limit: 5, windowSeconds: 15 * 60 },
} satisfies Record<string, RateLimitRule>;

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

/** Count one attempt against `key` and report whether it is within `rule`. */
export async function consumeRateLimit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
  const expired = sql`${rateLimits.windowStart} <= now() - ${rule.windowSeconds}::int * interval '1 second'`;
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${expired} THEN 1 ELSE ${rateLimits.count} + 1 END`,
        windowStart: sql`CASE WHEN ${expired} THEN now() ELSE ${rateLimits.windowStart} END`,
      },
    })
    .returning();

  // Opportunistic cleanup so the table doesn't grow without bound. Every
  // window is at most an hour, so day-old rows are always dead.
  if (Math.random() < 0.01) {
    await db.delete(rateLimits).where(lt(rateLimits.windowStart, sql`now() - interval '1 day'`));
  }

  const allowed = row.count <= rule.limit;
  const windowEndsMs = row.windowStart.getTime() + rule.windowSeconds * 1000;
  const retryAfterSeconds = allowed ? 0 : Math.max(1, Math.ceil((windowEndsMs - Date.now()) / 1000));
  return { allowed, retryAfterSeconds };
}

export async function resetRateLimit(key: string): Promise<void> {
  await db.delete(rateLimits).where(eq(rateLimits.key, key));
}

/**
 * Best-effort client IP. On Vercel, `x-forwarded-for` is set by the edge
 * and cannot be spoofed by the client. When self-hosting, run behind a
 * reverse proxy that overwrites it — otherwise a client can rotate the
 * header to dodge the per-IP limit (the per-email/per-user limits still
 * apply).
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}
