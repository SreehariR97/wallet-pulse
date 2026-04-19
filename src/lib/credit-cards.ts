/**
 * Pure allocation rule for credit-card cycle history.
 *
 * Phase 5 dropped the integer day-of-month model and the associated date-
 * math helpers (those lived here through Phase 4). What remains is the
 * single invariant that drives payment-to-cycle allocation across the app:
 * a payment date D belongs to the first cycle (ordered ASC by
 * cycleCloseDate) whose half-open interval `(cycleCloseDate, paymentDueDate]`
 * contains D. Strict on the left (the close day rolls forward, matching the
 * "statementDay is the LAST day of the closing cycle" convention) and
 * inclusive on the right (a payment made on the due day still counts).
 *
 * Returns `cycleId` or `null` for dates that fall outside every cycle's
 * grace window (before the earliest close, after the latest due, or in the
 * dead zone between two cycles). Callers should log on null so we can spot
 * misconfiguration — realistically this only happens with manually-entered
 * payments dated before the backfill's cycle row, or during the brief
 * window before `mark-statement-issued` materializes the next projected
 * cycle.
 *
 * Civil-date comparison via lexicographic string compare — valid because
 * YYYY-MM-DD is monotonic in lex order. No TZ math.
 */
export function allocateCycleForPayment(
  cycles: Array<{ id: string; cycleCloseDate: string; paymentDueDate: string }>,
  paymentDate: string,
): string | null {
  for (const cycle of cycles) {
    if (paymentDate > cycle.cycleCloseDate && paymentDate <= cycle.paymentDueDate) {
      return cycle.id;
    }
  }
  return null;
}
