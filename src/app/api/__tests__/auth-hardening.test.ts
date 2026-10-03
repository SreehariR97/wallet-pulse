/**
 * Auth hardening: Postgres-backed rate limiting, credential checks, and
 * session revocation via users.session_version.
 */

import { vi, describe, it, expect, beforeEach, beforeAll } from "vitest";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { makeTestDb, seedTwoUsers, session, jsonReq, TEST_USERS, type TestDb } from "./_harness";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
let currentDb: TestDb;
vi.mock("@/lib/db", () => ({
  get db() {
    return currentDb;
  },
}));

import { auth } from "@/lib/auth";
import { consumeRateLimit, resetRateLimit, clientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { authorizeCredentials, revalidateSessionToken, RateLimitedSignin } from "@/lib/auth/credentials";
import { PUT as changePassword } from "../user/password/route";
import { POST as register } from "../auth/register/route";

const A = TEST_USERS.A;
const PASSWORD = "correct-horse";
let passwordHash: string;

beforeAll(() => {
  // Low cost keeps the suite fast; compare() reads the cost from the hash.
  passwordHash = bcrypt.hashSync(PASSWORD, 4);
});

beforeEach(async () => {
  currentDb = await makeTestDb();
  await seedTwoUsers(currentDb);
  await currentDb.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, A.userId));
});

function headersFrom(ip: string): Headers {
  return new Headers({ "x-forwarded-for": `${ip}, 10.0.0.1` });
}

async function rateLimitRow(key: string) {
  const [row] = await currentDb.select().from(schema.rateLimits).where(eq(schema.rateLimits.key, key));
  return row;
}

describe("consumeRateLimit", () => {
  const rule = { limit: 3, windowSeconds: 60 };

  it("allows up to the limit, then blocks with a Retry-After inside the window", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await consumeRateLimit("k", rule)).allowed).toBe(true);
    }
    const blocked = await consumeRateLimit("k", rule);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("starts a fresh window once the old one has expired", async () => {
    for (let i = 0; i < 4; i++) await consumeRateLimit("k", rule);
    await currentDb
      .update(schema.rateLimits)
      .set({ windowStart: sql`now() - interval '61 seconds'` })
      .where(eq(schema.rateLimits.key, "k"));

    expect((await consumeRateLimit("k", rule)).allowed).toBe(true);
    expect((await rateLimitRow("k"))!.count).toBe(1);
  });

  it("keeps keys independent and resetRateLimit clears one", async () => {
    for (let i = 0; i < 4; i++) await consumeRateLimit("a", rule);
    expect((await consumeRateLimit("b", rule)).allowed).toBe(true);
    await resetRateLimit("a");
    expect((await consumeRateLimit("a", rule)).allowed).toBe(true);
  });
});

describe("clientIp", () => {
  it("takes the first x-forwarded-for hop, then x-real-ip, then 'unknown'", () => {
    expect(clientIp(headersFrom("203.0.113.7"))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("authorizeCredentials", () => {
  const ip = headersFrom("203.0.113.7");

  it("returns the user with its session version and clears the email counter", async () => {
    await authorizeCredentials({ email: A.email, password: "wrong-pass" }, ip);
    const user = await authorizeCredentials({ email: A.email.toUpperCase(), password: PASSWORD }, ip);
    expect(user).toMatchObject({ id: A.userId, email: A.email, sessionVersion: 0 });
    expect(await rateLimitRow(`login:email:${A.email}`)).toBeUndefined();
  });

  it("returns null for a wrong password or an unknown email", async () => {
    expect(await authorizeCredentials({ email: A.email, password: "wrong-pass" }, ip)).toBeNull();
    expect(await authorizeCredentials({ email: "nobody@test.com", password: PASSWORD }, ip)).toBeNull();
  });

  it("still accepts short passwords set before the 8-character minimum", async () => {
    await currentDb
      .update(schema.users)
      .set({ passwordHash: bcrypt.hashSync("demo12", 4) })
      .where(eq(schema.users.id, A.userId));
    expect(await authorizeCredentials({ email: A.email, password: "demo12" }, ip)).not.toBeNull();
  });

  it("locks an email after too many attempts, even with the right password", async () => {
    for (let i = 0; i < RATE_LIMITS.loginEmail.limit; i++) {
      await authorizeCredentials({ email: A.email, password: `guess-${i}` }, headersFrom(`198.51.100.${i}`));
    }
    await expect(authorizeCredentials({ email: A.email, password: PASSWORD }, ip)).rejects.toBeInstanceOf(
      RateLimitedSignin,
    );
  });

  it("locks an IP that sprays many different emails", async () => {
    for (let i = 0; i < RATE_LIMITS.loginIp.limit; i++) {
      await authorizeCredentials({ email: `spray${i}@test.com`, password: "whatever1" }, ip);
    }
    await expect(authorizeCredentials({ email: A.email, password: PASSWORD }, ip)).rejects.toMatchObject({
      code: "rate_limited",
    });
    // A different IP is unaffected.
    expect(await authorizeCredentials({ email: A.email, password: PASSWORD }, headersFrom("192.0.2.1"))).not.toBeNull();
  });
});

describe("revalidateSessionToken", () => {
  it("keeps a token whose version matches and refreshes its currency", async () => {
    await currentDb.update(schema.users).set({ currency: "EUR" }).where(eq(schema.users.id, A.userId));
    const token = await revalidateSessionToken({ id: A.userId, sv: 0, currency: "USD" });
    expect(token).toMatchObject({ id: A.userId, currency: "EUR" });
  });

  it("treats tokens issued before session_version existed as version 0", async () => {
    expect(await revalidateSessionToken({ id: A.userId })).not.toBeNull();
  });

  it("rejects a stale version, a deleted user, and a token without an id", async () => {
    await currentDb.update(schema.users).set({ sessionVersion: 1 }).where(eq(schema.users.id, A.userId));
    expect(await revalidateSessionToken({ id: A.userId, sv: 0 })).toBeNull();
    expect(await revalidateSessionToken({ id: "deleted-user", sv: 0 })).toBeNull();
    expect(await revalidateSessionToken({})).toBeNull();
  });
});

describe("PUT /api/user/password", () => {
  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue(session(A.userId, A.email) as never);
  });

  async function put(body: unknown) {
    return (await changePassword(jsonReq("http://localhost/api/user/password", body, "PUT"))) as Response;
  }

  it("changes the password and revokes existing sessions", async () => {
    const res = await put({ currentPassword: PASSWORD, newPassword: "new-password-1" });
    expect(res.status).toBe(200);

    const [user] = await currentDb.select().from(schema.users).where(eq(schema.users.id, A.userId));
    expect(user!.sessionVersion).toBe(1);
    expect(await bcrypt.compare("new-password-1", user!.passwordHash)).toBe(true);
    expect(await revalidateSessionToken({ id: A.userId, sv: 0 })).toBeNull();
  });

  it("rejects new passwords under 8 characters or over bcrypt's 72-byte limit", async () => {
    expect((await put({ currentPassword: PASSWORD, newPassword: "short12" })).status).toBe(400);
    // 37 two-byte characters = 74 bytes.
    expect((await put({ currentPassword: PASSWORD, newPassword: "é".repeat(37) })).status).toBe(400);
  });

  it("rate-limits current-password guessing", async () => {
    for (let i = 0; i < RATE_LIMITS.passwordChange.limit; i++) {
      expect((await put({ currentPassword: `guess-${i}`, newPassword: "new-password-1" })).status).toBe(400);
    }
    const res = await put({ currentPassword: PASSWORD, newPassword: "new-password-1" });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});

describe("POST /api/auth/register", () => {
  function registerFrom(ip: string, n: number) {
    const req = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ name: "New User", email: `new${n}@test.com`, password: "long-enough" }),
    });
    return register(req) as Promise<Response>;
  }

  it("allows a handful of sign-ups per IP, then returns 429", async () => {
    for (let i = 0; i < RATE_LIMITS.register.limit; i++) {
      expect((await registerFrom("203.0.113.9", i)).status).toBe(201);
    }
    const blocked = await registerFrom("203.0.113.9", 99);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).not.toBeNull();
    expect((await registerFrom("192.0.2.50", 100)).status).toBe(201);
  });

  it("rejects passwords under 8 characters", async () => {
    const req = jsonReq("http://localhost/api/auth/register", {
      name: "New User",
      email: "short@test.com",
      password: "seven77",
    });
    expect(((await register(req)) as Response).status).toBe(400);
  });
});
