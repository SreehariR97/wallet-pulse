/**
 * User-isolation tests for the credit-cards API.
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
let currentDb: TestDb;
vi.mock("@/lib/db", () => ({
  get db() {
    return currentDb;
  },
}));

import { auth } from "@/lib/auth";
import { GET as listGet } from "../route";
import { GET as getById, PATCH as patchById, DELETE as deleteById } from "../[id]/route";
import { GET as cycleGet } from "../[id]/cycle/route";

const A = { ...TEST_USERS.A, cardId: "card-a" };
const B = { ...TEST_USERS.B, cardId: "card-b" };

beforeEach(async () => {
  currentDb = await makeTestDb();
  await seedTwoUsers(currentDb);

  await currentDb.insert(schema.creditCards).values([
    { id: A.cardId, userId: A.userId, name: "Card A", issuer: "Chase", creditLimit: "5000", statementDay: 15, paymentDueDay: 10 },
    { id: B.cardId, userId: B.userId, name: "Card B", issuer: "Amex", creditLimit: "8000", statementDay: 20, paymentDueDay: 15 },
  ]);
});

function asA() {
  vi.mocked(auth).mockResolvedValue(session(A.userId, A.email) as never);
}

describe("GET /api/credit-cards — user isolation", () => {
  it("list: A's list contains A's card and does not contain B's card", async () => {
    asA();
    const res = (await listGet(getReq("http://localhost/api/credit-cards"))) as Response;
    const body = await res.json();
    expect(res.status).toBe(200);
    const ids = (body.data as Array<{ id: string }>).map((c) => c.id);
    expect(ids).toContain(A.cardId);
    expect(ids).not.toContain(B.cardId);
  });
});

describe("GET /api/credit-cards/:id — user isolation", () => {
  it("get: A reading B's card id returns 404", async () => {
    asA();
    const res = (await getById(new Request("http://localhost"), { params: { id: B.cardId } })) as Response;
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/credit-cards/:id — user isolation", () => {
  it("patch: A updating B's card returns 404; B's card row is unchanged in DB", async () => {
    asA();
    const req = jsonReq("http://localhost", { name: "hacked" }, "PATCH");
    const res = (await patchById(req, { params: { id: B.cardId } })) as Response;
    expect(res.status).toBe(404);

    const [row] = await currentDb
      .select()
      .from(schema.creditCards)
      .where(eq(schema.creditCards.id, B.cardId));
    expect(row!.name).toBe("Card B");
  });
});

describe("DELETE /api/credit-cards/:id — user isolation", () => {
  it("delete (soft): A archiving B's card returns 404; B's card still isActive=true", async () => {
    asA();
    const res = (await deleteById(new Request("http://localhost/api/credit-cards/" + B.cardId), { params: { id: B.cardId } })) as Response;
    expect(res.status).toBe(404);

    const [row] = await currentDb
      .select()
      .from(schema.creditCards)
      .where(eq(schema.creditCards.id, B.cardId));
    expect(row!.isActive).toBe(true);
  });

  it("delete (soft) self: A archiving A's own card sets isActive=false and leaves referencing transactions' creditCardId intact", async () => {
    // Seed a tx that references A's card. Soft archive must NOT null the FK
    // (ON DELETE SET NULL only fires on hard DELETE).
    await currentDb.insert(schema.transactions).values({
      id: "tx-a-on-card",
      userId: A.userId,
      categoryId: A.catId,
      type: "expense",
      amount: "100",
      description: "A on card",
      date: "2026-04-01",
      paymentMethod: "credit_card",
      creditCardId: A.cardId,
    });
    asA();
    const res = (await deleteById(new Request("http://localhost/api/credit-cards/" + A.cardId), { params: { id: A.cardId } })) as Response;
    expect(res.status).toBe(200);

    const [card] = await currentDb
      .select()
      .from(schema.creditCards)
      .where(eq(schema.creditCards.id, A.cardId));
    expect(card!.isActive).toBe(false);

    const [tx] = await currentDb
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, "tx-a-on-card"));
    expect(tx!.creditCardId).toBe(A.cardId);
  });
});

describe("GET /api/credit-cards/:id/cycle — user isolation", () => {
  it("cycle: A reading B's card cycle returns 404", async () => {
    asA();
    const res = (await cycleGet(getReq("http://localhost/api/credit-cards/" + B.cardId + "/cycle"), { params: { id: B.cardId } })) as Response;
    expect(res.status).toBe(404);
  });
});
