/**
 * Shared test harness for route-handler tests.
 *
 * Design constraint (see task 10 step 0): `vi.mock("@/lib/db", ...)` must live
 * in each caller's file — Vitest hoists `vi.mock` to the calling module's
 * scope, and the `get db()` getter must close over a `currentDb` variable
 * reassigned in that same file's `beforeEach`. This harness owns everything
 * EXCEPT that mock.
 *
 * Caller pattern:
 *
 *   vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
 *   let currentDb: PgliteDatabase<typeof schema>;
 *   vi.mock("@/lib/db", () => ({ get db() { return currentDb; } }));
 *
 *   beforeEach(async () => {
 *     currentDb = await makeTestDb();
 *     await seedTwoUsers(currentDb);
 *     // file-specific seeds…
 *   });
 */
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "@/lib/db/schema";

export type TestDb = PgliteDatabase<typeof schema>;

export const TEST_USERS = {
  A: { userId: "user-a", email: "a@test.com", catId: "cat-a" },
  B: { userId: "user-b", email: "b@test.com", catId: "cat-b" },
} as const;

export type Session = {
  user: { id: string; name: string; email: string; currency: string };
  expires: string;
};

export function session(userId: string, email: string, currency = "USD"): Session {
  return {
    user: { id: userId, name: "Test", email, currency },
    expires: new Date(Date.now() + 3_600_000).toISOString(),
  };
}

/**
 * Create a fresh PGlite-backed Drizzle instance with all migrations applied.
 * Each call returns a clean DB; re-use is not safe across tests.
 */
export async function makeTestDb(): Promise<TestDb> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

/**
 * Seeds users A and B, plus a single "expense"-type category owned by each,
 * matching the TEST_USERS constants. Callers layer on resource-specific seeds.
 */
export async function seedTwoUsers(db: TestDb): Promise<void> {
  await db.insert(schema.users).values([
    { id: TEST_USERS.A.userId, name: "User A", email: TEST_USERS.A.email, passwordHash: "x", currency: "USD" },
    { id: TEST_USERS.B.userId, name: "User B", email: TEST_USERS.B.email, passwordHash: "x", currency: "USD" },
  ]);
  await db.insert(schema.categories).values([
    { id: TEST_USERS.A.catId, userId: TEST_USERS.A.userId, name: "Cat A", type: "expense" },
    { id: TEST_USERS.B.catId, userId: TEST_USERS.B.userId, name: "Cat B", type: "expense" },
  ]);
}

export function getReq(url: string, params?: Record<string, string>): Request {
  const u = new URL(url);
  if (params) for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return new Request(u.toString());
}

export function jsonReq(url: string, body: unknown, method = "POST"): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
