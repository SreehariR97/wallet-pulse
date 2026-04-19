/**
 * Money-pipeline value tests.
 *
 * Complement to isolation.test.ts: the isolation tests prove the round-trip
 * runs without error; these tests prove the values are correct — typed as
 * `number`, equal to what was written, exact under SUM, and not contaminated
 * across tenants.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
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
import { GET as txListGet, POST as txListPost } from "../route";
import { GET as budgetsGet } from "../../budgets/route";
import { GET as profileGet } from "../../user/profile/route";
import { GET as categoriesGet } from "../../categories/route";
import { GET as creditCardsGet } from "../../credit-cards/route";
import { GET as analyticsSummaryGet } from "../../analytics/summary/route";
import { GET as remittancesGet } from "../../remittances/route";
import { GET as exportGet } from "../../export/route";

const A = { ...TEST_USERS.A, cardId: "card-a" };
const B = TEST_USERS.B;
const TX_DATE = "2026-04-10";

beforeEach(async () => {
  currentDb = await makeTestDb();
  await seedTwoUsers(currentDb);
});

function asA() {
  vi.mocked(auth).mockResolvedValue(session(A.userId, A.email) as never);
}

describe("Money pipeline — response shape round-trip (Group A)", () => {
  it("A1: transactions.amount → GET /api/transactions returns typeof number, exact value", async () => {
    await currentDb.insert(schema.transactions).values({
      id: "tx-1",
      userId: A.userId,
      categoryId: A.catId,
      type: "expense",
      amount: "123.45",
      description: "probe",
      date: TX_DATE,
    });
    asA();
    const res = (await txListGet(getReq("http://localhost/api/transactions"))) as Response;
    const body = await res.json();
    const row = (body.data as Array<{ id: string; amount: unknown }>).find((r) => r.id === "tx-1");
    expect(row).toBeDefined();
    expect(typeof row!.amount).toBe("number");
    expect(row!.amount).toBe(123.45);
  });

  it("A2: budgets.amount → GET /api/budgets returns typeof number, exact value", async () => {
    await currentDb.insert(schema.budgets).values({
      id: "b-1",
      userId: A.userId,
      categoryId: A.catId,
      amount: "500",
      period: "monthly",
      startDate: "2026-04-01",
    });
    asA();
    const res = (await budgetsGet()) as Response;
    const body = await res.json();
    const row = (body.data as Array<{ id: string; amount: unknown }>).find((r) => r.id === "b-1");
    expect(row).toBeDefined();
    expect(typeof row!.amount).toBe("number");
    expect(row!.amount).toBe(500);
  });

  it("A3: users.monthlyBudget → GET /api/user/profile returns typeof number, exact value", async () => {
    await currentDb
      .update(schema.users)
      .set({ monthlyBudget: "2500" })
      .where((await import("drizzle-orm")).eq(schema.users.id, A.userId));
    asA();
    const res = (await profileGet()) as Response;
    const body = await res.json();
    expect(typeof body.data.monthlyBudget).toBe("number");
    expect(body.data.monthlyBudget).toBe(2500);
  });

  it("A4: categories.budgetLimit → GET /api/categories returns typeof number, exact value", async () => {
    // Update the seeded Cat A with a budgetLimit directly (the existing cat
    // row doesn't have one; the default-category backfill runs on GET but
    // only inserts missing defaults — it doesn't touch existing rows).
    await currentDb
      .update(schema.categories)
      .set({ budgetLimit: "150" })
      .where((await import("drizzle-orm")).eq(schema.categories.id, A.catId));
    asA();
    const res = (await categoriesGet()) as Response;
    const body = await res.json();
    const row = (body.data as Array<{ id: string; budgetLimit: unknown }>).find(
      (r) => r.id === A.catId,
    );
    expect(row).toBeDefined();
    expect(typeof row!.budgetLimit).toBe("number");
    expect(row!.budgetLimit).toBe(150);
  });

  it("A5: creditCards.creditLimit + utilizationPercent → GET /api/credit-cards returns typeof number, exact values", async () => {
    await currentDb.insert(schema.creditCards).values({
      id: A.cardId,
      userId: A.userId,
      name: "Card A",
      issuer: "Chase",
      creditLimit: "5000",
    });
    // Phase 5: list endpoint requires a cycle row per card.
    await currentDb.insert(schema.creditCardCycles).values({
      id: "cycle-a5",
      cardId: A.cardId,
      userId: A.userId,
      cycleCloseDate: "2026-04-15",
      paymentDueDate: "2026-05-10",
      isProjected: true,
    });
    // One expense of 1000 against the card → balance=1000, utilization=20%.
    await currentDb.insert(schema.transactions).values({
      id: "tx-cc",
      userId: A.userId,
      categoryId: A.catId,
      type: "expense",
      amount: "1000",
      description: "charge",
      date: TX_DATE,
      paymentMethod: "credit_card",
      creditCardId: A.cardId,
    });
    asA();
    const res = (await creditCardsGet(getReq("http://localhost/api/credit-cards"))) as Response;
    const body = await res.json();
    const row = (body.data as Array<{ id: string; creditLimit: unknown; utilizationPercent: unknown }>).find(
      (r) => r.id === A.cardId,
    );
    expect(row).toBeDefined();
    expect(typeof row!.creditLimit).toBe("number");
    expect(row!.creditLimit).toBe(5000);
    expect(typeof row!.utilizationPercent).toBe("number");
    expect(row!.utilizationPercent).toBe(20);
  });
});

describe("Money pipeline — precision edge cases (Group B)", () => {
  it("B1: rounding — inserting '10.555' rounds to 10.56 (banker's round to scale 2)", async () => {
    // Seeding via direct DB insert; Zod's .positive() would accept 10.555
    // but the rounding behavior is a DB property and we want to assert it
    // independently of the coerce-through-Zod path.
    await currentDb.insert(schema.transactions).values({
      id: "tx-round",
      userId: A.userId,
      categoryId: A.catId,
      type: "expense",
      amount: "10.555",
      description: "round",
      date: TX_DATE,
    });
    asA();
    const res = (await txListGet(getReq("http://localhost/api/transactions"))) as Response;
    const body = await res.json();
    const row = (body.data as Array<{ id: string; amount: unknown }>).find((r) => r.id === "tx-round");
    expect(row).toBeDefined();
    expect(typeof row!.amount).toBe("number");
    expect(row!.amount).toBe(10.56);
  });

  it("B2: zero — DB-stored '0' round-trips as number 0 (bypasses Zod .positive())", async () => {
    // Zod rejects 0 at the route (transactionCreateSchema .positive()), so
    // we seed directly. The READ side (what this test exercises) must still
    // surface the value as number 0 — not null, not "0", not "0.00".
    await currentDb.insert(schema.transactions).values({
      id: "tx-zero",
      userId: A.userId,
      categoryId: A.catId,
      type: "expense",
      amount: "0",
      description: "zero",
      date: TX_DATE,
    });
    asA();
    const res = (await txListGet(getReq("http://localhost/api/transactions"))) as Response;
    const body = await res.json();
    const row = (body.data as Array<{ id: string; amount: unknown }>).find((r) => r.id === "tx-zero");
    expect(row).toBeDefined();
    expect(typeof row!.amount).toBe("number");
    expect(row!.amount).toBe(0);
  });

  it("B3: negative — POST /api/transactions with amount=-5.25 is rejected by Zod with 400", async () => {
    asA();
    const req = jsonReq("http://localhost/api/transactions", {
      type: "expense",
      amount: -5.25,
      categoryId: A.catId,
      description: "neg",
      date: "2026-04-10",
      paymentMethod: "cash",
    });
    const res = (await txListPost(req)) as Response;
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("B4: within-precision — '99999999999.99' (13 digits) round-trips exactly", async () => {
    await currentDb.insert(schema.transactions).values({
      id: "tx-big",
      userId: A.userId,
      categoryId: A.catId,
      type: "expense",
      amount: "99999999999.99",
      description: "big",
      date: TX_DATE,
    });
    asA();
    const res = (await txListGet(getReq("http://localhost/api/transactions"))) as Response;
    const body = await res.json();
    const row = (body.data as Array<{ id: string; amount: unknown }>).find((r) => r.id === "tx-big");
    expect(row).toBeDefined();
    expect(typeof row!.amount).toBe("number");
    expect(row!.amount).toBe(99999999999.99);
  });

  it("B6: overflow via query param — GET ?maxAmount=9999999999999.99 rejected with 400", async () => {
    asA();
    const res = (await txListGet(
      getReq("http://localhost/api/transactions", { maxAmount: "9999999999999.99" }),
    )) as Response;
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details?.maxAmount).toBeDefined();
  });

  // B5: Overflow rejected cleanly by Zod max() — no unhandled rejection.
  it("B5: overflow — POST with 9999999999999.99 is rejected with 400 by Zod max()", async () => {
    asA();
    const req = jsonReq("http://localhost/api/transactions", {
      type: "expense",
      amount: 9999999999999.99,
      categoryId: A.catId,
      description: "overflow",
      date: "2026-04-10",
      paymentMethod: "cash",
    });
    const res = (await txListPost(req)) as Response;
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details?.amount).toBeDefined();
    expect(Array.isArray(body.details.amount)).toBe(true);
  });
});

describe("Money pipeline — arithmetic correctness (Group C)", () => {
  it("C1: SUM(10 × 0.1) via analytics/summary returns exactly 1.0 (audit finding: float-compounding is resolved)", async () => {
    // Ten 10-cent expenses. Under double precision these would compound to
    // ~0.9999999999999999; under numeric(14,2) Postgres computes the sum
    // exactly and returns "1.00". Strict equality is the point of the test —
    // weakening to toBeCloseTo would mask a migration regression.
    for (let i = 0; i < 10; i++) {
      await currentDb.insert(schema.transactions).values({
        id: `tx-c${i}`,
        userId: A.userId,
        categoryId: A.catId,
        type: "expense",
        amount: "0.1",
        description: `c${i}`,
        date: `2026-04-${String(i + 1).padStart(2, "0")}`,
      });
    }
    asA();
    const res = (await analyticsSummaryGet(
      getReq("http://localhost/api/analytics/summary", {
        from: "2026-04-01",
        to: "2026-04-30",
      }),
    )) as Response;
    const body = await res.json();
    expect(typeof body.data.expense).toBe("number");
    expect(body.data.expense).toBe(1.0);
  });
});

describe("Money pipeline — cross-tenant value isolation (Group D)", () => {
  it("D1: analytics/summary for A excludes B's expense value exactly (no 999.99 + 111.11 leak)", async () => {
    await currentDb.insert(schema.transactions).values([
      {
        id: "tx-a-only",
        userId: A.userId,
        categoryId: A.catId,
        type: "expense",
        amount: "999.99",
        description: "A only",
        date: TX_DATE,
      },
      {
        id: "tx-b-only",
        userId: B.userId,
        categoryId: B.catId,
        type: "expense",
        amount: "111.11",
        description: "B only",
        date: TX_DATE,
      },
    ]);
    asA();
    const res = (await analyticsSummaryGet(
      getReq("http://localhost/api/analytics/summary", {
        from: "2026-04-01",
        to: "2026-04-30",
      }),
    )) as Response;
    const body = await res.json();
    expect(typeof body.data.expense).toBe("number");
    expect(body.data.expense).toBe(999.99);
    expect(body.data.expense).not.toBe(1111.1);
  });

  it("D2: transactions list for A sums to 300 exactly; no row matches B's 500", async () => {
    await currentDb.insert(schema.transactions).values([
      {
        id: "tx-a1",
        userId: A.userId,
        categoryId: A.catId,
        type: "expense",
        amount: "100",
        description: "A1",
        date: TX_DATE,
      },
      {
        id: "tx-a2",
        userId: A.userId,
        categoryId: A.catId,
        type: "expense",
        amount: "200",
        description: "A2",
        date: TX_DATE,
      },
      {
        id: "tx-b1",
        userId: B.userId,
        categoryId: B.catId,
        type: "expense",
        amount: "500",
        description: "B1",
        date: TX_DATE,
      },
    ]);
    asA();
    const res = (await txListGet(getReq("http://localhost/api/transactions"))) as Response;
    const body = await res.json();
    const rows = body.data as Array<{ amount: number }>;
    expect(rows).toHaveLength(2);
    const total = rows.reduce((acc, r) => acc + r.amount, 0);
    expect(total).toBe(300);
    expect(rows.every((r) => r.amount !== 500)).toBe(true);
  });
});

describe("Query param validation (Group F — task 8)", () => {
  it("F1: GET /api/transactions?from=banana rejected with 400 (date regex)", async () => {
    asA();
    const res = (await txListGet(
      getReq("http://localhost/api/transactions", { from: "banana" }),
    )) as Response;
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details?.from).toBeDefined();
  });

  it("F2: GET /api/transactions?page=99999 rejected with 400 (page max 10000)", async () => {
    asA();
    const res = (await txListGet(
      getReq("http://localhost/api/transactions", { page: "99999" }),
    )) as Response;
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details?.page).toBeDefined();
  });

  it("F3: GET /api/transactions?search=<201-char> rejected with 400 (search max 200)", async () => {
    asA();
    const oversized = "x".repeat(201);
    const res = (await txListGet(
      getReq("http://localhost/api/transactions", { search: oversized }),
    )) as Response;
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details?.search).toBeDefined();
  });

  it("F4: GET /api/transactions?tags=<201-char> rejected with 400 (tags max 200)", async () => {
    asA();
    const oversized = "y".repeat(201);
    const res = (await txListGet(
      getReq("http://localhost/api/transactions", { tags: oversized }),
    )) as Response;
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details?.tags).toBeDefined();
  });

  it("F5: GET /api/remittances?from=banana rejected with 400 (separate schema, same regex)", async () => {
    asA();
    const res = (await remittancesGet(
      getReq("http://localhost/api/remittances", { from: "banana" }),
    )) as Response;
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details?.from).toBeDefined();
  });

  it("F6: GET /api/analytics/summary?from=2026/01/15 rejected with 400 (new analytics Zod wrapping)", async () => {
    asA();
    const res = (await analyticsSummaryGet(
      getReq("http://localhost/api/analytics/summary", { from: "2026/01/15" }),
    )) as Response;
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details?.from).toBeDefined();
  });

  it("F7: GET /api/export?format=banana rejected with 400 (format enum)", async () => {
    asA();
    const res = (await exportGet(
      getReq("http://localhost/api/export", { format: "banana" }),
    )) as Response;
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details?.format).toBeDefined();
  });
});
