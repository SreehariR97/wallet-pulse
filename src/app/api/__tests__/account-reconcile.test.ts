/**
 * Reconciling an account against a bank statement.
 *
 * Checking opens at 1000. Transactions: +500 income on Apr 5, −200 expense
 * on Apr 10, −50 expense on Apr 20. WalletPulse's balance on Apr 15 is 1300.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
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
import { DELETE as archiveAccount } from "../accounts/[id]/route";
import { GET as preview, POST as reconcile } from "../accounts/[id]/reconcile/route";
import { POST as createTx } from "../transactions/route";
import { DELETE as deleteTx } from "../transactions/[id]/route";
import { GET as summary } from "../analytics/summary/route";
import type { AccountListItemDTO, AccountReconcilePreviewDTO, AccountReconcileResultDTO } from "@/types";

const A = TEST_USERS.A;
const B = TEST_USERS.B;
const SALARY = "cat-a-salary";
const ADJUST = "cat-a-adjust";
const asUser = (u: { userId: string; email: string }) =>
  vi.mocked(auth).mockResolvedValue(session(u.userId, u.email) as never);

async function body<T>(res: Response | undefined): Promise<{ status: number; data: T; error?: string }> {
  const r = res as Response;
  const j = (await r.json()) as { data: T; error?: string };
  return { status: r.status, data: j.data, error: j.error };
}

let checking: string;

async function tx(b: Record<string, unknown>) {
  const res = await createTx(
    jsonReq("http://localhost/api/transactions", { description: "t", paymentMethod: "debit_card", accountId: checking, ...b }),
  );
  expect((res as Response).status).toBe(201);
  return ((await (res as Response).json()) as { data: { id: string } }).data.id;
}

const post = (b: Record<string, unknown>, id = checking) =>
  reconcile(jsonReq(`http://localhost/api/accounts/${id}/reconcile`, b), { params: { id } });
const balanceOn = async (date: string, id = checking) =>
  (await body<AccountReconcilePreviewDTO>(await preview(getReq(`http://localhost/api/accounts/${id}/reconcile`, { date }), { params: { id } }))).data;
const listed = async () =>
  (await body<AccountListItemDTO[]>(await listAccounts(getReq("http://localhost/api/accounts")))).data.find((a) => a.id === checking)!;

beforeEach(async () => {
  currentDb = await makeTestDb();
  await seedTwoUsers(currentDb);
  await currentDb.insert(schema.categories).values([
    { id: SALARY, userId: A.userId, name: "Salary", type: "income" },
    { id: ADJUST, userId: A.userId, name: "Balance Adjustment", type: "transfer", isDefault: true },
  ]);
  asUser(A);
  const res = await createAccount(jsonReq("http://localhost/api/accounts", { name: "Checking", openingBalance: 1000 }));
  checking = ((await (res as Response).json()) as { data: { id: string } }).data.id;
  await tx({ type: "income", amount: 500, categoryId: SALARY, date: "2026-04-05" });
  await tx({ type: "expense", amount: 200, categoryId: A.catId, date: "2026-04-10" });
  await tx({ type: "expense", amount: 50, categoryId: A.catId, date: "2026-04-20" });
});

describe("account reconciliation", () => {
  it("previews the balance at the end of the statement date, ignoring later transactions", async () => {
    expect((await balanceOn("2026-04-15")).balance).toBe(1300);
    expect((await balanceOn("2026-04-10")).balance).toBe(1300);
    expect((await balanceOn("2026-04-09")).balance).toBe(1500);
    expect((await balanceOn("2026-04-30")).balance).toBe(1250);
  });

  it("closes a gap where WalletPulse is too high with a transfer out, dated on the statement", async () => {
    const res = await body<AccountReconcileResultDTO>(await post({ statementDate: "2026-04-15", statementBalance: 1280.5, expectedBalance: 1300 }));
    expect(res.status).toBe(201);
    expect(res.data.reconciliation).toMatchObject({ computedBalance: 1300, statementBalance: 1280.5, difference: -19.5 });
    expect(res.data.adjustment).toMatchObject({
      type: "transfer",
      amount: 19.5,
      date: "2026-04-15",
      accountId: checking,
      transferAccountId: null,
      categoryId: ADJUST,
    });
    expect((await balanceOn("2026-04-15")).balance).toBe(1280.5);
    expect((await listed()).reconciliation).toEqual({
      statementDate: "2026-04-15",
      statementBalance: 1280.5,
      balanceNow: 1280.5,
      inSync: true,
    });
  });

  it("closes a gap where WalletPulse is too low with money in from outside, kept out of spending", async () => {
    const res = await body<AccountReconcileResultDTO>(await post({ statementDate: "2026-04-15", statementBalance: 1325 }));
    expect(res.data.adjustment).toMatchObject({ amount: 25, accountId: null, transferAccountId: checking });
    expect((await listed()).balance).toBe(1275);

    const range = { from: "2026-04-01", to: "2026-04-30" };
    const s = async (q: Record<string, string>) =>
      (await body<{ income: number; expense: number }>(await summary(getReq("http://localhost/api/analytics/summary", { ...range, ...q })))).data;
    expect(await s({})).toMatchObject({ income: 500, expense: 250 });
    expect(await s({ view: "cashflow" })).toMatchObject({ income: 525, expense: 250 });
    expect(await s({ view: "cashflow", accountId: checking })).toMatchObject({ income: 525, expense: 250 });
  });

  it("records the check without a transaction when the user declines, and shows it out of sync", async () => {
    const res = await body<AccountReconcileResultDTO>(await post({ statementDate: "2026-04-15", statementBalance: 1310, adjust: false }));
    expect(res.data.adjustment).toBeNull();
    expect(res.data.reconciliation.difference).toBe(10);
    expect((await listed()).reconciliation).toMatchObject({ balanceNow: 1300, inSync: false });
  });

  it("adds nothing when the balances already match", async () => {
    const res = await body<AccountReconcileResultDTO>(await post({ statementDate: "2026-04-15", statementBalance: 1300 }));
    expect(res.data.adjustment).toBeNull();
    expect(res.data.reconciliation.difference).toBe(0);
    expect(await currentDb.select().from(schema.transactions).where(eq(schema.transactions.categoryId, ADJUST))).toEqual([]);
  });

  it("flags drift when a transaction on or before the statement date changes afterwards", async () => {
    await post({ statementDate: "2026-04-15", statementBalance: 1300 });
    await tx({ type: "expense", amount: 30, categoryId: A.catId, date: "2026-04-25" });
    expect((await listed()).reconciliation?.inSync).toBe(true);
    await tx({ type: "expense", amount: 30, categoryId: A.catId, date: "2026-04-12" });
    expect((await listed()).reconciliation).toMatchObject({ balanceNow: 1270, inSync: false });
  });

  it("refuses to adjust by a stale difference", async () => {
    const res = await body(await post({ statementDate: "2026-04-15", statementBalance: 1200, expectedBalance: 1350 }));
    expect(res.status).toBe(409);
    expect(await currentDb.select().from(schema.accountReconciliations)).toEqual([]);
  });

  it("keeps history newest first and unlinks a deleted adjustment", async () => {
    const first = await body<AccountReconcileResultDTO>(await post({ statementDate: "2026-04-15", statementBalance: 1290 }));
    await post({ statementDate: "2026-04-30", statementBalance: 1240 });
    await deleteTx(new Request("http://localhost", { method: "DELETE" }), { params: { id: first.data.adjustment!.id } });
    const { history } = await balanceOn("2026-04-30");
    expect(history.map((h) => [h.statementDate, h.adjustmentTransactionId === null])).toEqual([
      ["2026-04-30", true], // matched after the first adjustment: nothing added
      ["2026-04-15", true], // adjustment deleted → link cleared
    ]);
  });

  it("recreates the Balance Adjustment category if the user deleted it", async () => {
    await currentDb.delete(schema.categories).where(eq(schema.categories.id, ADJUST));
    const res = await body<AccountReconcileResultDTO>(await post({ statementDate: "2026-04-15", statementBalance: 1299 }));
    const [cat] = await currentDb
      .select()
      .from(schema.categories)
      .where(and(eq(schema.categories.userId, A.userId), eq(schema.categories.name, "Balance Adjustment")));
    expect(res.data.adjustment?.categoryId).toBe(cat!.id);
  });

  it("validates input and ownership", async () => {
    expect((await post({ statementDate: "2026-02-31", statementBalance: 1 }))!.status).toBe(400);
    expect((await post({ statementDate: "2026-04-15", statementBalance: 1.005 }))!.status).toBe(400);
    asUser(B);
    expect((await post({ statementDate: "2026-04-15", statementBalance: 1 }))!.status).toBe(404);
    expect((await preview(getReq("http://localhost", { date: "2026-04-15" }), { params: { id: checking } }))!.status).toBe(404);
    asUser(A);
    await archiveAccount(new Request("http://localhost"), { params: { id: checking } });
    expect((await body(await post({ statementDate: "2026-04-15", statementBalance: 1 }))).error).toBe("That account is archived");
  });

  it("is removed with its account's owner", async () => {
    await post({ statementDate: "2026-04-15", statementBalance: 1290 });
    await currentDb.delete(schema.users).where(eq(schema.users.id, A.userId));
    expect(await currentDb.select().from(schema.accountReconciliations)).toEqual([]);
  });
});
