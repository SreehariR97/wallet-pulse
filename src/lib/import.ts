import { isRealCivilDate } from "@/lib/civil-date";

/** How to read an ambiguous numeric date like 03/04/2026. */
export type DateOrder = "MDY" | "DMY";

/**
 * Parse a CSV date cell into a civil YYYY-MM-DD string, or null.
 *
 * Never goes through `new Date("2026-04-01")`: that parses as UTC midnight,
 * and formatting it in a server timezone west of UTC shifted every imported
 * row back a day. It also rolled impossible dates over ("2026-02-30" →
 * March 2) instead of rejecting them.
 *
 * Accepted:
 *  - YYYY-MM-DD, YYYY/MM/DD, optionally followed by a time ("2026-04-01T09:30Z"
 *    keeps the calendar day as written)
 *  - D/M/YYYY or M/D/YYYY with / - or . separators. A first part over 12 can
 *    only be a day; otherwise `order` decides.
 */
export function parseImportDate(raw: unknown, order: DateOrder = "MDY"): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const value = String(raw).trim();

  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/.exec(value);
  if (iso) return civil(iso[1], iso[2], iso[3]);

  const numeric = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  if (numeric) {
    const [a, b, year] = [Number(numeric[1]), Number(numeric[2]), numeric[3]];
    const dayFirst = a > 12 || (order === "DMY" && b <= 12);
    return dayFirst ? civil(year, b, a) : civil(year, a, b);
  }
  return null;
}

function civil(year: string | number, month: string | number, day: string | number): string | null {
  const s = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isRealCivilDate(s) ? s : null;
}

/** Trim and cap a free-text cell to the same limits the API enforces elsewhere. */
export function importText(raw: unknown, max: number): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s ? s.slice(0, max) : null;
}
