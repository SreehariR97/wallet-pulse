import { describe, it, expect } from "vitest";
import { allocateCycleForPayment } from "./credit-cards";
import {
  computeCycleAmountsPaid,
  diffCycleAmounts,
  type CycleSlim,
} from "./credit-card-allocation";

// Three consecutive cycles, ~monthly, ~23-day grace.
const CYCLES: CycleSlim[] = [
  { id: "c1", cycleCloseDate: "2026-01-15", paymentDueDate: "2026-02-07" },
  { id: "c2", cycleCloseDate: "2026-02-15", paymentDueDate: "2026-03-10" },
  { id: "c3", cycleCloseDate: "2026-03-15", paymentDueDate: "2026-04-07" },
];

describe("allocateCycleForPayment", () => {
  it("returns null when cycles list is empty", () => {
    expect(allocateCycleForPayment([], "2026-02-20")).toBeNull();
  });

  it("allocates a payment in the (close, due] window to that cycle", () => {
    // Between c2 close (2/15) and c2 due (3/10).
    expect(allocateCycleForPayment(CYCLES, "2026-02-20")).toBe("c2");
  });

  it("payment ON the due date is inclusive (allocated to that cycle)", () => {
    expect(allocateCycleForPayment(CYCLES, "2026-03-10")).toBe("c2");
  });

  it("payment ON a close date is strict-left (allocated to the PRIOR cycle's window)", () => {
    // c1.due = 2/07, c2.close = 2/15. A payment on 2/15 is NOT in c2's
    // window (strict left), but 2/15 > c1.close (1/15) and <= c1.due (2/07)?
    // No — 2/15 > 2/07, so c1 excludes it. So 2/15 returns null (dead zone).
    expect(allocateCycleForPayment(CYCLES, "2026-02-15")).toBeNull();
  });

  it("payment before the earliest cycle's close returns null", () => {
    expect(allocateCycleForPayment(CYCLES, "2026-01-10")).toBeNull();
  });

  it("payment after the latest cycle's due returns null", () => {
    expect(allocateCycleForPayment(CYCLES, "2026-05-01")).toBeNull();
  });

  it("payment in the dead zone between two cycles (after prior due, before next close) returns null", () => {
    // c1.due = 2/07, c2.close = 2/15. 2/10 is in neither window.
    expect(allocateCycleForPayment(CYCLES, "2026-02-10")).toBeNull();
  });

  it("returns the FIRST matching cycle when iterating (cycles ordered ASC by close)", () => {
    // Overlapping windows are pathological but defense-in-depth: the first
    // match in list order wins.
    const overlapping: CycleSlim[] = [
      { id: "x", cycleCloseDate: "2026-01-01", paymentDueDate: "2026-02-15" },
      { id: "y", cycleCloseDate: "2026-01-20", paymentDueDate: "2026-02-20" },
    ];
    expect(allocateCycleForPayment(overlapping, "2026-02-10")).toBe("x");
  });
});

describe("computeCycleAmountsPaid", () => {
  it("initializes every cycle to 0 even when no payments match", () => {
    const { perCycle, unallocated } = computeCycleAmountsPaid(CYCLES, []);
    expect(perCycle.size).toBe(3);
    expect(perCycle.get("c1")).toBe(0);
    expect(perCycle.get("c2")).toBe(0);
    expect(perCycle.get("c3")).toBe(0);
    expect(unallocated).toBe(0);
  });

  it("sums multiple payments into the same cycle", () => {
    const { perCycle, unallocated } = computeCycleAmountsPaid(CYCLES, [
      { date: "2026-02-20", amount: 100 },
      { date: "2026-03-01", amount: 50.25 },
      { date: "2026-03-10", amount: 25 }, // inclusive due-date
    ]);
    expect(perCycle.get("c2")).toBeCloseTo(175.25);
    expect(perCycle.get("c1")).toBe(0);
    expect(perCycle.get("c3")).toBe(0);
    expect(unallocated).toBe(0);
  });

  it("counts unallocated payments that fall outside every window", () => {
    const { perCycle, unallocated } = computeCycleAmountsPaid(CYCLES, [
      { date: "2026-01-10", amount: 99 }, // before c1.close
      { date: "2026-02-10", amount: 10 }, // dead zone
      { date: "2026-02-20", amount: 50 }, // valid, in c2
    ]);
    expect(unallocated).toBe(2);
    expect(perCycle.get("c2")).toBe(50);
  });
});

describe("diffCycleAmounts", () => {
  const seed = CYCLES.map((c) => ({ ...c, amountPaid: 0 }));

  it("returns empty when nothing changes", () => {
    const perCycle = new Map([["c1", 0], ["c2", 0], ["c3", 0]]);
    expect(diffCycleAmounts(seed, perCycle)).toEqual([]);
  });

  it("ignores sub-cent noise (floating-point safe)", () => {
    const near: typeof seed = seed.map((c) =>
      c.id === "c2" ? { ...c, amountPaid: 100.003 } : c,
    );
    const perCycle = new Map([["c1", 0], ["c2", 100], ["c3", 0]]);
    expect(diffCycleAmounts(near, perCycle)).toEqual([]);
  });

  it("emits a diff when the delta exceeds half a cent", () => {
    const perCycle = new Map([["c1", 0], ["c2", 175.25], ["c3", 0]]);
    expect(diffCycleAmounts(seed, perCycle)).toEqual([
      { cycleId: "c2", newAmountStr: "175.25" },
    ]);
  });

  it("formats newAmountStr as numeric(14,2)", () => {
    const perCycle = new Map([["c1", 12.3], ["c2", 0], ["c3", 5]]);
    const diffs = diffCycleAmounts(seed, perCycle);
    expect(diffs).toEqual([
      { cycleId: "c1", newAmountStr: "12.30" },
      { cycleId: "c3", newAmountStr: "5.00" },
    ]);
  });
});
