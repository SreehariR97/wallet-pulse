/**
 * Which account paid each statement: GET /api/credit-cards/:id/cycles lists
 * the payments allocated to every cycle, with their account, using the same
 * rule that sets amount_paid.
 *
 * The card's last statement closed Mar 5 (due Mar 30); the projected cycle
 * closes Apr 4 (due Apr 29). Payment windows are (close, due].
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import * as schema from "@/lib/db/schema";
import { makeTestDb, seedTwoUsers, session, jsonReq, getReq, TEST_USERS, type TestDb } from "./_harness";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
let currentDb: TestDb;
vi.mock("@/lib/db", () => ({
  get db() {
    return currentDb;
  },
}));

import { auth } from "@/lib/auth";
import { POST as createCard } from "../credit-cards/route";
import { GET as listCycles } from "../credit-cards/[id]/cycles/route";
import { GET as cycleWindow } from "../credit-cards/[id]/cycle/route";
import { POST as payCard } from "../credit-cards/[id]/pay/route";
import { POST as createAccount } from "../accounts/route";
import { POST as createTx } from "../transactions/route";
import type { CreditCardCycleRowDTO, CreditCardCycleDTO } from "@/types";

const A = TEST_USERS.A;
const B = TEST_USERS.B;
const asUser = (u: { userId: string; email: string }) =>
  vi.mocked(auth).mockResolvedValue(session(u.userId, u.email) as never);

let card: string;
let checking: string;
let savings: string;

async function idOf(res: Response | undefined): Promise<string> {
  const r = res as Response;
  expect(r.status).toBeLessThan(300);
  return ((await r.json()) as { data: { id: string } }).data.id;
}
const pay = async (amount: number, date: string, accountId: string | null = null) =>
  idOf(await payCard(jsonReq(`http://localhost/api/credit-cards/${card}/pay`, { amount, date, accountId }), { params: { id: card } }));
async function cycles(): Promise<CreditCardCycleRowDTO[]> {
  const res = (await listCycles(getReq(`http://localhost/api/credit-cards/${card}/cycles`), { params: { id: card } })) as Response;
  return ((await res.json()) as { data: CreditCardCycleRowDTO[] }).data;
}

beforeEach(async () => {
  currentDb = await makeTestDb();
  await seedTwoUsers(currentDb);
  await currentDb
    .insert(schema.categories)
    .values({ id: "cat-ccpay", userId: A.userId, name: "Credit Card Payment", type: "transfer", isDefault: true });
  asUser(A);
  card = await idOf(
    await createCard(
      jsonReq("http://localhost/api/credit-cards", {
        name: "Visa",
        issuer: "Bank",
        creditLimit: 5000,
        lastStatementCloseDate: "2026-03-05",
        paymentDueDate: "2026-03-30",
        statementBalance: 300,
        minimumPayment: 25,
      }),
    ),
  );
  checking = await idOf(await createAccount(jsonReq("http://localhost/api/accounts", { name: "Checking" })));
  savings = await idOf(await createAccount(jsonReq("http://localhost/api/accounts", { name: "Savings" })));
});

describe("payments per statement cycle", () => {
  it("lists each cycle's payments with the account that paid", async () => {
    await pay(100, "2026-03-10", checking);
    await pay(50, "2026-03-20", savings);
    await pay(30, "2026-04-10");
    await pay(20, "2026-03-31", checking); // between Mar 30 due and Apr 4 close: no cycle

    const [projected, issued] = await cycles();
    expect(issued!.payments.map((p) => [p.date, p.amount, p.accountName])).toEqual([
      ["2026-03-10", 100, "Checking"],
      ["2026-03-20", 50, "Savings"],
    ]);
    expect(issued!.amountPaid).toBe(150);
    expect(projected!.payments.map((p) => [p.amount, p.accountId, p.accountName])).toEqual([[30, null, null]]);
    expect(projected!.amountPaid).toBe(30);
  });

  it("always agrees with amount_paid, payment by payment", async () => {
    // Deterministic pseudo-random dates across both windows and the gaps.
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 16; i++) {
      const day = new Date(Date.UTC(2026, 2, 1 + Math.floor(rand() * 75))).toISOString().slice(0, 10);
      const acct = [checking, savings, null][Math.floor(rand() * 3)]!;
      const res = await createTx(
        jsonReq("http://localhost/api/transactions", {
          type: "transfer",
          amount: 1 + Math.floor(rand() * 90),
          categoryId: "cat-ccpay",
          description: "payment",
          date: day,
          paymentMethod: "bank_transfer",
          creditCardId: card,
          accountId: acct,
        }),
      );
      expect((res as Response).status).toBe(201);
    }
    for (const c of await cycles()) {
      const sum = Math.round(c.payments.reduce((s, p) => s + p.amount, 0) * 100) / 100;
      expect(sum).toBe(c.amountPaid);
      expect(c.payments.every((p) => p.date > c.cycleCloseDate && p.date <= c.paymentDueDate)).toBe(true);
    }
  });

  it("shows the paying account on the card's transaction list", async () => {
    await pay(40, "2026-03-03", checking);
    const res = (await cycleWindow(getReq(`http://localhost/api/credit-cards/${card}/cycle`, { period: "previous" }), {
      params: { id: card },
    })) as Response;
    const { data } = (await res.json()) as { data: CreditCardCycleDTO };
    expect(data.transactions.map((t) => [t.type, t.amount, t.accountName])).toEqual([["transfer", 40, "Checking"]]);
  });

  it("is private to the card's owner", async () => {
    await pay(100, "2026-03-10", checking);
    asUser(B);
    const res = (await listCycles(getReq("http://localhost"), { params: { id: card } })) as Response;
    expect(res.status).toBe(404);
  });
});
