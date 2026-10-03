import { describe, it, expect } from "vitest";
import { parseImportDate, importText } from "./import";
import { isoDate, isRealCivilDate, moneyAmount } from "./validations/common";

describe("parseImportDate", () => {
  it("keeps ISO dates exactly as written, whatever the server timezone", () => {
    expect(parseImportDate("2026-04-01")).toBe("2026-04-01");
    expect(parseImportDate(" 2026/4/1 ")).toBe("2026-04-01");
    expect(parseImportDate("2026-04-01T23:30:00Z")).toBe("2026-04-01");
    expect(parseImportDate("2026-04-01 08:00")).toBe("2026-04-01");
  });

  it("rejects impossible dates instead of rolling them over", () => {
    expect(parseImportDate("2026-02-30")).toBeNull();
    expect(parseImportDate("2026-13-01")).toBeNull();
    expect(parseImportDate("31/02/2026", "DMY")).toBeNull();
    expect(parseImportDate("2024-02-29")).toBe("2024-02-29");
  });

  it("reads ambiguous numeric dates in the requested order", () => {
    expect(parseImportDate("03/04/2026", "MDY")).toBe("2026-03-04");
    expect(parseImportDate("03/04/2026", "DMY")).toBe("2026-04-03");
    expect(parseImportDate("3.4.2026", "DMY")).toBe("2026-04-03");
  });

  it("resolves unambiguous numeric dates regardless of order", () => {
    expect(parseImportDate("25/12/2026", "MDY")).toBe("2026-12-25");
    expect(parseImportDate("12/25/2026", "DMY")).toBe("2026-12-25");
  });

  it("returns null for anything else", () => {
    for (const v of ["", "yesterday", "April 1", "2026", null, undefined, {}, "01/02/26"]) {
      expect(parseImportDate(v)).toBeNull();
    }
  });
});

describe("importText", () => {
  it("trims, caps and nulls empty cells", () => {
    expect(importText("  hi  ", 10)).toBe("hi");
    expect(importText("abcdef", 3)).toBe("abc");
    expect(importText("   ", 3)).toBeNull();
    expect(importText(undefined, 3)).toBeNull();
    expect(importText(42, 5)).toBe("42");
  });
});

describe("shared validators", () => {
  it("isoDate rejects calendar-impossible days", () => {
    expect(isoDate().safeParse("2026-02-28").success).toBe(true);
    expect(isoDate().safeParse("2026-02-31").success).toBe(false);
    expect(isoDate().safeParse("2026-2-3").success).toBe(false);
    expect(isRealCivilDate("2025-02-29")).toBe(false);
  });

  it("moneyAmount rejects sub-cent and out-of-range values", () => {
    expect(moneyAmount().safeParse(0.01).success).toBe(true);
    expect(moneyAmount().safeParse("12.5").success).toBe(true);
    expect(moneyAmount().safeParse(0.001).success).toBe(false);
    expect(moneyAmount().safeParse(0).success).toBe(false);
    expect(moneyAmount().safeParse(1e12).success).toBe(false);
  });
});
