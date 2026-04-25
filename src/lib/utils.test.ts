import { describe, it, expect } from "vitest";
import { formatCurrency, formatCurrencyAuto, formatCompactCurrency } from "./utils";

describe("formatCurrency", () => {
  it("uses 2 decimals for USD/EUR/GBP/INR (Intl default)", () => {
    expect(formatCurrency(12_345.67, "USD")).toBe("$12,345.67");
    expect(formatCurrency(1234.5, "EUR")).toBe("€1,234.50");
    expect(formatCurrency(1234.5, "GBP")).toBe("£1,234.50");
  });

  it("uses 0 decimals for JPY (Intl default)", () => {
    expect(formatCurrency(10, "JPY")).toBe("¥10");
    expect(formatCurrency(1234, "JPY")).toBe("¥1,234");
    expect(formatCurrency(1234.7, "JPY")).toBe("¥1,235");
  });

  it("groups INR with thousands separators in en-US locale", () => {
    // en-US locale groups by 3s — Indian lakh grouping is intentionally not used.
    expect(formatCurrency(100_000, "INR")).toBe("₹100,000.00");
  });

  it("honors signed for negative EUR", () => {
    expect(formatCurrency(-1234.5, "EUR", true)).toBe("-€1,234.50");
    expect(formatCurrency(1234.5, "EUR", true)).toBe("+€1,234.50");
    expect(formatCurrency(0, "EUR", true)).toBe("€0.00");
  });
});

describe("formatCompactCurrency", () => {
  it("returns 1dp compact notation for USD", () => {
    expect(formatCompactCurrency(1_234, "USD")).toBe("$1.2K");
    expect(formatCompactCurrency(10_000_000, "USD")).toBe("$10M");
  });

  it("suppresses trailing zeros for zero-decimal currencies", () => {
    // Critical regression check: "¥10M", not "¥10.0M".
    expect(formatCompactCurrency(10_000_000, "JPY")).toBe("¥10M");
    expect(formatCompactCurrency(1_234, "JPY")).toBe("¥1.2K");
  });
});

describe("formatCurrencyAuto", () => {
  it("uses full precision below the default 1M threshold", () => {
    expect(formatCurrencyAuto(0)).toBe(formatCurrency(0));
    expect(formatCurrencyAuto(999_999.99)).toBe(formatCurrency(999_999.99));
    expect(formatCurrencyAuto(12_345.67)).toBe("$12,345.67");
  });

  it("switches to compact notation at and above the default threshold", () => {
    expect(formatCurrencyAuto(1_000_000)).toBe(formatCompactCurrency(1_000_000));
    expect(formatCurrencyAuto(10_000_000)).toBe("$10M");
    expect(formatCurrencyAuto(1_500_000_000)).toBe("$1.5B");
  });

  it("respects a custom compactThreshold", () => {
    expect(formatCurrencyAuto(50_000, "USD", { compactThreshold: 10_000 })).toBe(
      formatCompactCurrency(50_000),
    );
    expect(formatCurrencyAuto(5_000_000, "USD", { compactThreshold: 10_000_000 })).toBe(
      formatCurrency(5_000_000),
    );
  });

  it("honors signed for both full and compact paths", () => {
    expect(formatCurrencyAuto(1234.5, "USD", { signed: true })).toBe("+$1,234.50");
    expect(formatCurrencyAuto(-1234.5, "USD", { signed: true })).toBe("-$1,234.50");
    expect(formatCurrencyAuto(0, "USD", { signed: true })).toBe("$0.00");
    expect(formatCurrencyAuto(10_000_000, "USD", { signed: true })).toBe("+$10M");
    expect(formatCurrencyAuto(-10_000_000, "USD", { signed: true })).toBe("-$10M");
  });

  it("treats the absolute value when comparing to the threshold", () => {
    expect(formatCurrencyAuto(-2_500_000)).toBe(formatCompactCurrency(2_500_000));
  });

  it("supports non-USD currencies", () => {
    expect(formatCurrencyAuto(500, "EUR")).toBe(formatCurrency(500, "EUR"));
    expect(formatCurrencyAuto(10_000_000, "EUR")).toBe(formatCompactCurrency(10_000_000, "EUR"));
  });
});
