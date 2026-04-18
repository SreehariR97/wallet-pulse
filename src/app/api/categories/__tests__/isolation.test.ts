/**
 * User-isolation tests for the categories API.
 *
 * The GET list handler backfills default categories on the authed user when
 * any exist — assertions use the exclusion pattern (B's id absent) rather
 * than count, which would be brittle against the backfill.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  makeTestDb,
  seedTwoUsers,
  session,
  jsonReq,
  TEST_USERS,
  type TestDb,
} from "../../__tests__/_harness";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
let currentDb: TestDb;
vi.mock("@/lib/db", () => ({
  get db() {
    return currentDb;
  },
}));

import { auth } from "@/lib/auth";
import { GET as listGet } from "../route";
import { PUT as putById, DELETE as deleteById } from "../[id]/route";

const A = TEST_USERS.A;
const B = TEST_USERS.B;

beforeEach(async () => {
  currentDb = await makeTestDb();
  await seedTwoUsers(currentDb);
});

function asA() {
  vi.mocked(auth).mockResolvedValue(session(A.userId, A.email) as never);
}

describe("GET /api/categories — user isolation", () => {
  it("list: A's list does not contain B's category id (tolerant of default-backfill)", async () => {
    asA();
    const res = (await listGet()) as Response;
    const body = await res.json();
    expect(res.status).toBe(200);
    const rows = body.data as Array<{ id: string; userId?: string }>;
    expect(rows.every((c) => c.id !== B.catId)).toBe(true);
    expect(rows.some((c) => c.id === A.catId)).toBe(true);
  });
});

describe("PUT /api/categories/:id — user isolation", () => {
  it("put: A updating B's category returns 404; B's name unchanged", async () => {
    asA();
    const req = jsonReq("http://localhost", { name: "hacked" }, "PUT");
    const res = (await putById(req, { params: { id: B.catId } })) as Response;
    expect(res.status).toBe(404);

    const [row] = await currentDb
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.id, B.catId));
    expect(row!.name).toBe("Cat B");
  });
});

describe("DELETE /api/categories/:id — user isolation", () => {
  it("delete: A deleting B's category returns 404; B's category still exists", async () => {
    asA();
    const res = (await deleteById(new Request("http://localhost"), { params: { id: B.catId } })) as Response;
    expect(res.status).toBe(404);

    const rows = await currentDb
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.id, B.catId));
    expect(rows).toHaveLength(1);
  });

  it("delete (restricted): A deleting own category that has a transaction returns 409 with transactionCount", async () => {
    // Seed a tx for A under A's own category. The FK is ON DELETE RESTRICT;
    // the handler checks before delete and returns 409 with a count payload.
    await currentDb.insert(schema.transactions).values({
      id: "tx-a-in-cat",
      userId: A.userId,
      categoryId: A.catId,
      type: "expense",
      amount: "10",
      description: "A in cat",
      date: "2026-04-01",
    });
    asA();
    const res = (await deleteById(new Request("http://localhost"), { params: { id: A.catId } })) as Response;
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.details?.transactionCount).toBe(1);

    // A's category still exists.
    const rows = await currentDb
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.id, A.catId));
    expect(rows).toHaveLength(1);
  });
});
