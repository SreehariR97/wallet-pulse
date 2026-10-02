import { describe, it, expect } from "vitest";
import { PAYMENT_METHODS, TX_TYPES, parseAnalyticsUrl, parseMonthParam, parseTransactionsUrl, transactionsUrlParams } from "./url-state";
import { paymentMethodEnum, transactionTypeEnum } from "./validations/transaction";

const sp = (q: string) => new URLSearchParams(q);

describe("transactions URL state", () => {
  it("round-trips filters, search, sort and page", () => {
    const q =
      "type=expense&paymentMethod=upi&categoryId=cat-1&from=2026-04-01&to=2026-04-30&minAmount=10.5&maxAmount=200&tags=work&q=coffee&sort=amount&order=asc&page=3";
    const state = parseTransactionsUrl(sp(q));
    expect(state).toMatchObject({
      filters: { type: "expense", paymentMethod: "upi", categoryId: "cat-1", from: "2026-04-01", to: "2026-04-30", minAmount: "10.5", maxAmount: "200", tags: "work" },
      search: "coffee",
      sort: "amount",
      order: "asc",
      page: 3,
    });
    const back = new URLSearchParams(
      Object.entries(transactionsUrlParams(state)).filter((e): e is [string, string] => !!e[1]),
    );
    expect(parseTransactionsUrl(back)).toEqual(state);
  });

  it("leaves defaults out of the URL", () => {
    const params = transactionsUrlParams(parseTransactionsUrl(sp("")));
    expect(Object.values(params).filter(Boolean)).toEqual([]);
  });

  it("drops malformed values instead of sending them to the API", () => {
    const state = parseTransactionsUrl(
      sp("type=bogus&paymentMethod=gold&shortcut=x&from=2026-02-31&minAmount=abc&sort=hack&order=sideways&page=-4"),
    );
    expect(state.filters).toEqual({
      type: undefined,
      paymentMethod: undefined,
      shortcut: undefined,
      categoryId: undefined,
      creditCardId: undefined,
      from: undefined,
      to: undefined,
      minAmount: undefined,
      maxAmount: undefined,
      tags: undefined,
    });
    expect([state.sort, state.order, state.page]).toEqual(["date", "desc", 1]);
  });
});

describe("dashboard month", () => {
  it("parses YYYY-MM and rejects anything else", () => {
    expect(parseMonthParam("2026-04")?.getMonth()).toBe(3);
    for (const bad of [null, "2026-13", "2026-4", "april", "2026-04-01"]) expect(parseMonthParam(bad)).toBeUndefined();
  });
});

describe("analytics range", () => {
  it("accepts known presets and custom dates", () => {
    expect(parseAnalyticsUrl(sp("range=last6"))).toEqual({ preset: "last6" });
    expect(parseAnalyticsUrl(sp("range=custom&from=2026-01-01&to=2026-03-31"))).toEqual({
      preset: "custom",
      from: "2026-01-01",
      to: "2026-03-31",
    });
    expect(parseAnalyticsUrl(sp("range=forever"))).toEqual({ preset: "thisMonth" });
  });
});

describe("enum lists", () => {
  it("match the server's Zod enums", () => {
    expect([...TX_TYPES].sort()).toEqual([...transactionTypeEnum.options].sort());
    expect([...PAYMENT_METHODS].sort()).toEqual([...paymentMethodEnum.options].sort());
  });
});
