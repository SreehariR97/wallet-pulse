/**
 * Pure date math for credit-card statement cycles. No DB access — callers
 * compose this with their own queries.
 *
 * Convention (matches Chase / Amex): statementDay is the LAST day of the
 * closing cycle. Transactions dated on that day belong to the cycle that
 * just closed; the new cycle starts the following day.
 *
 * For months shorter than statementDay (e.g. statementDay=31 in Feb), we cap
 * to the last day of that month.
 */

/** Last day of the given month (1..31). `monthIndex` is 0-based (Jan=0). */
export function lastDayOfMonth(year: number, monthIndex: number): number {
  // Day 0 of the next month == last day of this month.
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Clamp a user-configured day-of-month (1..31) to the real last day. */
export function cappedDayOfMonth(year: number, monthIndex: number, day: number): number {
  return Math.min(day, lastDayOfMonth(year, monthIndex));
}

/**
 * Build a UTC Date at 23:59:59.999 on the capped day of the given month.
 * Using end-of-day means "transactions dated on statementDay" (any time
 * during that day) are correctly included when compared with <= endDate.
 */
function closeDate(year: number, monthIndex: number, day: number): Date {
  const d = cappedDayOfMonth(year, monthIndex, day);
  return new Date(Date.UTC(year, monthIndex, d, 23, 59, 59, 999));
}

/**
 * Start-of-day for the day after a statement close. Cycles start at midnight.
 */
function openDate(year: number, monthIndex: number, day: number): Date {
  const d = cappedDayOfMonth(year, monthIndex, day);
  // day+1 may overflow month boundary — Date constructor handles that.
  return new Date(Date.UTC(year, monthIndex, d + 1, 0, 0, 0, 0));
}

export interface CycleWindow {
  /** Inclusive start of cycle (UTC midnight). */
  start: Date;
  /** Inclusive end of cycle (UTC 23:59:59.999 on the statement close day). */
  end: Date;
}

/**
 * Compute the statement cycle at a given offset from `now`.
 *
 * - offset 0 → the cycle currently accruing (opens the day after the most
 *   recent close, ends at the next close). If `now` itself is the close day,
 *   it belongs to offset 1 (the cycle that just closed); offset 0 is the
 *   fresh cycle starting tomorrow.
 * - offset 1 → the cycle immediately before the current one.
 * - offset N → N cycles before the current one.
 *
 * @param now          reference date
 * @param statementDay 1..31 (capped per-month for short months)
 * @param offset       0 = current, 1 = previous, N = N cycles back
 */
export function getStatementCycle(
  now: Date,
  statementDay: number,
  offset: number = 0,
): CycleWindow {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const cappedToday = cappedDayOfMonth(year, month, statementDay);

  // Find the most recent close date that is strictly before `now`.
  // If today's close hasn't happened yet (day < cappedToday), most recent
  // close was last month. If today IS the close (day === cappedToday), the
  // cycle that includes today just closed — most recent close is today, and
  // offset 0 is the NEW cycle starting tomorrow.
  let closeYear: number;
  let closeMonth: number;
  if (day > cappedToday) {
    // Today's close has already passed — most recent is this month.
    closeYear = year;
    closeMonth = month;
  } else if (day === cappedToday) {
    // Today is the close day — it's the most recent close. Offset 0 opens
    // tomorrow.
    closeYear = year;
    closeMonth = month;
  } else {
    // Haven't reached this month's close yet — most recent close was last
    // month. Construct via `new Date` to handle month underflow.
    const prev = new Date(Date.UTC(year, month - 1, 1));
    closeYear = prev.getUTCFullYear();
    closeMonth = prev.getUTCMonth();
  }

  // For offset 0, the cycle OPENS the day after `closeYear/closeMonth`'s
  // close and CLOSES at next month's statementDay (capped).
  // For offset N > 0, walk back N months on both endpoints.
  const openMonthOffset = -offset;
  const closeMonthOffset = -offset + 1;

  const openRef = new Date(Date.UTC(closeYear, closeMonth + openMonthOffset, 1));
  const closeRef = new Date(Date.UTC(closeYear, closeMonth + closeMonthOffset, 1));

  return {
    start: openDate(openRef.getUTCFullYear(), openRef.getUTCMonth(), statementDay),
    end: closeDate(closeRef.getUTCFullYear(), closeRef.getUTCMonth(), statementDay),
  };
}

/**
 * Next occurrence of paymentDueDay at or after `now`. Capped per-month.
 *
 * Returns a UTC Date at midnight on the due day.
 */
export function getNextDueDate(now: Date, paymentDueDay: number): Date {
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
