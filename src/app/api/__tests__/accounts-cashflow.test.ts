/**
 * Accounts (balances, claiming, validation, isolation) and the cash-flow
 * analytics view, against one realistic month:
 *
 *   checking opens at 1000, savings at 0
 *   +500  salary into checking
 *   -200  groceries paid from checking
 *   -400  dining on the credit card (no account)
 *   -100  card payment from checking
 *   -300  checking → savings
 *   -50   loan given from checking
 *
 *   checking = 1000 + 500 - 200 - 100 - 300 - 50 = 850; savings = 300
 *   spending view: income 500, expense 600 (groceries + card dining)
 *   cash flow:     in 500, out 350 (groceries, card payment, loan;
 *                  card dining waits for the payment, internal move nets out)
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
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
import { GET as listAccounts, POST as createAccount } from "../accounts/route";
import { PATCH as patchAccount, DELETE as archiveAccount } from "../accounts/[id]/route";
import { GET as listTx, POST as createTx } from "../transactions/route";
import { PUT as putTx } from "../transactions/[id]/route";
import { POST as payCard } from "../credit-cards/[id]/pay/route";
import { GET as summary } from "../analytics/summary/route";
import { GET as trends } from "../analytics/trends/route";
import { GET as breakdown } from "../analytics/category-breakdown/route";
import { GET as methods } from "../analytics/payment-methods/route";
import { POST as importCsv } from "../import/route";

const A = TEST_USERS.A;
const B = TEST_USERS.B;
const CAT = {
  salary: "cat-a-salary",
  loan: "cat-a-loan",
  ccPay: "cat-a-ccpay",
  move: "cat-a-move",
};
const CARD = "card-a";
const DAY = "2026-04-10";

const asUser = (u: { userId: string; email: string }) =>
  vi.mocked(auth).mockResolvedValue(session(u.userId, u.email) as never);

async function json<T>(res: Response | undefined): Promise<{ status: number; body: T }> {
  const r = res as Response;
  return { status: r.status, body: (await r.json()) as T };
}

async function newAccount(body: Record<string, unknown>) {
  const { status, body: res } = await json<{ data: { id: string } }>(
    await createAccount(jsonReq("http://localhost/api/accounts", { type: "checking", ...body })),
  );
  expect(status).toBe(201);
  return res.data.id;
}

async function tx(body: Record<string, unknown>) {
  return json<{ data: { id: string }; error?: string }>(
    await createTx(
      jsonReq("http://localhost/api/transactions", {
        description: "t",
        date: DAY,
        paymentMethod: "bank_transfer",
        ...body,
      }),
    ),
  );
}

beforeEach(async () => {
  currentDb = await makeTestDb();
  await seedTwoUsers(currentDb);
  await currentDb.insert(schema.categories).values([
    { id: CAT.salary, userId: A.userId, name: "Salary", type: "income" },
    { id: CAT.loan, userId: A.userId, name: "Friends", type: "loan" },
    { id: CAT.ccPay, userId: A.userId, name: "Credit Card Payment", type: "transfer", isDefault: true },
    { id: CAT.move, userId: A.userId, name: "Account Transfer", type: "transfer", isDefault: true },
  ]);
  await currentDb
    .insert(schema.creditCards)
    .values({ id: CARD, userId: A.userId, name: "Visa", issuer: "Bank", creditLimit: "5000" });
  await currentDb.insert(schema.creditCardCycles).values({
    id: "cyc-a",
    cardId: CARD,
    userId: A.userId,
    cycleCloseDate: "2026-04-01",
    paymentDueDate: "2026-04-25",
    isProjected: true,
  });
  asUser(A);
});

/** Builds the scenario in the header comment through the real routes. */
async function seedScenario() {
  const checking = await newAccount({ name: "Checking", openingBalance: 1000 });
  const savings = await newAccount({ name: "Savings", type: "savings" });
  expect((await tx({ type: "income", amount: 500, categoryId: CAT.salary, accountId: checking })).status).toBe(201);
  expect((await tx({ type: "expense", amount: 200, categoryId: A.catId, paymentMethod: "debit_card", accountId: checking })).status).toBe(201);
  expect(
    (await tx({ type: "expense", amount: 400, categoryId: A.catId, paymentMethod: "credit_card", creditCardId: CARD })).status,
  ).toBe(201);
  const pay = await payCard(jsonReq(`http://localhost/api/credit-cards/${CARD}/pay`, { amount: 100, date: DAY, accountId: checking }), {
    params: { id: CARD },
  });
  expect((pay as Response).status).toBe(200);
  expect(
    (await tx({ type: "transfer", amount: 300, categoryId: CAT.move, accountId: checking, transferAccountId: savings })).status,
  ).toBe(201);
  expect((await tx({ type: "loan_given", amount: 50, categoryId: CAT.loan, accountId: checking })).status).toBe(201);
  return { checking, savings };
}

describe("accounts", () => {
  it("computes balances from opening balance, signed transactions and incoming transfers", async () => {
    const { checking, savings } = await seedScenario();
    const { body } = await json<{ data: Array<{ id: string; balance: number; transactionCount: number }> }>(
      await listAccounts(getReq("http://localhost/api/accounts")),
    );
    const byId = new Map(body.data.map((a) => [a.id, a]));
    expect(byId.get(checking)).toMatchObject({ balance: 850, transactionCount: 5 });
    expect(byId.get(savings)).toMatchObject({ balance: 300, transactionCount: 1 });
  });

  it("rejects a duplicate name, case-insensitively", async () => {
    await newAccount({ name: "Checking" });
    const { status } = await json(await createAccount(jsonReq("http://localhost/api/accounts", { name: "checking" })));
    expect(status).toBe(409);
  });

  it("can adopt unassigned transactions, but never card-paid expenses or another user's rows", async () => {
    await currentDb.insert(schema.transactions).values([
      { id: "old-income", userId: A.userId, categoryId: CAT.salary, type: "income", amount: "10", description: "x", date: DAY },
      { id: "old-cash", userId: A.userId, categoryId: A.catId, type: "expense", amount: "5", description: "x", date: DAY },
      { id: "old-card", userId: A.userId, categoryId: A.catId, type: "expense", amount: "7", description: "x", date: DAY, creditCardId: CARD, paymentMethod: "credit_card" },
      { id: "b-row", userId: B.userId, categoryId: B.catId, type: "expense", amount: "9", description: "x", date: DAY },
    ]);
    const id = await newAccount({ name: "Main", claimUnassigned: true });
    const rows = await currentDb.select({ id: schema.transactions.id, accountId: schema.transactions.accountId }).from(schema.transactions);
    const accountOf = Object.fromEntries(rows.map((r) => [r.id, r.accountId]));
    expect(accountOf).toEqual({ "old-income": id, "old-cash": id, "old-card": null, "b-row": null });
  });

  it("keeps accounts private to their owner", async () => {
    const id = await newAccount({ name: "Mine" });
    asUser(B);
    const list = await json<{ data: unknown[] }>(await listAccounts(getReq("http://localhost/api/accounts")));
    expect(list.body.data).toEqual([]);
    expect((await json(await patchAccount(jsonReq("http://localhost", { name: "Hacked" }, "PATCH"), { params: { id } }))).status).toBe(404);
    expect((await json(await archiveAccount(new Request("http://localhost"), { params: { id } }))).status).toBe(404);
    const linked = await json<{ error: string }>(
      await createTx(
        jsonReq("http://localhost/api/transactions", { type: "expense", amount: 1, categoryId: B.catId, description: "x", date: DAY, accountId: id }),
      ),
    );
    expect(linked).toMatchObject({ status: 400, body: { error: "Invalid account" } });
  });
});

describe("transaction account rules", () => {
  it("rejects contradictory combinations", async () => {
    const checking = await newAccount({ name: "Checking" });
    const savings = await newAccount({ name: "Savings" });
    const cases: Array<[Record<string, unknown>, RegExp]> = [
      [{ type: "expense", amount: 1, categoryId: A.catId, paymentMethod: "credit_card", creditCardId: CARD, accountId: checking }, /card-paid expense/],
      [{ type: "expense", amount: 1, categoryId: A.catId, accountId: checking, transferAccountId: savings }, /Only transfers/],
      [{ type: "transfer", amount: 1, categoryId: CAT.move, transferAccountId: savings }, /comes from/],
      [{ type: "transfer", amount: 1, categoryId: CAT.move, accountId: checking, transferAccountId: checking }, /two different/],
    ];
    for (const [body, error] of cases) {
      const res = await tx(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(error);
    }
  });

  it("refuses new links to an archived account but keeps existing ones on edit", async () => {
    const checking = await newAccount({ name: "Checking" });
    const created = await tx({ type: "income", amount: 5, categoryId: CAT.salary, accountId: checking });
    await archiveAccount(new Request("http://localhost"), { params: { id: checking } });

    expect((await tx({ type: "income", amount: 5, categoryId: CAT.salary, accountId: checking })).body.error).toBe("That account is archived");
    const edit = await json(
      await putTx(jsonReq("http://localhost", { description: "renamed", accountId: checking }, "PUT"), {
        params: { id: created.body.data.id },
      }),
    );
    expect(edit.status).toBe(200);
  });

  it("filters the list by account, including transfers into it, with account names", async () => {
    const { savings } = await seedScenario();
    const { body } = await json<{ data: Array<{ type: string; accountName: string; transferAccountName: string | null }> }>(
      await listTx(getReq("http://localhost/api/transactions", { accountId: savings })),
    );
    expect(body.data).toEqual([expect.objectContaining({ type: "transfer", accountName: "Checking", transferAccountName: "Savings" })]);
  });
});

describe("CSV import into an account", () => {
  it("puts every imported row on the chosen account, and refuses someone else's", async () => {
    const checking = await newAccount({ name: "Checking" });
    const rows = [
      { date: "2026-04-01", type: "income", amount: "100", description: "pay" },
      { date: "2026-04-02", amount: "30", description: "lunch" },
    ];
    const res = await importCsv(jsonReq("http://localhost/api/import", { rows, accountId: checking }));
    expect(res!.status).toBe(201);
    const { body } = await json<{ data: Array<{ id: string; balance: number }> }>(
      await listAccounts(getReq("http://localhost/api/accounts")),
    );
    expect(body.data.find((a) => a.id === checking)?.balance).toBe(70);

    asUser(B);
    const other = await importCsv(jsonReq("http://localhost/api/import", { rows, accountId: checking }));
    expect(other!.status).toBe(400);
  });
});

describe("cash-flow analytics", () => {
  const range = { from: "2026-04-01", to: "2026-04-30" };

  async function totals(params: Record<string, string>) {
    const { body } = await json<{ data: { income: number; expense: number } }>(
      await summary(getReq("http://localhost/api/analytics/summary", { ...range, ...params })),
    );
    return { in: body.data.income, out: body.data.expense };
  }

  it("spending view is unchanged: income vs expense, card purchases included", async () => {
    await seedScenario();
    expect(await totals({})).toEqual({ in: 500, out: 600 });
  });

  it("cash-flow view counts money leaving accounts: card payment yes, card purchase and internal moves no", async () => {
    await seedScenario();
    expect(await totals({ view: "cashflow" })).toEqual({ in: 500, out: 350 });
  });

  it("cash flow for one account equals that account's balance movement", async () => {
    const { checking, savings } = await seedScenario();
    expect(await totals({ view: "cashflow", accountId: checking })).toEqual({ in: 500, out: 650 }); // 1000 - 150 = 850
    expect(await totals({ view: "cashflow", accountId: savings })).toEqual({ in: 300, out: 0 });
  });

  it("trends, category breakdown and payment methods follow the view", async () => {
    await seedScenario();
    const trend = await json<{ data: Array<{ income: number; expense: number }> }>(
      await trends(getReq("http://localhost/api/analytics/trends", { ...range, view: "cashflow" })),
    );
    expect(trend.body.data.reduce((s, p) => s + p.expense, 0)).toBe(350);

    const cats = async (view: string) =>
      (
        await json<{ data: Array<{ name: string; total: number }> }>(
          await breakdown(getReq("http://localhost/api/analytics/category-breakdown", { ...range, view, type: "expense" })),
        )
      ).body.data.map((c) => [c.name, c.total]);
    expect(await cats("spending")).toEqual([["Cat A", 600]]);
    expect(await cats("cashflow")).toEqual(
      expect.arrayContaining([
        ["Cat A", 200],
        ["Credit Card Payment", 100],
        ["Friends", 50],
      ]),
    );

    const pm = await json<{ data: Array<{ paymentMethod: string; total: number }> }>(
      await methods(getReq("http://localhost/api/analytics/payment-methods", { ...range, view: "cashflow" })),
    );
    expect(pm.body.data.find((m) => m.paymentMethod === "credit_card")).toBeUndefined();
  });

  it("deleting the user cascades cleanly through accounts and transfers", async () => {
    await seedScenario();
    await currentDb.delete(schema.users).where(eq(schema.users.id, A.userId));
    expect(await currentDb.select().from(schema.accounts)).toEqual([]);
  });
});
