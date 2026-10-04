/**
 * Soft lock on reconciled periods (src/lib/reconcile-lock.ts).
 *
 * Checking opens at 1000 and is reconciled through Apr 15 against a
 * statement of 985 (so a −5 adjustment is dated Apr 15). "locked" is an
 * expense on Apr 10 (inside the reconciled period), "open" one on Apr 20.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { makeTestDb, seedTwoUsers, session, getReq, TEST_USERS, type TestDb } from "./_harness";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
let currentDb: TestDb;
vi.mock("@/lib/db", () => ({
  get db() {
    return currentDb;
  },
}));

import { auth } from "@/lib/auth";
import { POST as createAccount } from "../accounts/route";
import { PATCH as patchAccount } from "../accounts/[id]/route";
import { POST as reconcile } from "../accounts/[id]/reconcile/route";
import { GET as listTx, POST as createTx } from "../transactions/route";
import { PUT as putTx, DELETE as deleteTx } from "../transactions/[id]/route";
import { DELETE as bulkDelete } from "../transactions/bulk/route";
import { POST as payCard } from "../credit-cards/[id]/pay/route";
import { POST as createRemit } from "../remittances/route";
import { PATCH as patchRemit, DELETE as deleteRemit } from "../remittances/[id]/route";
import { POST as importCsv } from "../import/route";

const A = TEST_USERS.A;
const CARD = "card-a";
const LOCK_MESSAGE = ["Checking (reconciled through 2026-04-15)"];

/** JSON request, optionally confirming a change to a reconciled period. */
function req(body: unknown, method = "POST", confirm = false): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (confirm) headers["x-confirm-reconciled"] = "1";
  return new Request("http://localhost/api", {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function status(res: Response | undefined) {
  const r = res as Response;
  const j = (await r.json()) as { data?: { id: string }; details?: { reconciled?: string[] } };
  return { status: r.status, id: j.data?.id, reconciled: j.details?.reconciled };
}

let checking: string;
let savings: string;
let locked: string;
let open: string;

const tx = (b: Record<string, unknown>, confirm = false) =>
  createTx(
    req({ type: "expense", amount: 10, categoryId: A.catId, description: "t", paymentMethod: "debit_card", accountId: checking, ...b }, "POST", confirm),
  ).then(status);

beforeEach(async () => {
  currentDb = await makeTestDb();
  await seedTwoUsers(currentDb);
  await currentDb.insert(schema.categories).values([
    { id: "cat-move", userId: A.userId, name: "Account Transfer", type: "transfer", isDefault: true },
    { id: "cat-ccpay", userId: A.userId, name: "Credit Card Payment", type: "transfer", isDefault: true },
    { id: "cat-remit", userId: A.userId, name: "International Transfer", type: "transfer", isDefault: true },
    { id: "cat-adjust", userId: A.userId, name: "Balance Adjustment", type: "transfer", isDefault: true },
  ]);
  await currentDb.insert(schema.creditCards).values({ id: CARD, userId: A.userId, name: "Visa", issuer: "Bank", creditLimit: "5000" });
  await currentDb.insert(schema.creditCardCycles).values({
    id: "cyc", cardId: CARD, userId: A.userId, cycleCloseDate: "2026-04-01", paymentDueDate: "2026-04-25", isProjected: true,
  });
  vi.mocked(auth).mockResolvedValue(session(A.userId, A.email) as never);

  checking = (await status(await createAccount(req({ name: "Checking", openingBalance: 1000 })))).id!;
  savings = (await status(await createAccount(req({ name: "Savings" })))).id!;
  locked = (await tx({ date: "2026-04-10" })).id!;
  open = (await tx({ date: "2026-04-20" })).id!;
  const rec = await reconcile(req({ statementDate: "2026-04-15", statementBalance: 985 }), { params: { id: checking } });
  expect((rec as Response).status).toBe(201);
});

describe("reconciled-period lock", () => {
  it("refuses backdating a new transaction into the period until confirmed", async () => {
    expect(await tx({ date: "2026-04-12" })).toMatchObject({ status: 409, reconciled: LOCK_MESSAGE });
    expect((await tx({ date: "2026-04-12" }, true)).status).toBe(201);
    expect((await tx({ date: "2026-04-16" })).status).toBe(201);
    // Not linked to the account → not locked, whatever the date.
    expect((await tx({ date: "2026-04-12", accountId: null })).status).toBe(201);
  });

  it("guards transfers on either side", async () => {
    const move = { type: "transfer", categoryId: "cat-move", date: "2026-04-12" };
    expect((await tx({ ...move, accountId: savings, transferAccountId: checking })).status).toBe(409);
    expect((await tx({ ...move, accountId: checking, transferAccountId: savings })).status).toBe(409);
    expect((await tx({ ...move, date: "2026-04-16", accountId: savings, transferAccountId: checking })).status).toBe(201);
  });

  it("lets non-balance edits through but guards amount, date, type and account changes", async () => {
    const put = (id: string, b: Record<string, unknown>, confirm = false) =>
      putTx(req(b, "PUT", confirm), { params: { id } }).then(status);
    expect((await put(locked, { description: "renamed", notes: "n", tags: "x" })).status).toBe(200);
    expect((await put(locked, { amount: 10 })).status).toBe(200); // same value
    expect((await put(locked, { amount: 12 })).status).toBe(409);
    expect((await put(locked, { accountId: null })).status).toBe(409);
    expect((await put(locked, { date: "2026-04-20" })).status).toBe(409); // moving out changes the period too
    expect((await put(open, { date: "2026-04-14" })).status).toBe(409); // moving in
    expect((await put(open, { amount: 99 })).status).toBe(200);
    expect((await put(locked, { amount: 12 }, true)).status).toBe(200);
  });

  it("guards single and bulk deletes, deleting nothing when refused", async () => {
    const del = (confirm = false) => deleteTx(req(undefined, "DELETE", confirm), { params: { id: locked } }).then(status);
    expect((await del()).status).toBe(409);
    expect((await bulkDelete(req({ ids: [open, locked] }, "DELETE")))!.status).toBe(409);
    expect(await currentDb.select().from(schema.transactions).where(eq(schema.transactions.id, open))).toHaveLength(1);
    expect((await bulkDelete(req({ ids: [open] }, "DELETE")))!.status).toBe(200);
    expect((await del(true)).status).toBe(200);
  });

  it("guards card payments, remittances and imports that land in the period", async () => {
    const pay = (date: string) =>
      payCard(req({ amount: 5, date, accountId: checking }), { params: { id: CARD } }).then(status);
    expect((await pay("2026-04-12")).status).toBe(409);
    expect((await pay("2026-04-16")).status).toBe(200);

    const remit = { amount: 50, description: "home", paymentMethod: "bank_transfer", fromCurrency: "USD", toCurrency: "INR", fxRate: 83, fee: 1, service: "wise", accountId: checking };
    expect((await status(await createRemit(req({ ...remit, date: "2026-04-12" })))).status).toBe(409);
    const created = await status(await createRemit(req({ ...remit, date: "2026-04-12" }, "POST", true)));
    expect(created.status).toBe(200);
    const rid = created.id!;
    expect((await patchRemit(req({ fee: 2, recipientNote: "Mom" }, "PATCH"), { params: { id: rid } }))!.status).toBe(200);
    expect((await patchRemit(req({ amount: 60 }, "PATCH"), { params: { id: rid } }))!.status).toBe(409);
    expect((await deleteRemit(req(undefined, "DELETE"), { params: { id: rid } }))!.status).toBe(409);
    expect((await deleteRemit(req(undefined, "DELETE", true), { params: { id: rid } }))!.status).toBe(200);

    const rows = [{ date: "2026-04-01", amount: "5", description: "old" }, { date: "2026-04-30", amount: "5", description: "new" }];
    expect((await importCsv(req({ rows, accountId: checking })))!.status).toBe(409);
    expect(await currentDb.select().from(schema.transactions).where(eq(schema.transactions.description, "new"))).toEqual([]);
    expect((await importCsv(req({ rows })))!.status).toBe(201); // no account → nothing reconciled
    expect((await importCsv(req({ rows, accountId: checking }, "POST", true)))!.status).toBe(201);
  });

  it("guards changing a reconciled account's opening balance", async () => {
    const patch = (b: Record<string, unknown>, confirm = false) =>
      patchAccount(req(b, "PATCH", confirm), { params: { id: checking } }).then(status);
    expect((await patch({ name: "Main checking" })).status).toBe(200);
    expect((await patch({ openingBalance: 1000 })).status).toBe(200); // unchanged
    expect(await patch({ openingBalance: 900 })).toMatchObject({ status: 409, reconciled: ["Main checking (reconciled through 2026-04-15)"] });
    expect((await patch({ openingBalance: 900 }, true)).status).toBe(200);
    expect((await (patchAccount(req({ openingBalance: 5 }, "PATCH"), { params: { id: savings } }) as Promise<Response>)).status).toBe(200);
  });

  it("marks reconciled rows in the transaction list", async () => {
    const { data } = (await (await listTx(getReq("http://localhost/api/transactions")))!.json()) as {
      data: Array<{ id: string; description: string; reconciled: boolean }>;
    };
    const byId = new Map(data.map((r) => [r.id, r.reconciled]));
    expect(byId.get(locked)).toBe(true);
    expect(byId.get(open)).toBe(false);
    // The reconcile's own adjustment is dated on the statement, so it's inside too.
    expect(data.find((r) => r.description.startsWith("Balance adjustment"))?.reconciled).toBe(true);
  });

  it("doesn't block reconciling again", async () => {
    const rec = await reconcile(req({ statementDate: "2026-04-12", statementBalance: 985 }), { params: { id: checking } });
    expect((rec as Response).status).toBe(201);
  });
});
