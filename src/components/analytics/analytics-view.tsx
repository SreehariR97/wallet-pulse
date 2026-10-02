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

export function AnalyticsView({ currency }: { currency: string }) {
  const searchParams = useSearchParams();
  const [initial] = React.useState(() => parseAnalyticsUrl(searchParams));
  const [preset, setPreset] = React.useState<RangePreset>(initial.preset);
  const [customFrom, setCustomFrom] = React.useState(initial.from ?? format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = React.useState(initial.to ?? format(new Date(), "yyyy-MM-dd"));
  useSyncToUrl(
    preset === "custom"
      ? { range: preset, from: customFrom || undefined, to: customTo || undefined }
      : { range: preset === "thisMonth" ? undefined : preset },
  );

  const { from, to, granularity } = rangeFor(preset, customFrom, customTo);

  // A half-typed or inverted custom range fetches nothing (null key) rather
  // than six requests per keystroke.
  const validRange = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;
  const qs = validRange ? `from=${from}&to=${to}` : null;
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
      current: `/api/analytics/category-breakdown?from=${f(startOfMonth(today))}&to=${f(endOfMonth(today))}&type=expense`,
      previous: `/api/analytics/category-breakdown?from=${f(startOfMonth(prev))}&to=${f(endOfMonth(prev))}&type=expense`,
    };
  }, []);
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

      {failed && (
        <ErrorState
          title="Some charts didn't load"
          description="What's shown may be incomplete. Your data is safe."
          onRetry={() => void revalidateAll()}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Spending over time" description="Income vs. expenses" loading={trend.isLoading}>
          <TrendChart data={trend.data?.data ?? []} currency={currency} granularity={granularity} mode="line" />
        </ChartCard>
        <ChartCard title="Income vs. expense" description="Per-period comparison" loading={trend.isLoading}>
          <IncomeExpenseBars data={trend.data?.data ?? []} currency={currency} granularity={granularity} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Category breakdown" description="Share of expenses" loading={byCategory.isLoading}>
          <CategoryDonut data={byCategory.data?.data ?? []} currency={currency} />
        </ChartCard>
        <ChartCard title="Top spending categories" description="Ranked by total" loading={byCategory.isLoading}>
          <CategoryBar data={byCategory.data?.data ?? []} currency={currency} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Daily spending heatmap" description="Intensity per day" loading={dailyTrend.isLoading}>
          <SpendingHeatmap data={dailyTrend.data?.data ?? []} from={from} to={to} currency={currency} />
        </ChartCard>
        <ChartCard title="Payment method distribution" description="Expenses split by method" loading={paymentMethods.isLoading}>
          <PaymentDonut data={paymentMethods.data?.data ?? []} currency={currency} />
        </ChartCard>
      </div>

      <ChartCard title="Month-over-month comparison" description="This month vs. last month" loading={momCurrent.isLoading || momPrev.isLoading}>
        <MomTable current={momCurrent.data?.data ?? []} previous={momPrev.data?.data ?? []} currency={currency} loading={false} />
      </ChartCard>
    </div>
  );
}
