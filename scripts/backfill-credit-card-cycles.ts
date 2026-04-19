// @ts-nocheck
/**
 * HISTORICAL — kept for reference, not runnable post-Phase 5.
 *
 * One-time post-deploy migration for the credit-card cycle-history model
 * (Phase 1 of 5). Ran once against prod on 2026-04 against a schema that
 * still had `credit_cards.statement_day` / `payment_due_day`. Phase 5
 * dropped those columns, so this script can no longer compile or execute
 * against the current schema — the drizzle-typed `creditCards.statementDay`
 * reference below doesn't exist anymore. Preserved verbatim (minus the
 * helper imports, which were inlined so the file remains self-contained
 * after `src/lib/credit-cards.ts` was pruned in Phase 5) so the provenance
 * of every row currently in `credit_card_cycles` stays auditable.
 *
 * Was invoked as:
 *   DATABASE_URL="..." pnpm tsx scripts/backfill-credit-card-cycles.ts
 */

import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

import { db } from "../src/lib/db";
import { creditCards, creditCardCycles } from "../src/lib/db/schema";

// ---------------------------------------------------------------------------
// Local helper copies (moved inline from `src/lib/credit-cards.ts` in
// Phase 5 when those helpers were removed from the live codebase).
// ---------------------------------------------------------------------------

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function cappedDayOfMonth(year: number, monthIndex: number, day: number): number {
  return Math.min(day, lastDayOfMonth(year, monthIndex));
}

function getStatementCycle(
  now: Date,
  statementDay: number,
  offset: number = 0,
): { start: Date; end: Date } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const cappedToday = cappedDayOfMonth(year, month, statementDay);

  let closeYear: number;
  let closeMonth: number;
  if (day >= cappedToday) {
    closeYear = year;
    closeMonth = month;
  } else {
    const prev = new Date(Date.UTC(year, month - 1, 1));
    closeYear = prev.getUTCFullYear();
    closeMonth = prev.getUTCMonth();
  }

  const openMonthOffset = -offset;
  const closeMonthOffset = -offset + 1;

  const openRef = new Date(Date.UTC(closeYear, closeMonth + openMonthOffset, 1));
  const closeRef = new Date(Date.UTC(closeYear, closeMonth + closeMonthOffset, 1));

  const openDay = cappedDayOfMonth(
    openRef.getUTCFullYear(),
    openRef.getUTCMonth(),
    statementDay,
  );
  const closeDay = cappedDayOfMonth(
    closeRef.getUTCFullYear(),
    closeRef.getUTCMonth(),
    statementDay,
  );

  return {
    start: new Date(
      Date.UTC(openRef.getUTCFullYear(), openRef.getUTCMonth(), openDay + 1, 0, 0, 0, 0),
    ),
    end: new Date(
      Date.UTC(
        closeRef.getUTCFullYear(),
        closeRef.getUTCMonth(),
        closeDay,
        23,
        59,
        59,
        999,
      ),
    ),
  };
}

function getNextDueDate(now: Date, paymentDueDay: number): Date {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const cappedThis = cappedDayOfMonth(year, month, paymentDueDay);
  if (day <= cappedThis) {
    return new Date(Date.UTC(year, month, cappedThis, 0, 0, 0, 0));
  }
  const nextMonthRef = new Date(Date.UTC(year, month + 1, 1));
  const ny = nextMonthRef.getUTCFullYear();
  const nm = nextMonthRef.getUTCMonth();
  const cappedNext = cappedDayOfMonth(ny, nm, paymentDueDay);
  return new Date(Date.UTC(ny, nm, cappedNext, 0, 0, 0, 0));
}

// ---------------------------------------------------------------------------

const MIN_GAP_DAYS = 10;
const MAX_GAP_DAYS = 40;
const DAY_MS = 24 * 60 * 60 * 1000;

function toCivilDate(d: Date): string {
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
