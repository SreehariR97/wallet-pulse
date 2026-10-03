import { z } from "zod";
import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { transactions } from "@/lib/db/schema";
import { INFLOW_TYPES } from "@/lib/accounts";

/**
 * The two ways analytics can count money.
 *
 * spending (default) — what you spent and earned: `income` vs `expense`.
 *   A card purchase counts when you make it; card payments, remittances,
 *   loans and moves between accounts don't count at all.
 *
 * cashflow — money actually leaving and entering your accounts:
 *   in:  income, loans taken, repayments received
 *   out: expenses not paid by card, loans given, repayments made, and
 *        transfers out of your accounts (card payments, remittances)
 *   Card purchases don't count until the card is paid. Moves between two
 *   of your own accounts cancel out, so they're left out.
 *
 * With an account selected, both views narrow to that account. In cash-flow
 * view it's exactly the account's balance movement (src/lib/accounts.ts),
 * including transfers to and from your other accounts.
 */
export type AnalyticsView = "spending" | "cashflow";

export const analyticsScopeSchema = {
  view: z.enum(["spending", "cashflow"]).default("spending"),
  accountId: z.string().max(64).optional(),
};

export interface FlowPredicates {
  inflow: SQL;
  outflow: SQL;
}

const t = transactions;
const OUTFLOW_TYPES = ["loan_given", "repayment_made"] as const;

export function flowPredicates(view: AnalyticsView, accountId?: string): FlowPredicates {
  if (view === "spending") {
    const scope = accountId ? eq(t.accountId, accountId) : undefined;
    return {
      inflow: and(eq(t.type, "income"), scope) as SQL,
      outflow: and(eq(t.type, "expense"), scope) as SQL,
    };
  }

  if (accountId) {
    return {
      inflow: or(
        and(eq(t.accountId, accountId), inArray(t.type, [...INFLOW_TYPES])),
        eq(t.transferAccountId, accountId),
      ) as SQL,
      // Everything else on the account is money leaving it (see INFLOW_TYPES).
      outflow: and(
        eq(t.accountId, accountId),
        sql`${t.type} NOT IN (${sql.raw(INFLOW_TYPES.map((x) => `'${x}'`).join(", "))})`,
      ) as SQL,
    };
  }

  return {
    inflow: inArray(t.type, [...INFLOW_TYPES]),
    outflow: or(
      and(eq(t.type, "expense"), isNull(t.creditCardId)),
      inArray(t.type, [...OUTFLOW_TYPES]),
      and(eq(t.type, "transfer"), isNull(t.transferAccountId)),
    ) as SQL,
  };
}
