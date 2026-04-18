/**
 * User-isolation tests for the budgets API.
 *
 * The GET list test seeds both users with transactions under their own
 * category so a dropped userId scope in the `spent` subquery would produce a
 * visibly-wrong aggregate (A's budget would appear to include B's spending).
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
import { GET as listGet, POST as listPost } from "../route";
import { PUT as putById, DELETE as deleteById } from "../[id]/route";

const A = { ...TEST_USERS.A, budgetId: "budget-a" };
const B = { ...TEST_USERS.B, budgetId: "budget-b" };

// The budget period window (monthly) anchors on the server's "today". Use
// a date that falls inside the current month at test time — since tests
// run at real wall-clock, seed with today's date to guarantee inclusion.
const TODAY = new Date().toISOString().slice(0, 10);

beforeEach(async () => {
  currentDb = await makeTestDb();
  await seedTwoUsers(currentDb);

  await currentDb.insert(schema.budgets).values([
    { id: A.budgetId, userId: A.userId, categoryId: A.catId, amount: "500", period: "monthly", startDate: TODAY },
    { id: B.budgetId, userId: B.userId, categoryId: B.catId, amount: "1000", period: "monthly", startDate: TODAY },
  ]);

  // Seed txs against each user's category today. A: 10 + 20 = 30 expected
  // spent. B: 500 expected spent. If A's spent subquery leaks, A would see
  // 530 (or 30 + 500) instead of 30.
  await currentDb.insert(schema.transactions).values([
    { id: "tx-a-1", userId: A.userId, categoryId: A.catId, type: "expense", amount: "10", description: "A1", date: TODAY },
    { id: "tx-a-2", userId: A.userId, categoryId: A.catId, type: "expense", amount: "20", description: "A2", date: TODAY },
    { id: "tx-b-1", userId: B.userId, categoryId: B.catId, type: "expense", amount: "500", description: "B1", date: TODAY },
  ]);
});

function asA() {
  vi.mocked(auth).mockResolvedValue(session(A.userId, A.email) as never);
}

describe("GET /api/budgets — user isolation (with spent subquery)", () => {
  it("list: A's budgets include A's budget with spent=30 (B's 500 does not leak into A's spent)", async () => {
    asA();
    const res = (await listGet()) as Response;
    const body = await res.json();
    expect(res.status).toBe(200);
    const rows = body.data as Array<{ id: string; spent: number }>;
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(A.budgetId);
    expect(ids).not.toContain(B.budgetId);
    const aBudget = rows.find((r) => r.id === A.budgetId);
    expect(aBudget!.spent).toBe(30);
  });
});

describe("PUT /api/budgets/:id — user isolation", () => {
  it("put: A updating B's budget returns 404; B's budget amount unchanged", async () => {
    asA();
    const req = jsonReq("http://localhost", { amount: 9999 }, "PUT");
    const res = (await putById(req, { params: { id: B.budgetId } })) as Response;
    expect(res.status).toBe(404);

    const [row] = await currentDb
      .select()
      .from(schema.budgets)
      .where(eq(schema.budgets.id, B.budgetId));
    expect(row!.amount).toBe("1000.00");
  });
});

describe("DELETE /api/budgets/:id — user isolation", () => {
  it("delete: A deleting B's budget returns 404; B's budget still exists", async () => {
    asA();
    const res = (await deleteById(new Request("http://localhost"), { params: { id: B.budgetId } })) as Response;
    expect(res.status).toBe(404);

    const rows = await currentDb
      .select()
      .from(schema.budgets)
      .where(eq(schema.budgets.id, B.budgetId));
    expect(rows).toHaveLength(1);
  });
});

describe("POST /api/budgets — cross-tenant FK re-verification", () => {
  it("post: categoryId belonging to B returns 400 'Invalid category'", async () => {
    asA();
    const res = (await listPost(
      jsonReq("http://localhost/api/budgets", {
        categoryId: B.catId,
        amount: 250,
        period: "monthly",
        startDate: TODAY,
      }),
    )) as Response;
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid category");
  });
});
