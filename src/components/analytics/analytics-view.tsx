"use client";
import * as React from "react";
import { format, startOfMonth, endOfMonth, subMonths, subDays, startOfYear, endOfYear, subYears } from "date-fns";
import { PageHeader } from "@/components/shared/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChartCard } from "@/components/charts/chart-container";
import { CategoryBar, CategoryDonut, IncomeExpenseBars, PaymentDonut, TrendChart } from "@/components/charts/lazy";
import type { TrendPoint } from "@/components/charts/trend-chart";
import type { CategorySlice } from "@/components/charts/category-donut";
import type { PaymentMethodSlice } from "@/components/charts/payment-donut";
import { SpendingHeatmap } from "@/components/charts/spending-heatmap";
import { MomTable } from "./mom-table";
import { useSearchParams } from "next/navigation";
import { useSyncToUrl } from "@/hooks/useUrlState";
import { parseAnalyticsUrl, type AnalyticsPreset } from "@/lib/url-state";
import useSWR from "swr";
import { ErrorState } from "@/components/shared/error-state";
import { revalidateAll, type ApiEnvelope } from "@/lib/api-client";
import { useAccounts } from "@/hooks/useAccounts";
import { cn } from "@/lib/utils";
import type { AnalyticsView as View } from "@/types";

// Kept here, not imported from trend-chart: a value import would pull
// Recharts into this page's first-load JS (see charts/lazy.tsx).
const LABELS = {
  spending: { income: "Income", expense: "Expenses" },
  cashflow: { income: "Money in", expense: "Money out" },
} as const;

const VIEW_HELP: Record<View, string> = {
  spending:
    "What you earned and spent. Card purchases count when you make them; card payments, transfers between accounts and loans don't count.",
  cashflow:
    "Money actually entering and leaving your accounts. Card purchases count when you pay the card; loans and remittances count; moves between your own accounts cancel out.",
};

type RangePreset = AnalyticsPreset;

function rangeFor(preset: RangePreset, customFrom?: string, customTo?: string): { from: string; to: string; granularity: "daily" | "monthly" } {
  const today = new Date();
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");
  switch (preset) {
    case "thisMonth":
      return { from: fmt(startOfMonth(today)), to: fmt(endOfMonth(today)), granularity: "daily" };
    case "last3":
      return { from: fmt(startOfMonth(subMonths(today, 2))), to: fmt(endOfMonth(today)), granularity: "monthly" };
    case "last6":
      return { from: fmt(startOfMonth(subMonths(today, 5))), to: fmt(endOfMonth(today)), granularity: "monthly" };
    case "thisYear":
      return { from: fmt(startOfYear(today)), to: fmt(endOfYear(today)), granularity: "monthly" };
    case "lastYear": {
      const ly = subYears(today, 1);
      return { from: fmt(startOfYear(ly)), to: fmt(endOfYear(ly)), granularity: "monthly" };
    }
    case "all":
      return { from: "2000-01-01", to: fmt(today), granularity: "monthly" };
    case "custom":
      return {
        from: customFrom ?? fmt(subDays(today, 30)),
        to: customTo ?? fmt(today),
        granularity: "monthly",
      };
  }
}

const ALL_ACCOUNTS = "__all__";

export function AnalyticsView({ currency }: { currency: string }) {
  const searchParams = useSearchParams();
  const [initial] = React.useState(() => parseAnalyticsUrl(searchParams));
  const [preset, setPreset] = React.useState<RangePreset>(initial.preset);
  const [customFrom, setCustomFrom] = React.useState(initial.from ?? format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = React.useState(initial.to ?? format(new Date(), "yyyy-MM-dd"));
  const [view, setView] = React.useState<View>(initial.view);
  const [accountId, setAccountId] = React.useState<string | undefined>(initial.accountId);
  const accounts = useAccounts().all;
  useSyncToUrl({
    ...(preset === "custom"
      ? { range: preset, from: customFrom || undefined, to: customTo || undefined }
      : { range: preset === "thisMonth" ? undefined : preset }),
    view: view === "spending" ? undefined : view,
    account: accountId,
  });
  const labels = LABELS[view];
  const scope =
    (view === "cashflow" ? "&view=cashflow" : "") + (accountId ? `&accountId=${encodeURIComponent(accountId)}` : "");

  const { from, to, granularity } = rangeFor(preset, customFrom, customTo);

  // A half-typed or inverted custom range fetches nothing (null key) rather
  // than six requests per keystroke.
  const validRange = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;
  const qs = validRange ? `from=${from}&to=${to}${scope}` : null;
  const trend = useSWR<ApiEnvelope<TrendPoint[]>>(qs && `/api/analytics/trends?${qs}&granularity=${granularity}`);
  const byCategory = useSWR<ApiEnvelope<CategorySlice[]>>(qs && `/api/analytics/category-breakdown?${qs}&type=expense`);
  const dailyTrend = useSWR<ApiEnvelope<TrendPoint[]>>(qs && `/api/analytics/trends?${qs}&granularity=daily`);
  const paymentMethods = useSWR<ApiEnvelope<PaymentMethodSlice[]>>(qs && `/api/analytics/payment-methods?${qs}`);

  // Month-over-month is always this month vs last, independent of the
  // selected range — separate keys, so changing the range doesn't refetch it.
  const mom = React.useMemo(() => {
    const today = new Date();
    const prev = subMonths(today, 1);
    const f = (d: Date) => format(d, "yyyy-MM-dd");
    return {
      current: `/api/analytics/category-breakdown?from=${f(startOfMonth(today))}&to=${f(endOfMonth(today))}&type=expense${scope}`,
      previous: `/api/analytics/category-breakdown?from=${f(startOfMonth(prev))}&to=${f(endOfMonth(prev))}&type=expense${scope}`,
    };
  }, [scope]);
  const momCurrent = useSWR<ApiEnvelope<CategorySlice[]>>(mom.current);
  const momPrev = useSWR<ApiEnvelope<CategorySlice[]>>(mom.previous);
  const failed = [trend, byCategory, dailyTrend, paymentMethods, momCurrent, momPrev].some((r) => r.error);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Deep dive into your finances"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="radiogroup"
              aria-label="Count money as"
              className="flex h-9 items-center rounded-lg border border-border bg-background p-0.5"
            >
              {(["spending", "cashflow"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={view === v}
                  onClick={() => setView(v)}
                  className={cn(
                    "h-full rounded-md px-3 text-[13px] font-[540] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                    view === v ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v === "spending" ? "Spending" : "Cash flow"}
                </button>
              ))}
            </div>
            {(accounts.length > 0 || accountId) && (
              <Select value={accountId ?? ALL_ACCOUNTS} onValueChange={(v) => setAccountId(v === ALL_ACCOUNTS ? undefined : v)}>
                <SelectTrigger className="w-[170px]" aria-label="Account">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_ACCOUNTS}>All accounts</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                      {!a.isActive ? " (archived)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={preset} onValueChange={(v) => setPreset(v as RangePreset)}>
              <SelectTrigger className="w-[170px]" aria-label="Date range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="thisMonth">This Month</SelectItem>
                <SelectItem value="last3">Last 3 Months</SelectItem>
                <SelectItem value="last6">Last 6 Months</SelectItem>
                <SelectItem value="thisYear">This Year</SelectItem>
                <SelectItem value="lastYear">Last Year</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
            {preset === "custom" && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="analytics-from" className="text-xs text-muted-foreground">From</Label>
                  <Input id="analytics-from" type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 w-36" />
                </div>
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="analytics-to" className="text-xs text-muted-foreground">To</Label>
                  <Input id="analytics-to" type="date" value={customTo} min={customFrom} onChange={(e) => setCustomTo(e.target.value)} className="h-9 w-36" />
                </div>
              </div>
            )}
          </div>
        }
      />

      <p className="-mt-3 max-w-3xl text-[13px] font-[460] leading-[1.45] text-muted-foreground">
        <span className="font-[600] text-foreground">{view === "spending" ? "Spending" : "Cash flow"}:</span>{" "}
        {VIEW_HELP[view]}
        {accountId && " Showing one account only, including transfers to and from your other accounts."}
      </p>

      {failed && (
        <ErrorState
          title="Some charts didn't load"
          description="What's shown may be incomplete. Your data is safe."
          onRetry={() => void revalidateAll()}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title={view === "spending" ? "Spending over time" : "Cash flow over time"}
          description={`${labels.income} vs. ${labels.expense.toLowerCase()}`}
          loading={trend.isLoading}
        >
          <TrendChart data={trend.data?.data ?? []} currency={currency} granularity={granularity} mode="line" labels={labels} />
        </ChartCard>
        <ChartCard
          title={view === "spending" ? "Income vs. expense" : "Money in vs. out"}
          description="Per-period comparison"
          loading={trend.isLoading}
        >
          <IncomeExpenseBars data={trend.data?.data ?? []} currency={currency} granularity={granularity} labels={labels} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Category breakdown" description={view === "spending" ? "Share of expenses" : "Share of money out"} loading={byCategory.isLoading}>
          <CategoryDonut data={byCategory.data?.data ?? []} currency={currency} />
        </ChartCard>
        <ChartCard title={view === "spending" ? "Top spending categories" : "Top money-out categories"} description="Ranked by total" loading={byCategory.isLoading}>
          <CategoryBar data={byCategory.data?.data ?? []} currency={currency} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={view === "spending" ? "Daily spending heatmap" : "Daily money-out heatmap"} description="Intensity per day" loading={dailyTrend.isLoading}>
          <SpendingHeatmap data={dailyTrend.data?.data ?? []} from={from} to={to} currency={currency} />
        </ChartCard>
        <ChartCard title="Payment method distribution" description={view === "spending" ? "Expenses split by method" : "Money out split by method"} loading={paymentMethods.isLoading}>
          <PaymentDonut data={paymentMethods.data?.data ?? []} currency={currency} />
        </ChartCard>
      </div>

      <ChartCard title="Month-over-month comparison" description="This month vs. last month" loading={momCurrent.isLoading || momPrev.isLoading}>
        <MomTable current={momCurrent.data?.data ?? []} previous={momPrev.data?.data ?? []} currency={currency} loading={false} />
      </ChartCard>
    </div>
  );
}
