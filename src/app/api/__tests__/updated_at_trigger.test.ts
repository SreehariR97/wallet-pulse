/**
 * Proves the DB trigger from migration 0004 fires on UPDATE.
 *
 * Uses raw SQL (not Drizzle `.update()`) so the test is agnostic to handler
 * code that might or might not still pass `updatedAt` — we're observing the
 * DB's behavior, not the ORM's.
 */
import { describe, it, expect } from "vitest";
import { sql, eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { makeTestDb, seedTwoUsers, TEST_USERS } from "./_harness";

describe("trigger_set_updated_at (migration 0004)", () => {
  it("fires on UPDATE of transactions.description; new updated_at > old updated_at", async () => {
    const db = await makeTestDb();
    await seedTwoUsers(db);

    const txId = "tx-trigger";
    await db.insert(schema.transactions).values({
      id: txId,
      userId: TEST_USERS.A.userId,
      categoryId: TEST_USERS.A.catId,
      type: "expense",
      amount: "10",
      description: "before",
      date: "2026-04-01",
    });

    const [before] = await db
      .select({ updatedAt: schema.transactions.updatedAt })
      .from(schema.transactions)
      .where(eq(schema.transactions.id, txId));

    // Real wait (not fake timers) to guarantee a now() tick between writes.
    await new Promise((r) => setTimeout(r, 50));

    // Direct SQL so the assertion is about the DB trigger, not the ORM.
    await db.execute(sql`UPDATE transactions SET description = 'after' WHERE id = ${txId}`);

    const [after] = await db
      .select({ updatedAt: schema.transactions.updatedAt })
      .from(schema.transactions)
      .where(eq(schema.transactions.id, txId));

    const beforeMs = new Date(before!.updatedAt as unknown as string).getTime();
    const afterMs = new Date(after!.updatedAt as unknown as string).getTime();
    expect(afterMs).toBeGreaterThan(beforeMs);
  });
});
