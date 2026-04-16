"use client";
import { ArrowDownLeft, ArrowUpRight, PiggyBank, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";

export interface SummaryData {
  income: number;
  expense: number;
  net: number;
  savingsRate: number;
}

export function SummaryCards({ data, currency, loading }: { data: SummaryData | null; currency: string; loading: boolean }) {
  const items: Array<{
    label: string;
    value: string;
    icon: React.ElementType;
    accent: string;
    sub?: string;
  }> = [
    {
      label: "Income",
      value: data ? formatCurrency(data.income, currency) : "—",
      icon: ArrowDownLeft,
      accent: "text-success bg-success/10",
    },
    {
      label: "Expenses",
      value: data ? formatCurrency(data.expense, currency) : "—",
      icon: ArrowUpRight,
      accent: "text-destructive bg-destructive/10",
    },
    {
      label: "Net balance",
      value: data ? formatCurrency(data.net, currency, true) : "—",
      icon: Wallet,
      accent: (data?.net ?? 0) >= 0 ? "text-primary bg-primary/10" : "text-destructive bg-destructive/10",
    },
    {
      label: "Savings rate",
      value: data ? formatPercent(data.savingsRate) : "—",
      icon: PiggyBank,
      accent: (data?.savingsRate ?? 0) >= 20 ? "text-success bg-success/10" : "text-warning bg-warning/10",
      sub: data && data.income > 0 ? "of income saved" : "No income this month",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.label} className="overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{item.label}</span>
                <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", item.accent)}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              {loading ? (
                <Skeleton className="mt-3 h-8 w-32" />
              ) : (
                <div className="mt-2 font-heading text-2xl font-bold tracking-tight tabular-nums">{item.value}</div>
              )}
              {item.sub && <div className="mt-1 text-xs text-muted-foreground">{item.sub}</div>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
