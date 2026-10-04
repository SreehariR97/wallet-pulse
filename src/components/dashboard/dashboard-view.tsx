"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { format } from "date-fns";
import { useSyncToUrl } from "@/hooks/useUrlState";
import { parseMonthParam } from "@/lib/url-state";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { MonthYearPicker } from "@/components/shared/month-year-picker";
import { SummaryCards, type SummaryData } from "./summary-cards";
import { ChartCard } from "@/components/charts/chart-container";
import { CategoryDonut, TrendChart } from "@/components/charts/lazy";
import type { TrendPoint } from "@/components/charts/trend-chart";
import type { CategorySlice } from "@/components/charts/category-donut";
import { BudgetProgressList, type BudgetProgressItem } from "./budget-progress";
import { RecentTransactions } from "./recent-transactions";
import { CardsWidget } from "./cards-widget";
import { AccountsWidget } from "./accounts-widget";
import { useAccounts } from "@/hooks/useAccounts";
import { useMonthRange } from "@/hooks/useMonthRange";
import { ErrorState } from "@/components/shared/error-state";
import { revalidateAll, type ApiEnvelope } from "@/lib/api-client";
import type { TransactionListItem } from "@/types";
import type { CreditCardSummary } from "@/components/credit-cards/card-tile";

export function DashboardView({ userName, currency }: { userName: string; currency: string }) {
  const searchParams = useSearchParams();
  const [initialMonth] = React.useState(() => parseMonthParam(searchParams.get("month")));
  const range = useMonthRange(initialMonth);
  // The current month is the default, so it stays out of the URL.
  const monthParam = range.from.slice(0, 7);
  useSyncToUrl({ month: monthParam === format(new Date(), "yyyy-MM") ? undefined : monthParam });
  const qs = `from=${range.from}&to=${range.to}`;
  const summary = useSWR<ApiEnvelope<SummaryData>>(`/api/analytics/summary?${qs}`);
  const trend = useSWR<ApiEnvelope<TrendPoint[]>>(`/api/analytics/trends?${qs}&granularity=daily`);
  const byCategory = useSWR<ApiEnvelope<CategorySlice[]>>(`/api/analytics/category-breakdown?${qs}&type=expense`);
  const budgets = useSWR<ApiEnvelope<BudgetProgressItem[]>>("/api/budgets");
  const recent = useSWR<ApiEnvelope<TransactionListItem[]>>("/api/transactions?page=1&limit=10&sort=date&order=desc");
  const cards = useSWR<ApiEnvelope<CreditCardSummary[]>>("/api/credit-cards");
  const accounts = useAccounts();
  const all = [summary, trend, byCategory, budgets, recent, cards, accounts];
  const failed = all.some((r) => r.error);

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

      {failed && (
        <ErrorState
          title="Some of your dashboard didn't load"
          description="The numbers below may be incomplete. Your data is safe."
          onRetry={() => void revalidateAll()}
        />
      )}

      <SummaryCards data={summary.data?.data ?? null} currency={currency} loading={summary.isLoading} />

      <AccountsWidget accounts={accounts.active} currency={currency} />

      <CardsWidget cards={cards.data?.data ?? []} currency={currency} />

      <div className="grid gap-4 lg:grid-cols-5">
        <ChartCard
          title="Spending trend"
          description={`Daily income vs expenses · ${range.label}`}
          className="lg:col-span-3"
          loading={trend.isLoading}
        >
          <TrendChart data={trend.data?.data ?? []} currency={currency} granularity="daily" mode="area" />
        </ChartCard>
        <ChartCard title="By category" description="Expense breakdown" className="lg:col-span-2" loading={byCategory.isLoading}>
          <CategoryDonut data={byCategory.data?.data ?? []} currency={currency} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <ChartCard title="Budget progress" description="Top categories" className="lg:col-span-2" loading={budgets.isLoading}>
          <BudgetProgressList items={budgets.data?.data ?? []} currency={currency} loading={false} />
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
          loading={recent.isLoading}
        >
          <RecentTransactions items={recent.data?.data ?? []} currency={currency} loading={false} />
        </ChartCard>
      </div>
    </div>
  );
}
