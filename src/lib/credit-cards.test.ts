import { describe, it, expect } from "vitest";
import {
  cappedDayOfMonth,
  getNextDueDate,
  getStatementCycle,
  lastDayOfMonth,
} from "./credit-cards";

function utc(y: number, m: number, d: number, h = 12): Date {
  return new Date(Date.UTC(y, m, d, h, 0, 0, 0));
}

function iso(d: Date): string {
  return d.toISOString();
}

describe("lastDayOfMonth / cappedDayOfMonth", () => {
  it("caps statementDay=31 to 28 in non-leap February", () => {
    expect(lastDayOfMonth(2025, 1)).toBe(28);
    expect(cappedDayOfMonth(2025, 1, 31)).toBe(28);
  });
  it("caps statementDay=31 to 29 in leap February", () => {
    expect(lastDayOfMonth(2024, 1)).toBe(29);
    expect(cappedDayOfMonth(2024, 1, 31)).toBe(29);
  });
});

describe("getStatementCycle", () => {
  // Sanity — a textbook case before the edges.
  it("textbook: S=15, today=Apr 20 → cycle Apr 16 – May 15 (current)", () => {
    const cycle = getStatementCycle(utc(2026, 3, 20), 15, 0);
    // Opens day after Apr 15 close; closes at next S=15.
    expect(iso(cycle.start)).toBe("2026-04-16T00:00:00.000Z");
    expect(iso(cycle.end)).toBe("2026-05-15T23:59:59.999Z");
  });

  // Boundary: today IS statementDay. Convention: today belongs to the
  // cycle that just closed, and the fresh (offset=0) cycle begins tomorrow.
  it("boundary: S=15, today=Apr 15 → offset=0 opens Apr 16 (new cycle, tx today closed the prior)", () => {
    const cycle = getStatementCycle(utc(2026, 3, 15), 15, 0);
    expect(iso(cycle.start)).toBe("2026-04-16T00:00:00.000Z");
    expect(iso(cycle.end)).toBe("2026-05-15T23:59:59.999Z");
  });

  // The day immediately after statementDay. Exercises the
  // `day > cappedToday` branch — same cycle boundaries as the boundary
  // case above, different branch in the helper.
  it("day after statement: S=15, today=Apr 16 → cycle Apr 16 – May 15", () => {
    const cycle = getStatementCycle(utc(2026, 3, 16), 15, 0);
    expect(iso(cycle.start)).toBe("2026-04-16T00:00:00.000Z");
    expect(iso(cycle.end)).toBe("2026-05-15T23:59:59.999Z");
  });

  // Non-leap Feb. S=31 capped to Feb 28. Exercises the short-month cap
  // inside closeDate() when the reference month lacks the target day.
  it("non-leap Feb: S=31, today=Feb 15 2025 → cycle Feb 1 – Feb 28", () => {
    const cycle = getStatementCycle(utc(2025, 1, 15), 31, 0);
    // Previous close = Jan 31. openDate(Jan, 31) = Jan 32 → Feb 1 (rollover).
    expect(iso(cycle.start)).toBe("2025-02-01T00:00:00.000Z");
    // Current close = Feb capped = Feb 28.
    expect(iso(cycle.end)).toBe("2025-02-28T23:59:59.999Z");
  });

  // Leap Feb. Same cycle structure, closes a day later (Feb 29).
  it("leap Feb: S=31, today=Feb 15 2024 → cycle Feb 1 – Feb 29", () => {
    const cycle = getStatementCycle(utc(2024, 1, 15), 31, 0);
    expect(iso(cycle.start)).toBe("2024-02-01T00:00:00.000Z");
    expect(iso(cycle.end)).toBe("2024-02-29T23:59:59.999Z");
  });

  // Month rollover with mid-month date. Forces the "day < cappedToday"
  // branch to walk back a month for the close reference.
  it("month rollover: S=28, today=Apr 5 → cycle Mar 29 – Apr 28", () => {
    const cycle = getStatementCycle(utc(2026, 3, 5), 28, 0);
    expect(iso(cycle.start)).toBe("2026-03-29T00:00:00.000Z");
    expect(iso(cycle.end)).toBe("2026-04-28T23:59:59.999Z");
  });

  // statementDay=30 on Mar 1: Feb has no day 30, so Feb's cycle closes on
  // Feb's last day (28 or 29).
  // Current cycle (offset 0) is Mar 1–Mar 30 (the NEW cycle that opened
  // the day after Feb's close).
  // Previous cycle (offset 1) is Jan 31–Feb 28/29 (the one that just
  // closed — opened Jan 31 since Jan's close was Jan 30).
  // This follows the "statementDay = last day of closing cycle"
  // convention set in DESIGN.md / stage 3.
  it("short→long month: S=30, today=Mar 1 2025 → offset 0 = Mar 1 – Mar 30; offset 1 = Jan 31 – Feb 28", () => {
    const current = getStatementCycle(utc(2025, 2, 1), 30, 0);
    expect(iso(current.start)).toBe("2025-03-01T00:00:00.000Z");
    expect(iso(current.end)).toBe("2025-03-30T23:59:59.999Z");

    const previous = getStatementCycle(utc(2025, 2, 1), 30, 1);
    expect(iso(previous.start)).toBe("2025-01-31T00:00:00.000Z");
    expect(iso(previous.end)).toBe("2025-02-28T23:59:59.999Z");
  });

  // Statement day = 1. Edge of the range; verifies that "day === 1" math
  // doesn't accidentally collide with the previous-month-underflow math.
  it("S=1: today=Apr 10 → cycle Apr 2 – May 1 (S=1 closes on the 1st)", () => {
    const cycle = getStatementCycle(utc(2026, 3, 10), 1, 0);
    // Previous close = Apr 1. openDate(Apr, 1) = Apr 2.
    expect(iso(cycle.start)).toBe("2026-04-02T00:00:00.000Z");
    // Current close = May 1.
    expect(iso(cycle.end)).toBe("2026-05-01T23:59:59.999Z");
  });

  // Offset=1 on the textbook case — verifies walking back one cycle.
  it("offset=1 (previous): S=15, today=Apr 20 → cycle Mar 16 – Apr 15", () => {
    const cycle = getStatementCycle(utc(2026, 3, 20), 15, 1);
    expect(iso(cycle.start)).toBe("2026-03-16T00:00:00.000Z");
    expect(iso(cycle.end)).toBe("2026-04-15T23:59:59.999Z");
  });
});

describe("getNextDueDate", () => {
  it("due day this month, before today → rolls to next month", () => {
    // Today Apr 20, due=9 → May 9.
    expect(iso(getNextDueDate(utc(2026, 3, 20), 9))).toBe("2026-05-09T00:00:00.000Z");
  });
  it("due day this month, today or later → this month", () => {
    // Today Apr 5, due=9 → Apr 9.
    expect(iso(getNextDueDate(utc(2026, 3, 5), 9))).toBe("2026-04-09T00:00:00.000Z");
  });
  it("due day capped in short months", () => {
    // Today Feb 10 2025, due=31 → capped to Feb 28.
    expect(iso(getNextDueDate(utc(2025, 1, 10), 31))).toBe("2025-02-28T00:00:00.000Z");
  });
});
