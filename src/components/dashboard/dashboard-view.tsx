"use client";
import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { MonthYearPicker } from "@/components/shared/month-year-picker";
import { SummaryCards, type SummaryData } from "./summary-cards";
import { ChartCard } from "@/components/charts/chart-container";
import { TrendChart, type TrendPoint } from "@/components/charts/trend-chart";
import { CategoryDonut, type CategorySlice } from "@/components/charts/category-donut";
import { BudgetProgressList, type BudgetProgressItem } from "./budget-progress";
import { RecentTransactions } from "./recent-transactions";
import { CardsWidget } from "./cards-widget";
import { useMonthRange } from "@/hooks/useMonthRange";
import type { TransactionListItem } from "@/types";
import type { CreditCardSummary } from "@/components/credit-cards/card-tile";

export function DashboardView({ userName, currency }: { userName: string; currency: string }) {
  const range = useMonthRange();
  const [summary, setSummary] = React.useState<SummaryData | null>(null);
  const [trend, setTrend] = React.useState<TrendPoint[]>([]);
  const [byCategory, setByCategory] = React.useState<CategorySlice[]>([]);
  const [budgets, setBudgets] = React.useState<BudgetProgressItem[]>([]);
  const [recent, setRecent] = React.useState<TransactionListItem[]>([]);
  const [cards, setCards] = React.useState<CreditCardSummary[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const qs = `from=${range.from}&to=${range.to}`;
      const [s, t, c, b, r, cc] = await Promise.all([
        fetch(`/api/analytics/summary?${qs}`).then((r) => r.json()),
        fetch(`/api/analytics/trends?${qs}&granularity=daily`).then((r) => r.json()),
        fetch(`/api/analytics/category-breakdown?${qs}&type=expense`).then((r) => r.json()),
        fetch(`/api/budgets`).then((r) => r.json()),
        fetch(`/api/transactions?page=1&limit=10&sort=date&order=desc`).then((r) => r.json()),
        fetch(`/api/credit-cards`).then((r) => r.json()),
      ]);
      if (cancelled) return;
      setSummary(s.data ?? null);
      setTrend(t.data ?? []);
      setByCategory(c.data ?? []);
      setBudgets(b.data ?? []);
      setRecent(r.data ?? []);
      setCards(cc.data ?? []);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hi, ${userName.split(" ")[0] || userName} 👋`}
        description="Here's your financial snapshot"
        action={
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
            <div className="flex items-center rounded-lg border border-border bg-background">
              <Button size="icon" variant="ghost" onClick={range.prev} aria-label="Previous month" className="h-8 w-8">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <MonthYearPicker value={range.ref} onChange={range.setRef} />
              <Button size="icon" variant="ghost" onClick={range.next} aria-label="Next month" className="h-8 w-8">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button asChild size="sm">
              <Link href="/transactions/new">
                <Plus className="h-4 w-4" /> Add
              </Link>
            </Button>
          </div>
        }
      />

      <SummaryCards data={summary} currency={currency} loading={loading} />

      <CardsWidget cards={cards} currency={currency} />

      <div className="grid gap-4 lg:grid-cols-5">
        <ChartCard
          title="Spending trend"
          description={`Daily income vs expenses · ${range.label}`}
          className="lg:col-span-3"
          loading={loading}
        >
          <TrendChart data={trend} currency={currency} granularity="daily" mode="area" />
        </ChartCard>
        <ChartCard title="By category" description="Expense breakdown" className="lg:col-span-2" loading={loading}>
          <CategoryDonut data={byCategory} currency={currency} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <ChartCard title="Budget progress" description="Top categories" className="lg:col-span-2" loading={loading}>
          <BudgetProgressList items={budgets} currency={currency} loading={false} />
        </ChartCard>
        <ChartCard
          title="Recent transactions"
          description="Last 10"
          className="lg:col-span-3"
          action={
            <Button asChild size="sm" variant="ghost">
              <Link href="/transactions">View all</Link>
            </Button>
          }
          loading={loading}
        >
          <RecentTransactions items={recent} currency={currency} loading={false} />
        </ChartCard>
      </div>
    </div>
  );
}
