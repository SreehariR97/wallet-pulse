/**
 * One-time post-deploy migration for the credit-cards + remittances feature.
 *
 * Users who registered BEFORE this feature shipped don't have the two new
 * transfer-type default categories (Credit Card Payment, International
 * Transfer). New transfers created via the UI or API require those rows
 * (/api/credit-cards/:id/pay looks up the first by name; POST /api/
 * remittances looks up the second). Without them, new-user flows fail
 * with a 409.
 *
 * This script creates the missing rows for every existing user. Idempotent:
 * it inserts only the (userId, name) pairs that don't already exist, so
 * running it twice is a no-op. The DEFAULT_CATEGORIES seeder in
 * src/lib/db/seed.ts handles this automatically for NEW signups post-
 * deploy — this script only addresses the one-time backfill gap.
 *
 * Run once against production Neon:
 *   DATABASE_URL="..." pnpm tsx scripts/backfill-transfer-categories.ts
 *
 * See FOLLOWUPS.md → Deployment notes for the feature-rollout checklist.
 */

import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

import { db } from "../src/lib/db";
import { users, categories } from "../src/lib/db/schema";
import { DEFAULT_CATEGORIES, TRANSFER_CATEGORY_NAMES } from "../src/lib/db/defaults";

const TRANSFER_DEFAULTS = DEFAULT_CATEGORIES.filter((c) => c.type === "transfer");

async function backfillForUser(userId: string): Promise<number> {
  const existing = await db
    .select({ name: categories.name })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.type, "transfer")));
  const existingNames = new Set(existing.map((c) => c.name.toLowerCase()));

  const missing = TRANSFER_DEFAULTS.filter(
    (d) => !existingNames.has(d.name.toLowerCase()),
  );
  if (missing.length === 0) return 0;

  // sortOrder starts after the user's current max to avoid clobbering
  // any reorderings they might have done. Nonzero default is fine since
  // the UI sorts ascending and these sit below the expense/loan tiers.
  const maxSortRow = await db
    .select({ sortOrder: categories.sortOrder })
    .from(categories)
    .where(eq(categories.userId, userId));
  const baseSort = Math.max(0, ...maxSortRow.map((r) => Number(r.sortOrder ?? 0))) + 1;

  await db.insert(categories).values(
    missing.map((c, i) => ({
      id: randomUUID(),
      userId,
      name: c.name,
      icon: c.icon,
      color: c.color,
      type: c.type,
      isDefault: true,
      sortOrder: baseSort + i,
    })),
  );
  return missing.length;
}

async function main() {
  console.log("\n→ Backfilling transfer categories for existing users\n");

  const knownNames = [
    TRANSFER_CATEGORY_NAMES.creditCardPayment,
    TRANSFER_CATEGORY_NAMES.internationalTransfer,
  ];
  console.log(`  Seeding: ${knownNames.join(", ")}\n`);

  const allUsers = await db.select({ id: users.id, email: users.email }).from(users);
  if (allUsers.length === 0) {
    console.log("  No users found. Nothing to do.\n");
    return;
  }

  let totalInserted = 0;
  let untouched = 0;
  for (const u of allUsers) {
    const inserted = await backfillForUser(u.id);
    if (inserted > 0) {
      totalInserted += inserted;
      console.log(`  ${u.email}: +${inserted}`);
    } else {
      untouched++;
    }
  }

  console.log(
    `\n  Done. Inserted ${totalInserted} row(s) across ${allUsers.length - untouched} user(s); ${untouched} already had both.\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
