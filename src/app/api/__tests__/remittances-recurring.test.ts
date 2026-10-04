/**
 * The remittances edit form is prefilled from the list response and sends
 * every field back on save. The list used to omit recurrence, so the form
 * defaulted it to off and each edit silently cleared it.
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
import { GET as listRemit, POST as createRemit } from "../remittances/route";
import { PATCH as patchRemit } from "../remittances/[id]/route";
import type { RemittanceDTO } from "@/types";

const A = TEST_USERS.A;

beforeEach(async () => {
  currentDb = await makeTestDb();
  await seedTwoUsers(currentDb);
  await currentDb.insert(schema.categories).values({
    id: "cat-a-remit",
    userId: A.userId,
    name: "International Transfer",
    type: "transfer",
    isDefault: true,
  });
  vi.mocked(auth).mockResolvedValue(session(A.userId, A.email) as never);
});

describe("remittance recurrence", () => {
  it("is returned by the list, so an edit made from it keeps the transfer recurring", async () => {
    const created = (await createRemit(
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
        isRecurring: true,
        recurringFrequency: "monthly",
      }),
    )) as Response;
    const createdBody = (await created.json()) as { data: RemittanceDTO };
    expect(createdBody.data).toMatchObject({ isRecurring: true, recurringFrequency: "monthly" });

    const list = (await (await listRemit(getReq("http://localhost/api/remittances")))!.json()) as { data: RemittanceDTO[] };
    const row = list.data[0]!;
    expect(row).toMatchObject({ isRecurring: true, recurringFrequency: "monthly" });

    // What the form sends: every field, recurrence taken from the list row.
    const res = (await patchRemit(
      jsonReq(
        "http://localhost",
        {
          description: "Rent (April)",
          isRecurring: row.isRecurring,
          recurringFrequency: row.isRecurring ? row.recurringFrequency : null,
        },
        "PATCH",
      ),
      { params: { id: row.id } },
    )) as Response;
    expect(res.status).toBe(200);
    const [tx] = await currentDb
      .select({ isRecurring: schema.transactions.isRecurring, freq: schema.transactions.recurringFrequency })
      .from(schema.transactions)
      .where(eq(schema.transactions.id, row.transactionId));
    expect(tx).toEqual({ isRecurring: true, freq: "monthly" });
  });
});
