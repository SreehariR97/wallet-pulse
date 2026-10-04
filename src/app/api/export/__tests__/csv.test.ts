/**
 * CSV export must neutralize spreadsheet formulas (CSV injection) without
 * mangling numeric cells.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import Papa from "papaparse";
import * as schema from "@/lib/db/schema";
import { makeTestDb, seedTwoUsers, session, getReq, TEST_USERS, type TestDb } from "../../__tests__/_harness";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
let currentDb: TestDb;
vi.mock("@/lib/db", () => ({
  get db() {
    return currentDb;
  },
}));

import { auth } from "@/lib/auth";
import { GET } from "../route";

const A = TEST_USERS.A;

beforeEach(async () => {
  currentDb = await makeTestDb();
  await seedTwoUsers(currentDb);
  await currentDb.insert(schema.transactions).values({
    id: "tx-formula",
    userId: A.userId,
    categoryId: A.catId,
    type: "expense",
    amount: "12.50",
    description: '=HYPERLINK("https://evil.example","Click")',
    notes: "+1 555 0100",
    tags: "@work",
    date: "2026-04-01",
  });
  vi.mocked(auth).mockResolvedValue(session(A.userId, A.email) as never);
});

describe("GET /api/export?format=csv", () => {
  it("prefixes formula-looking text cells with an apostrophe and leaves amounts numeric", async () => {
    const res = (await GET(getReq("http://localhost/api/export", { format: "csv" }))) as Response;
    expect(res.status).toBe(200);
    const { data } = Papa.parse<Record<string, string>>(await res.text(), { header: true });
    const row = data[0]!;
    expect(row.Description).toBe(`'=HYPERLINK("https://evil.example","Click")`);
    expect(row.Notes).toBe("'+1 555 0100");
    expect(row.Tags).toBe("'@work");
    expect(row.Amount).toBe("12.5");
    expect(row.Date).toBe("2026-04-01");
  });
});
