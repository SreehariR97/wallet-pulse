/**
 * One-time post-deploy migration for the credit-card cycle-history model
 * (Phase 1 of 5).
 *
 * Creates ONE projected `credit_card_cycles` row per existing card, derived
 * from the card's current `statement_day` / `payment_due_day` integers. This
 * lets Phase 2 (UI + API) read cycles out of the new table without breaking
 * pre-existing cards that predate the feature.
 *
 * Idempotent: skips any card that already has at least one cycle row — safe
 * to re-run after partial failures or against a mixed-state DB.
 *
 * Heuristic for obviously-wrong day combinations: if the computed gap between
 * close and due is < 10 days or > 40 days, bump the due date forward by one
 * month. This catches the common case (Sree's Amex: statement=6, due=17,
 * which produces an 11-day gap but actually refers to the NEXT month's 17th
 * per real card behavior — an 11-day grace period is below the 21-day
 * regulatory minimum any real card gives). One bump only; if the result is
 * still out-of-range it's logged and accepted as-is.
 *
 * Run once against production Neon:
 *   DATABASE_URL="..." pnpm tsx scripts/backfill-credit-card-cycles.ts
 *
 * See README.md → Applying feature migrations to existing production DB.
 */

import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

import { db } from "../src/lib/db";
import { creditCards, creditCardCycles } from "../src/lib/db/schema";
import {
  getStatementCycle,
  getNextDueDate,
  cappedDayOfMonth,
} from "../src/lib/credit-cards";

const MIN_GAP_DAYS = 10;
const MAX_GAP_DAYS = 40;
const DAY_MS = 24 * 60 * 60 * 1000;

function toCivilDate(d: Date): string {
  // Cycle boundaries are Dates constructed as UTC markers (see
  // src/lib/credit-cards.ts). `.toISOString().slice(0, 10)` extracts the UTC
  // civil day — matches how date columns are stored. Same pattern as
  // src/app/api/credit-cards/route.ts.
  return d.toISOString().slice(0, 10);
}

function bumpOneMonth(d: Date, targetDay: number): Date {
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  const ny = next.getUTCFullYear();
  const nm = next.getUTCMonth();
  const capped = cappedDayOfMonth(ny, nm, targetDay);
  return new Date(Date.UTC(ny, nm, capped, 0, 0, 0, 0));
}

async function main() {
  console.log("\n→ Backfilling credit_card_cycles for existing cards\n");

  const cards = await db
    .select({
      id: creditCards.id,
      userId: creditCards.userId,
      name: creditCards.name,
      issuer: creditCards.issuer,
      statementDay: creditCards.statementDay,
      paymentDueDay: creditCards.paymentDueDay,
    })
    .from(creditCards);

  if (cards.length === 0) {
    console.log("  No credit cards found. Nothing to do.\n");
    return;
  }

  const now = new Date();
  let inserted = 0;
  let skipped = 0;
  let adjusted = 0;

  for (const card of cards) {
    const [existing] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(creditCardCycles)
      .where(eq(creditCardCycles.cardId, card.id));
    if (Number(existing?.cnt ?? 0) > 0) {
      skipped++;
      continue;
    }

    const cycle = getStatementCycle(now, card.statementDay, 0);
    const closeDate = cycle.end;
    let dueDate = getNextDueDate(now, card.paymentDueDay);

    const gapDays = Math.round((dueDate.getTime() - closeDate.getTime()) / DAY_MS);
    if (gapDays < MIN_GAP_DAYS || gapDays > MAX_GAP_DAYS) {
      const bumped = bumpOneMonth(dueDate, card.paymentDueDay);
      const newGap = Math.round((bumped.getTime() - closeDate.getTime()) / DAY_MS);
      console.warn(
        `  ⚠ ${card.issuer} ${card.name}: close=${toCivilDate(closeDate)} due=${toCivilDate(dueDate)} ` +
          `gap=${gapDays}d (out of [${MIN_GAP_DAYS}, ${MAX_GAP_DAYS}]) → bumping due forward one month ` +
          `to ${toCivilDate(bumped)} (new gap ${newGap}d)`,
      );
      dueDate = bumped;
      adjusted++;
    }

    await db.insert(creditCardCycles).values({
      id: randomUUID(),
      cardId: card.id,
      userId: card.userId,
      cycleCloseDate: toCivilDate(closeDate),
      paymentDueDate: toCivilDate(dueDate),
      isProjected: true,
    });
    inserted++;
    console.log(
      `  + ${card.issuer} ${card.name}: close=${toCivilDate(closeDate)} due=${toCivilDate(dueDate)}`,
    );
  }

  console.log(
    `\n  Done. Backfilled ${inserted} card(s), skipped ${skipped} (already had cycles), ` +
      `adjusted ${adjusted} due-date gap(s).\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
