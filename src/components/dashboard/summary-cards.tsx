"use client";
import { ArrowDownLeft, ArrowUpRight, PiggyBank } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency, formatCurrencyAuto, formatPercent } from "@/lib/utils";

export interface SummaryData {
  income: number;
  expense: number;
  net: number;
  savingsRate: number;
}

export function SummaryCards({ data, currency, loading }: { data: SummaryData | null; currency: string; loading: boolean }) {
  const net = data?.net ?? 0;
  const netPositive = net >= 0;
  const secondary: Array<{
    label: string;
    value: string;
    title?: string;
    icon: React.ElementType;
    tone: "income" | "expense" | "savings";
    sub?: string;
  }> = [
    {
      label: "Income",
      value: data ? formatCurrencyAuto(data.income, currency) : "—",
      title: data ? formatCurrency(data.income, currency) : undefined,
      icon: ArrowDownLeft,
      tone: "income",
    },
    {
      label: "Expenses",
      value: data ? formatCurrencyAuto(data.expense, currency) : "—",
      title: data ? formatCurrency(data.expense, currency) : undefined,
      icon: ArrowUpRight,
      tone: "expense",
    },
    {
      label: "Savings rate",
      // Render guard: a slightly negative rate (e.g. -15%) is informative —
      // "you spent 15% more than you earned". A massively negative rate
      // ("-153,659.3%") is mathematically correct but visually meaningless,
      // so we collapse to "—" + an explanatory sub-label below -100%.
      value: data
        ? data.income > 0 && data.savingsRate >= -100
          ? formatPercent(data.savingsRate)
          : "—"
        : "—",
      icon: PiggyBank,
      tone: "savings",
      sub: data
        ? data.income === 0
          ? "No income this month"
          : data.savingsRate < -100
            ? "Spending exceeds income"
            : data.savingsRate < 0
              ? "Spent more than earned"
              : "of income saved"
        : undefined,
    },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-2 overflow-hidden">
        <CardContent className="flex h-full flex-col justify-between p-6">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-[600] uppercase tracking-[0.1em] text-muted-foreground">Net balance</span>
            <span className={cn(
              "inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-[700] tracking-[-0.005em]",
              netPositive ? "bg-accent text-accent-foreground" : "bg-destructive/15 text-destructive"
            )}>
              {netPositive ? "Net +" : "Net −"}
            </span>
          </div>
          {loading ? (
            <Skeleton className="mt-4 h-14 w-48" />
          ) : (
            <div
              className="mt-3 font-heading text-[36px] sm:text-[42px] md:text-[48px] font-[540] leading-[0.96] tracking-[-0.03em] tabular-nums"
              title={data ? formatCurrency(Math.abs(net), currency) : undefined}
            >
              {data ? formatCurrencyAuto(Math.abs(net), currency) : "—"}
            </div>
          )}
          <div className="mt-3 text-[13px] font-[460] leading-[1.4] text-muted-foreground">
            {data
              ? netPositive
                ? "Income exceeded expenses this period."
                : "Expenses exceeded income this period."
              : "Loading your balance for the selected range."}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3 lg:col-span-3">
        {secondary.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="overflow-hidden">
              <CardContent className="p-5">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[11px] font-[600] uppercase tracking-[0.1em] text-muted-foreground">{item.label}</span>
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
                {loading ? (
                  <Skeleton className="mt-3 h-7 w-24" />
                ) : (
                  <div
                    className="mt-2 font-heading text-[22px] font-[540] leading-[1.1] tracking-[-0.015em] tabular-nums"
                    title={item.title}
                  >
                    {item.value}
                  </div>
                )}
                {item.sub && <div className="mt-1 text-[12px] font-[460] text-muted-foreground">{item.sub}</div>}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
