/**
 * Migration 0009 repairs data that would violate its new constraints before
 * adding them. Build a DB at 0008, seed every kind of bad state the repair
 * handles, apply 0009, and check the result.
 */

import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { asc, eq, sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";

const MIGRATIONS = path.join(process.cwd(), "drizzle");

/** A copy of the migrations folder whose journal stops at `lastTag`. */
function migrationsUpTo(lastTag: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wp-migrations-"));
  fs.cpSync(MIGRATIONS, dir, { recursive: true });
  const journalPath = path.join(dir, "meta", "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as { entries: Array<{ tag: string }> };
  const cut = journal.entries.findIndex((e) => e.tag === lastTag);
  journal.entries = journal.entries.slice(0, cut + 1);
  fs.writeFileSync(journalPath, JSON.stringify(journal));
  return dir;
}

let client: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: migrationsUpTo("0008_auth_hardening") });

  await client.exec(`
    INSERT INTO users (id, name, email, password_hash) VALUES ('u1', 'U', 'u@test.com', 'x');

    -- Default "Groceries" seeded twice by a racing backfill, plus two
    -- user-created "Misc" categories (allowed to share a name).
    INSERT INTO categories (id, user_id, name, type, is_default, created_at) VALUES
      ('cat-groc-1', 'u1', 'Groceries', 'expense', true, now() - interval '2 days'),
      ('cat-groc-2', 'u1', 'groceries', 'expense', true, now() - interval '1 day'),
      ('cat-misc-1', 'u1', 'Misc', 'expense', false, now()),
      ('cat-misc-2', 'u1', 'Misc', 'expense', false, now());
    INSERT INTO transactions (id, user_id, category_id, type, amount, description, date) VALUES
      ('tx-on-dupe', 'u1', 'cat-groc-2', 'expense', '10', 'milk', '2026-01-10');

    -- Duplicate budgets: one pair via the merged category, one pair of
    -- overall (NULL category) budgets.
    INSERT INTO budgets (id, user_id, category_id, amount, period, start_date, updated_at) VALUES
      ('b-groc-old', 'u1', 'cat-groc-1', '100', 'monthly', '2026-01-01', now() - interval '1 day'),
      ('b-groc-new', 'u1', 'cat-groc-2', '200', 'monthly', '2026-01-01', now()),
      ('b-all-old', 'u1', NULL, '1000', 'monthly', '2026-01-01', now() - interval '1 day'),
      ('b-all-new', 'u1', NULL, '1500', 'monthly', '2026-01-01', now());

    INSERT INTO credit_cards (id, user_id, name, issuer, credit_limit) VALUES
      ('card-dbl', 'u1', 'Double-click', 'X', '1000'),
      ('card-real', 'u1', 'Real newest', 'X', '1000'),
      ('card-stale', 'u1', 'Stale projected', 'X', '1000');

    -- card-dbl: mark-issued ran twice → issued row + two identical projected rows.
    INSERT INTO credit_card_cycles (id, card_id, user_id, cycle_close_date, payment_due_date, is_projected, statement_balance) VALUES
      ('dbl-issued', 'card-dbl', 'u1', '2026-01-05', '2026-01-30', false, '300'),
      ('dbl-p1', 'card-dbl', 'u1', '2026-02-04', '2026-03-01', true, NULL),
      ('dbl-p2', 'card-dbl', 'u1', '2026-02-04', '2026-03-01', true, NULL);
    -- card-real: promoted in place by the old card PATCH → no projected cycle.
    INSERT INTO credit_card_cycles (id, card_id, user_id, cycle_close_date, payment_due_date, is_projected) VALUES
      ('real-only', 'card-real', 'u1', '2026-03-10', '2026-04-04', false);
    -- card-stale: an old projected row sits behind a newer real one.
    INSERT INTO credit_card_cycles (id, card_id, user_id, cycle_close_date, payment_due_date, is_projected) VALUES
      ('stale-old', 'card-stale', 'u1', '2026-01-01', '2026-01-25', true),
      ('stale-new', 'card-stale', 'u1', '2026-02-01', '2026-02-25', false);

    -- A $50 payment inside card-dbl's issued window, with amount_paid left at 0.
    INSERT INTO transactions (id, user_id, category_id, type, amount, description, date, credit_card_id) VALUES
      ('pay-1', 'u1', 'cat-misc-1', 'transfer', '50', 'payment', '2026-01-20', 'card-dbl');
  `);

  const sqlText = fs.readFileSync(path.join(MIGRATIONS, "0009_data_integrity.sql"), "utf8");
  await client.exec(sqlText);
});

describe("migration 0009 repair", () => {
  it("merges duplicate default categories and repoints their transactions", async () => {
    const cats = await db.select({ id: schema.categories.id }).from(schema.categories).orderBy(asc(schema.categories.id));
    expect(cats.map((c) => c.id)).toEqual(["cat-groc-1", "cat-misc-1", "cat-misc-2"]);
    // Explicit columns: this DB is at 0009 and lacks columns later migrations add.
    const [tx] = await db
      .select({ categoryId: schema.transactions.categoryId })
      .from(schema.transactions)
      .where(eq(schema.transactions.id, "tx-on-dupe"));
    expect(tx!.categoryId).toBe("cat-groc-1");
  });

  it("keeps the most recently edited budget per category and period", async () => {
    const rows = await db.select({ id: schema.budgets.id }).from(schema.budgets).orderBy(asc(schema.budgets.id));
    expect(rows.map((r) => r.id)).toEqual(["b-all-new", "b-groc-new"]);
    const [groc] = await db.select().from(schema.budgets).where(eq(schema.budgets.id, "b-groc-new"));
    expect(groc!.categoryId).toBe("cat-groc-1");
  });

  it("leaves every card with exactly one projected cycle, its newest", async () => {
    const cycles = await db
      .select()
      .from(schema.creditCardCycles)
      .orderBy(asc(schema.creditCardCycles.cardId), asc(schema.creditCardCycles.cycleCloseDate));
    const byCard = new Map<string, typeof cycles>();
    for (const c of cycles) byCard.set(c.cardId, [...(byCard.get(c.cardId) ?? []), c]);

    for (const [, rows] of byCard) {
      expect(rows.filter((r) => r.isProjected)).toHaveLength(1);
      expect(rows[rows.length - 1]!.isProjected).toBe(true);
    }
    expect(byCard.get("card-dbl")!.map((r) => r.cycleCloseDate)).toEqual(["2026-01-05", "2026-02-04"]);
    // Inserted: +30 days on both dates.
    expect(byCard.get("card-real")!.map((r) => [r.cycleCloseDate, r.paymentDueDate, r.isProjected])).toEqual([
      ["2026-03-10", "2026-04-04", false],
      ["2026-04-09", "2026-05-04", true],
    ]);
    expect(byCard.get("card-stale")!.map((r) => r.isProjected)).toEqual([false, false, true]);
  });

  it("re-derives amount_paid from transfer transactions", async () => {
    const [issued] = await db
      .select()
      .from(schema.creditCardCycles)
      .where(eq(schema.creditCardCycles.id, "dbl-issued"));
    expect(issued!.amountPaid).toBe("50.00");
  });

  it("enforces the new constraints afterwards", async () => {
    await expect(
      client.exec(`INSERT INTO budgets (id, user_id, category_id, amount, period, start_date)
                   VALUES ('b-dupe', 'u1', NULL, '5', 'monthly', '2026-01-01')`),
    ).rejects.toThrow(/budgets_user_category_period_uniq/);
    await expect(
      client.exec(`INSERT INTO credit_card_cycles (id, card_id, user_id, cycle_close_date, payment_due_date, is_projected)
                   VALUES ('p-extra', 'card-real', 'u1', '2026-06-01', '2026-06-25', true)`),
    ).rejects.toThrow(/ccc_one_projected_per_card/);
    await expect(
      client.exec(`INSERT INTO categories (id, user_id, name, type, is_default) VALUES ('g3', 'u1', 'GROCERIES', 'expense', true)`),
    ).rejects.toThrow(/categories_user_default_name_uniq/);
    await expect(
      client.exec(`INSERT INTO budgets (id, user_id, category_id, amount, period, start_date)
                   VALUES ('b-bad', 'u1', 'cat-misc-1', '5', 'fortnightly', '2026-01-01')`),
    ).rejects.toThrow(/budgets_period_check/);
    // User-created categories may still share a name.
    await client.exec(`INSERT INTO categories (id, user_id, name, type) VALUES ('cat-misc-3', 'u1', 'Misc', 'expense')`);
    const [{ n }] = (await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM categories WHERE name = 'Misc'`)).rows;
    expect(n).toBe(3);
  });
});
