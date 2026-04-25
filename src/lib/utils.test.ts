import { describe, it, expect } from "vitest";
import { formatCurrency, formatCurrencyAuto, formatCompactCurrency } from "./utils";

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
