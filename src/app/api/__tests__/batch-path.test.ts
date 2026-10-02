/**
 * Every multi-statement write, run against a neon-http-shaped DB: `batch()`
 * exists and `transaction()` throws. The rest of the suite runs on PGlite's
 * transaction branch, so without this file the code path production
 * actually executes would go untested (CLAUDE.md: remittances shipped a
 * db.transaction call that only broke in production).
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  makeNeonLikeTestDb,
  makeTestDb,
  seedTwoUsers,
  session,
  jsonReq,
  TEST_USERS,
  type TestDb,
} from "./_harness";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
let currentDb: TestDb;
vi.mock("@/lib/db", () => ({
  get db() {
    return currentDb;
  },
}));

import { auth } from "@/lib/auth";
import { computeCycleAmountsPaid, reallocateCardCycles } from "@/lib/credit-card-allocation";
import { POST as cardPost } from "../credit-cards/route";
import { PATCH as cardPatch } from "../credit-cards/[id]/route";
import { POST as payPost } from "../credit-cards/[id]/pay/route";
import { PATCH as markIssued } from "../credit-cards/[id]/cycles/[cycleId]/route";
import { POST as remitPost } from "../remittances/route";
import { PATCH as remitPatch } from "../remittances/[id]/route";
import { POST as register } from "../auth/register/route";
import { POST as importPost } from "../import/route";
import { POST as txPost } from "../transactions/route";
import { DELETE as bulkDelete } from "../transactions/bulk/route";
import { POST as budgetPost } from "../budgets/route";

const A = TEST_USERS.A;
const PAY_CAT = "cat-a-ccpay";
const REMIT_CAT = "cat-a-remit";

async function seedA(db: TestDb) {
  await seedTwoUsers(db);
  await db.insert(schema.categories).values([
    { id: PAY_CAT, userId: A.userId, name: "Credit Card Payment", type: "transfer", isDefault: true },
    { id: REMIT_CAT, userId: A.userId, name: "International Transfer", type: "transfer", isDefault: true },
    { id: "cat-a-salary", userId: A.userId, name: "Salary", type: "income" },
    { id: "cat-a-gifts-out", userId: A.userId, name: "Gifts", type: "expense" },
    { id: "cat-a-gifts-in", userId: A.userId, name: "Gifts", type: "income" },
  ]);
  vi.mocked(auth).mockResolvedValue(session(A.userId, A.email) as never);
}

async function cyclesOf(cardId: string) {
  return currentDb
    .select()
    .from(schema.creditCardCycles)
    .where(eq(schema.creditCardCycles.cardId, cardId))
    .orderBy(asc(schema.creditCardCycles.cycleCloseDate));
}

async function createCard(extra: Record<string, unknown> = {}) {
  const res = (await cardPost(
    jsonReq("http://localhost/api/credit-cards", {
      name: "Visa",
      issuer: "Bank",
      creditLimit: 5000,
      lastStatementCloseDate: "2026-03-05",
      paymentDueDate: "2026-03-30",
      ...extra,
    }),
  )) as Response;
  expect(res.status).toBe(200);
  return (await res.json()).data.id as string;
}

function pay(cardId: string, amount: number, date: string) {
  return payPost(jsonReq(`http://localhost/api/credit-cards/${cardId}/pay`, { amount, date }), {
    params: { id: cardId },
  }) as Promise<Response>;
}

describe("db.batch path (neon-http shape)", () => {
  beforeEach(async () => {
    currentDb = await makeNeonLikeTestDb();
    await seedA(currentDb);
  });

  it("the test DB really is neon-shaped", async () => {
    expect(typeof (currentDb as { batch?: unknown }).batch).toBe("function");
    expect(() => currentDb.transaction(async () => {})).toThrow(/No transactions support/);
  });

  it("card POST with a real statement also creates the next projected cycle", async () => {
    const cardId = await createCard({ statementBalance: 300, minimumPayment: 25 });
    const cycles = await cyclesOf(cardId);
    expect(cycles.map((c) => [c.cycleCloseDate, c.paymentDueDate, c.isProjected])).toEqual([
      ["2026-03-05", "2026-03-30", false],
      ["2026-04-04", "2026-04-29", true],
    ]);
  });

  it("pay inserts the payment and allocates it; payments add up", async () => {
    const cardId = await createCard({ statementBalance: 300, minimumPayment: 25 });
    expect((await pay(cardId, 100, "2026-03-20")).status).toBe(200);
    expect((await pay(cardId, 50.25, "2026-03-25")).status).toBe(200);
    const [issued] = await cyclesOf(cardId);
    expect(issued!.amountPaid).toBe("150.25");
  });

  it("card PATCH promoting the projected cycle inserts the next one and re-allocates", async () => {
    const cardId = await createCard();
    await pay(cardId, 80, "2026-03-15");
    const res = (await cardPatch(
      jsonReq(
        `http://localhost/api/credit-cards/${cardId}`,
        { lastStatementCloseDate: "2026-03-05", paymentDueDate: "2026-03-30", statementBalance: 400, minimumPayment: 30 },
        "PATCH",
      ),
      { params: { id: cardId } },
    )) as Response;
    expect(res.status).toBe(200);
    const cycles = await cyclesOf(cardId);
    expect(cycles.map((c) => [c.isProjected, c.amountPaid])).toEqual([
      [false, "80.00"],
      [true, "0.00"],
    ]);
  });

  it("mark-issued promotes, adds the next projected cycle, re-allocates, and refuses a second submit", async () => {
    const cardId = await createCard();
    await pay(cardId, 60, "2026-03-08");
    const [projected] = await cyclesOf(cardId);
    const body = { cycleCloseDate: "2026-03-06", paymentDueDate: "2026-03-31", statementBalance: 250, minimumPayment: 25 };
    const call = () =>
      markIssued(jsonReq("http://localhost", body, "PATCH"), {
        params: { id: cardId, cycleId: projected!.id },
      }) as Promise<Response>;

    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).data.amountPaid).toBe(60);
    expect((await call()).status).toBeGreaterThanOrEqual(400);

    const cycles = await cyclesOf(cardId);
    expect(cycles.map((c) => [c.cycleCloseDate, c.isProjected])).toEqual([
      ["2026-03-06", false],
      ["2026-04-05", true],
    ]);
  });

  it("transaction POST of a card payment and bulk DELETE both re-allocate", async () => {
    const cardId = await createCard({ statementBalance: 300, minimumPayment: 25 });
    const res = (await txPost(
      jsonReq("http://localhost/api/transactions", {
        type: "transfer",
        amount: 40,
        categoryId: PAY_CAT,
        description: "manual payment",
        date: "2026-03-10",
        paymentMethod: "bank_transfer",
        creditCardId: cardId,
      }),
    )) as Response;
    expect(res.status).toBe(201);
    const txId = (await res.json()).data.id as string;
    expect((await cyclesOf(cardId))[0]!.amountPaid).toBe("40.00");

    const del = (await bulkDelete(jsonReq("http://localhost/api/transactions/bulk", { ids: [txId] }, "DELETE"))) as Response;
    expect(del.status).toBe(200);
    expect((await cyclesOf(cardId))[0]!.amountPaid).toBe("0.00");
  });

  it("remittance POST and PATCH write the transaction and remittance rows together", async () => {
    const res = (await remitPost(
      jsonReq("http://localhost/api/remittances", {
        amount: 500,
        date: "2026-04-10",
        description: "Rent home",
        paymentMethod: "bank_transfer",
        fromCurrency: "USD",
        toCurrency: "INR",
        fxRate: 83.25,
        fee: 2,
        service: "wise",
      }),
    )) as Response;
    expect(res.status).toBe(200);
    const id = (await res.json()).data.id as string;

    const patch = (await remitPatch(jsonReq("http://localhost", { description: "Rent (April)", fee: 3 }, "PATCH"), {
      params: { id },
    })) as Response;
    expect(patch.status).toBe(200);
    const [rem] = await currentDb.select().from(schema.remittances).where(eq(schema.remittances.id, id));
    const [tx] = await currentDb.select().from(schema.transactions).where(eq(schema.transactions.id, rem!.transactionId));
    expect(rem!.fee).toBe("3.0000");
    expect(tx!.description).toBe("Rent (April)");
    expect(tx!.categoryId).toBe(REMIT_CAT);
  });

  it("register creates the user and all default categories atomically", async () => {
    const res = (await register(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.20" },
        body: JSON.stringify({ name: "New Person", email: "new@test.com", password: "long-enough" }),
      }),
    )) as Response;
    expect(res.status).toBe(201);
    const userId = (await res.json()).data.id as string;
    const cats = await currentDb.select().from(schema.categories).where(eq(schema.categories.userId, userId));
    expect(cats.length).toBeGreaterThanOrEqual(20);
    expect(cats.filter((c) => c.type === "transfer").map((c) => c.name).sort()).toEqual([
      "Credit Card Payment",
      "International Transfer",
    ]);
  });

  it("import parses civil dates exactly, honors day-first order, matches category by type, and skips bad rows", async () => {
    const res = (await importPost(
      jsonReq("http://localhost/api/import", {
        dateOrder: "DMY",
        rows: [
          { date: "2026-04-01", amount: "12.50", description: "iso", category: "Gifts", type: "expense" },
          { date: "03/04/2026", amount: 20, description: "day-first", category: "Gifts", type: "income" },
          { date: "2026-02-30", amount: 5, description: "impossible" },
          { date: "2026-04-02", amount: "1e13", description: "too big" },
          { date: "2026-04-02", amount: 7, description: "x".repeat(500), notes: "n".repeat(3000), category: "Salary" },
          null,
        ],
      }),
    )) as Response;
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.imported).toBe(3);
    expect(data.skipped).toBe(3);

    const rows = await currentDb
      .select()
      .from(schema.transactions)
      .where(and(eq(schema.transactions.userId, A.userId)))
      .orderBy(asc(schema.transactions.date));
    expect(rows.map((r) => [r.date, r.categoryId])).toEqual([
      ["2026-04-01", "cat-a-gifts-out"],
      ["2026-04-02", A.catId],
      ["2026-04-03", "cat-a-gifts-in"],
    ]);
    const long = rows.find((r) => r.date === "2026-04-02")!;
    expect(long.description).toHaveLength(200);
    expect(long.notes).toHaveLength(2000);
  });

  it("a duplicate overall budget is a 409, not a 500", async () => {
    const body = { amount: 1000, period: "monthly", startDate: "2026-04-01" };
    expect(((await budgetPost(jsonReq("http://localhost/api/budgets", body))) as Response).status).toBe(201);
    expect(((await budgetPost(jsonReq("http://localhost/api/budgets", body))) as Response).status).toBe(409);
  });
});

describe("reallocateCardCycles matches the reference allocation rule", () => {
  // Deterministic PRNG so a failure is reproducible.
  function rng(seed: number) {
    return () => {
      seed = (seed * 1664525 + 1013904223) % 2 ** 32;
      return seed / 2 ** 32;
    };
  }
  const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10);

  it("on 25 random cards with overlapping windows and stray payments", async () => {
    currentDb = await makeTestDb();
    await seedA(currentDb);
    const rand = rng(42);

    for (let card = 0; card < 25; card++) {
      const cardId = `rand-${card}`;
      await currentDb.insert(schema.creditCards).values({ id: cardId, userId: A.userId, name: cardId, issuer: "X", creditLimit: "1000" });

      const cycles: Array<{ id: string; cycleCloseDate: string; paymentDueDate: string }> = [];
      let close = Math.floor(rand() * 20);
      const n = 1 + Math.floor(rand() * 5);
      for (let i = 0; i < n; i++) {
        // Grace up to 45 days on a ~30-day cadence, so windows sometimes overlap.
        const c = { id: `${cardId}-c${i}`, cycleCloseDate: day(close), paymentDueDate: day(close + 10 + Math.floor(rand() * 35)) };
        cycles.push(c);
        close += 25 + Math.floor(rand() * 10);
      }
      await currentDb.insert(schema.creditCardCycles).values(
        cycles.map((c, i) => ({ ...c, cardId, userId: A.userId, isProjected: i === n - 1 })),
      );

      const payments = Array.from({ length: Math.floor(rand() * 8) }, (_, i) => ({
        date: day(Math.floor(rand() * (close + 40))),
        amount: Math.round(rand() * 50000) / 100 + 0.01,
        i,
      }));
      if (payments.length) {
        await currentDb.insert(schema.transactions).values(
          payments.map((p) => ({
            id: `${cardId}-p${p.i}`,
            userId: A.userId,
            categoryId: PAY_CAT,
            type: "transfer" as const,
            amount: p.amount.toFixed(2),
            description: "p",
            date: p.date,
            creditCardId: cardId,
          })),
        );
      }

      await reallocateCardCycles(currentDb, A.userId, cardId);
      const { perCycle } = computeCycleAmountsPaid(cycles, payments);
      const stored = await cyclesOf(cardId);
      for (const row of stored) {
        expect(Number(row.amountPaid)).toBeCloseTo(perCycle.get(row.id) ?? 0, 2);
      }
    }
  });
});
