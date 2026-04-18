/**
 * User-isolation tests for the remittances API.
 *
 * POST note: the handler always mints a new transaction + remittance pair
 * (no client-supplied transactionId). Cross-tenant "inject B's tx into a
 * new remittance for A" is structurally unrepresentable. The POST test
 * therefore asserts the positive invariant — A's POST never mutates B's
 * pre-existing rows.
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
import { TRANSFER_CATEGORY_NAMES } from "@/lib/db/defaults";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
let currentDb: TestDb;
vi.mock("@/lib/db", () => ({
  get db() {
    return currentDb;
  },
}));

import { auth } from "@/lib/auth";
import { GET as listGet, POST as listPost } from "../route";
import { GET as getById, PATCH as patchById, DELETE as deleteById } from "../[id]/route";
import { GET as statsGet } from "../stats/route";

const A = { ...TEST_USERS.A, txId: "tx-a", remitId: "remit-a", intlCatId: "intl-a" };
const B = { ...TEST_USERS.B, txId: "tx-b", remitId: "remit-b", intlCatId: "intl-b" };

beforeEach(async () => {
  currentDb = await makeTestDb();
  await seedTwoUsers(currentDb);

  // POST requires an "International Transfer" transfer-category for the
  // authed user. Seed one per user.
  await currentDb.insert(schema.categories).values([
    { id: A.intlCatId, userId: A.userId, name: TRANSFER_CATEGORY_NAMES.internationalTransfer, type: "transfer" },
    { id: B.intlCatId, userId: B.userId, name: TRANSFER_CATEGORY_NAMES.internationalTransfer, type: "transfer" },
  ]);

  // Seed one transfer tx + one remittance per user. Amounts chosen so a
  // scope-drop in /stats would produce a visibly-wrong totalSent.
  await currentDb.insert(schema.transactions).values([
    { id: A.txId, userId: A.userId, categoryId: A.intlCatId, type: "transfer", amount: "100", description: "A remit", date: "2026-04-01", paymentMethod: "bank_transfer" },
    { id: B.txId, userId: B.userId, categoryId: B.intlCatId, type: "transfer", amount: "500", description: "B remit", date: "2026-04-01", paymentMethod: "bank_transfer" },
  ]);
  await currentDb.insert(schema.remittances).values([
    { id: A.remitId, transactionId: A.txId, userId: A.userId, fromCurrency: "USD", toCurrency: "INR", fxRate: "83.1", fee: "2.5", service: "wise" },
    { id: B.remitId, transactionId: B.txId, userId: B.userId, fromCurrency: "USD", toCurrency: "INR", fxRate: "83.1", fee: "5.0", service: "wise" },
  ]);
});

function asA() {
  vi.mocked(auth).mockResolvedValue(session(A.userId, A.email) as never);
}

describe("GET /api/remittances — user isolation", () => {
  it("list: A's list contains A's remittance and does not contain B's", async () => {
    asA();
    const res = (await listGet(getReq("http://localhost/api/remittances"))) as Response;
    const body = await res.json();
    expect(res.status).toBe(200);
    const ids = (body.data as Array<{ id: string }>).map((r) => r.id);
    expect(ids).toContain(A.remitId);
    expect(ids).not.toContain(B.remitId);
  });
});

describe("GET /api/remittances/:id — user isolation", () => {
  it("get: A reading B's remittance id returns 404", async () => {
    asA();
    const res = (await getById(new Request("http://localhost"), { params: { id: B.remitId } })) as Response;
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/remittances/:id — user isolation", () => {
  it("patch: A updating B's remittance returns 404; B's remittance + tx are unchanged", async () => {
    asA();
    const req = jsonReq("http://localhost", { description: "hacked", fee: 99 }, "PATCH");
    const res = (await patchById(req, { params: { id: B.remitId } })) as Response;
    expect(res.status).toBe(404);

    const [rem] = await currentDb
      .select()
      .from(schema.remittances)
      .where(eq(schema.remittances.id, B.remitId));
    expect(rem!.fee).toBe("5.0000");

    const [tx] = await currentDb
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, B.txId));
    expect(tx!.description).toBe("B remit");
  });
});

describe("DELETE /api/remittances/:id — user isolation", () => {
  it("delete: A deleting B's remittance returns 404; both B rows still exist", async () => {
    asA();
    const res = (await deleteById(new Request("http://localhost"), { params: { id: B.remitId } })) as Response;
    expect(res.status).toBe(404);

    const rems = await currentDb
      .select()
      .from(schema.remittances)
      .where(eq(schema.remittances.id, B.remitId));
    expect(rems).toHaveLength(1);

    const txs = await currentDb
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, B.txId));
    expect(txs).toHaveLength(1);
  });
});

describe("GET /api/remittances/stats — user isolation", () => {
  it("stats: A's wise totalSent is 100, not 600 (B's 500 is not included)", async () => {
    asA();
    const res = (await statsGet(getReq("http://localhost/api/remittances/stats"))) as Response;
    const body = await res.json();
    expect(res.status).toBe(200);
    const wise = (body.data as Array<{ service: string; totalSent: number }>).find((r) => r.service === "wise");
    expect(wise).toBeDefined();
    expect(wise!.totalSent).toBe(100);
  });
});

describe("POST /api/remittances — positive invariant (no cross-tenant mutation possible)", () => {
  it("post: A's POST creates a new tx+remittance owned by A; no row belonging to B is mutated", async () => {
    // Snapshot B's rows beforehand.
    const [bTxBefore] = await currentDb
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, B.txId));
    const [bRemBefore] = await currentDb
      .select()
      .from(schema.remittances)
      .where(eq(schema.remittances.id, B.remitId));

    asA();
    const res = (await listPost(
      jsonReq("http://localhost/api/remittances", {
        amount: 42,
        date: "2026-04-10",
        description: "A's new remit",
        paymentMethod: "bank_transfer",
        fromCurrency: "USD",
        toCurrency: "INR",
        fxRate: 83.25,
        fee: 1.5,
        service: "wise",
      }),
    )) as Response;
    const body = await res.json();
    expect(res.status).toBe(200);

    // The newly-created tx belongs to A.
    const newTxId = body.data.transactionId as string;
    const [newTx] = await currentDb
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, newTxId));
    expect(newTx!.userId).toBe(A.userId);

    // B's pre-existing rows are byte-identical.
    const [bTxAfter] = await currentDb
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, B.txId));
    const [bRemAfter] = await currentDb
      .select()
      .from(schema.remittances)
      .where(eq(schema.remittances.id, B.remitId));
    expect(bTxAfter!.description).toBe(bTxBefore!.description);
    expect(bTxAfter!.amount).toBe(bTxBefore!.amount);
    expect(bRemAfter!.fee).toBe(bRemBefore!.fee);
    expect(bRemAfter!.fxRate).toBe(bRemBefore!.fxRate);
  });
});
