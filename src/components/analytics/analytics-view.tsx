"use client";
import * as React from "react";
import { format, startOfMonth, endOfMonth, subMonths, subDays, startOfYear, endOfYear, subYears } from "date-fns";
import { PageHeader } from "@/components/shared/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChartCard } from "@/components/charts/chart-container";
import { TrendChart, type TrendPoint } from "@/components/charts/trend-chart";
import { CategoryDonut, type CategorySlice } from "@/components/charts/category-donut";
import { CategoryBar } from "@/components/charts/category-bar";
import { IncomeExpenseBars } from "@/components/charts/income-expense-bars";
import { PaymentDonut, type PaymentMethodSlice } from "@/components/charts/payment-donut";
import { SpendingHeatmap } from "@/components/charts/spending-heatmap";
import { MomTable } from "./mom-table";

type RangePreset = "thisMonth" | "last3" | "last6" | "thisYear" | "lastYear" | "all" | "custom";

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
  const [preset, setPreset] = React.useState<RangePreset>("thisMonth");
  const [customFrom, setCustomFrom] = React.useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = React.useState(format(new Date(), "yyyy-MM-dd"));

  const { from, to, granularity } = rangeFor(preset, customFrom, customTo);

  const [trend, setTrend] = React.useState<TrendPoint[]>([]);
  const [byCategory, setByCategory] = React.useState<CategorySlice[]>([]);
  const [dailyTrend, setDailyTrend] = React.useState<TrendPoint[]>([]);
  const [paymentMethods, setPaymentMethods] = React.useState<PaymentMethodSlice[]>([]);
  const [momCurrent, setMomCurrent] = React.useState<CategorySlice[]>([]);
  const [momPrev, setMomPrev] = React.useState<CategorySlice[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const qs = `from=${from}&to=${to}`;
      const today = new Date();
      const curMonthFrom = format(startOfMonth(today), "yyyy-MM-dd");
      const curMonthTo = format(endOfMonth(today), "yyyy-MM-dd");
      const prevMonth = subMonths(today, 1);
      const prevMonthFrom = format(startOfMonth(prevMonth), "yyyy-MM-dd");
      const prevMonthTo = format(endOfMonth(prevMonth), "yyyy-MM-dd");

      const [t, c, d, p, mc, mp] = await Promise.all([
        fetch(`/api/analytics/trends?${qs}&granularity=${granularity}`).then((r) => r.json()),
        fetch(`/api/analytics/category-breakdown?${qs}&type=expense`).then((r) => r.json()),
        fetch(`/api/analytics/trends?${qs}&granularity=daily`).then((r) => r.json()),
        fetch(`/api/analytics/payment-methods?${qs}`).then((r) => r.json()),
        fetch(`/api/analytics/category-breakdown?from=${curMonthFrom}&to=${curMonthTo}&type=expense`).then((r) => r.json()),
        fetch(`/api/analytics/category-breakdown?from=${prevMonthFrom}&to=${prevMonthTo}&type=expense`).then((r) => r.json()),
      ]);
      if (cancelled) return;
      setTrend(t.data ?? []);
      setByCategory(c.data ?? []);
      setDailyTrend(d.data ?? []);
      setPaymentMethods(p.data ?? []);
      setMomCurrent(mc.data ?? []);
      setMomPrev(mp.data ?? []);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [from, to, granularity]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Deep dive into your finances"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={preset} onValueChange={(v) => setPreset(v as RangePreset)}>
              <SelectTrigger className="w-[170px]">
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
                  <Label className="text-xs text-muted-foreground">From</Label>
                  <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 w-36" />
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground">To</Label>
                  <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 w-36" />
                </div>
              </div>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Spending over time" description="Income vs. expenses" loading={loading}>
          <TrendChart data={trend} currency={currency} granularity={granularity} mode="line" />
        </ChartCard>
        <ChartCard title="Income vs. expense" description="Per-period comparison" loading={loading}>
          <IncomeExpenseBars data={trend} currency={currency} granularity={granularity} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Category breakdown" description="Share of expenses" loading={loading}>
          <CategoryDonut data={byCategory} currency={currency} />
        </ChartCard>
        <ChartCard title="Top spending categories" description="Ranked by total" loading={loading}>
          <CategoryBar data={byCategory} currency={currency} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Daily spending heatmap" description="Intensity per day" loading={loading}>
          <SpendingHeatmap data={dailyTrend} from={from} to={to} currency={currency} />
        </ChartCard>
        <ChartCard title="Payment method distribution" description="Expenses split by method" loading={loading}>
          <PaymentDonut data={paymentMethods} currency={currency} />
        </ChartCard>
      </div>

      <ChartCard title="Month-over-month comparison" description="This month vs. last month" loading={loading}>
        <MomTable current={momCurrent} previous={momPrev} currency={currency} loading={false} />
      </ChartCard>
    </div>
  );
}
