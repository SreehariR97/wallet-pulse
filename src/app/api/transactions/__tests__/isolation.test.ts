/**
 * User-isolation integration tests for the transactions API.
 *
 *  - DB:   fresh PGlite (in-process Postgres) per test via `makeTestDb()`.
 *  - Auth: @/lib/auth is mocked so auth() returns a controllable session.
 *  - No mocking of Drizzle itself — queries run against a real SQL engine.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  makeTestDb,
  seedTwoUsers,
  session,
  getReq,
  jsonReq,
  TEST_USERS,
  type TestDb,
} from "../../__tests__/_harness";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

// Getter pattern: `currentDb` is reassigned in beforeEach; the getter ensures
// route-handler code sees the fresh instance on every access. Must live here
// (not in the harness) — Vitest hoists vi.mock to this file's module scope.
let currentDb: TestDb;
vi.mock("@/lib/db", () => ({
  get db() {
    return currentDb;
  },
}));

import { auth } from "@/lib/auth";
import { GET as listGet, POST as listPost } from "../route";
import { GET as getById, PUT as putById, DELETE as deleteById } from "../[id]/route";
import { DELETE as bulkDelete } from "../bulk/route";

const A = { ...TEST_USERS.A, txId: "tx-a", cardId: "card-a" };
const B = { ...TEST_USERS.B, txId: "tx-b", cardId: "card-b" };
const TX_DATE = "2026-04-01";

beforeEach(async () => {
  currentDb = await makeTestDb();
  await seedTwoUsers(currentDb);

  await currentDb.insert(schema.transactions).values([
    { id: A.txId, userId: A.userId, categoryId: A.catId, type: "expense", amount: "10", description: "A tx", date: TX_DATE },
    { id: B.txId, userId: B.userId, categoryId: B.catId, type: "expense", amount: "20", description: "B tx", date: TX_DATE },
  ]);

  await currentDb.insert(schema.creditCards).values([
    { id: A.cardId, userId: A.userId, name: "Card A", issuer: "Chase", creditLimit: "5000", statementDay: 15, paymentDueDay: 10 },
    { id: B.cardId, userId: B.userId, name: "Card B", issuer: "Amex", creditLimit: "8000", statementDay: 20, paymentDueDay: 15 },
  ]);
});

describe("GET /api/transactions — user isolation", () => {
  it("list: A's list contains A's tx and does not contain B's tx", async () => {
    vi.mocked(auth).mockResolvedValue(session(A.userId, A.email) as never);

    const res = (await listGet(getReq("http://localhost/api/transactions"))) as Response;
    const body = await res.json();

    expect(res.status).toBe(200);
    const ids = (body.data as Array<{ id: string }>).map((r) => r.id);
    expect(ids).toContain(A.txId);
    expect(ids).not.toContain(B.txId);
  });

  it("filter/2a: GET ?categoryId=<B cat> as A — B's tx does not leak", async () => {
    vi.mocked(auth).mockResolvedValue(session(A.userId, A.email) as never);

    const res = (await listGet(getReq("http://localhost/api/transactions", { categoryId: B.catId }))) as Response;
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(0);
  });

  it("filter/2b: GET ?categoryId=<B cat> as A — A's own tx also absent (userId AND categoryId)", async () => {
    // A has a tx in cat-a, not cat-b. If a refactor drops the userId scope
    // and only filters by categoryId, this query might return 0 rows for the
    // wrong reason. By asserting A's tx is also absent, we confirm the WHERE
    // clause is userId=A AND categoryId=cat-b, not just categoryId=cat-b.
    vi.mocked(auth).mockResolvedValue(session(A.userId, A.email) as never);

    const res = (await listGet(getReq("http://localhost/api/transactions", { categoryId: B.catId }))) as Response;
    const body = await res.json();
    const ids = (body.data as Array<{ id: string }>).map((r) => r.id);

    expect(ids).not.toContain(A.txId);
    expect(ids).not.toContain(B.txId);
  });
});

describe("GET /api/transactions/:id — user isolation", () => {
  it("get: A reading B's tx id returns 404", async () => {
    vi.mocked(auth).mockResolvedValue(session(A.userId, A.email) as never);

    const res = (await getById(new Request("http://localhost"), { params: { id: B.txId } })) as Response;

    expect(res.status).toBe(404);
  });
});

describe("PUT /api/transactions/:id — user isolation", () => {
  it("update: A updating B's tx returns 404; B's row is unchanged in DB", async () => {
    vi.mocked(auth).mockResolvedValue(session(A.userId, A.email) as never);

    const req = new Request("http://localhost", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "hacked" }),
    });
    const res = (await putById(req, { params: { id: B.txId } })) as Response;

    expect(res.status).toBe(404);

    const [row] = await currentDb
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, B.txId));
    expect(row!.description).toBe("B tx");
  });
});

describe("DELETE /api/transactions/:id — user isolation", () => {
  it("delete: A deleting B's tx returns 404; B's row still exists in DB", async () => {
    vi.mocked(auth).mockResolvedValue(session(A.userId, A.email) as never);

    const res = (await deleteById(new Request("http://localhost"), { params: { id: B.txId } })) as Response;

    expect(res.status).toBe(404);

    const rows = await currentDb
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, B.txId));
    expect(rows).toHaveLength(1);
  });
});

describe("DELETE /api/transactions/bulk — user isolation", () => {
  it("bulk: ids=[A.tx, B.tx] as A → deleted=1; B's row survives", async () => {
    vi.mocked(auth).mockResolvedValue(session(A.userId, A.email) as never);

    const req = jsonReq("http://localhost/api/transactions/bulk", { ids: [A.txId, B.txId] }, "DELETE");
    const res = (await bulkDelete(req)) as Response;
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.deleted).toBe(1);

    const rows = await currentDb
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, B.txId));
    expect(rows).toHaveLength(1);
  });
});

describe("POST /api/transactions — user isolation", () => {
  it("post: categoryId belonging to B returns 400 'Invalid category'", async () => {
    vi.mocked(auth).mockResolvedValue(session(A.userId, A.email) as never);

    const res = (await listPost(
      jsonReq("http://localhost/api/transactions", { type: "expense", amount: 50, categoryId: B.catId, description: "test", date: "2026-04-10", paymentMethod: "cash" }),
    )) as Response;
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid category");
  });

  it("post: creditCardId belonging to B returns 400 'Invalid credit card'", async () => {
    vi.mocked(auth).mockResolvedValue(session(A.userId, A.email) as never);

    const res = (await listPost(
      jsonReq("http://localhost/api/transactions", { type: "expense", amount: 50, categoryId: A.catId, description: "test", date: "2026-04-10", paymentMethod: "credit_card", creditCardId: B.cardId }),
    )) as Response;
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid credit card");
  });
});
