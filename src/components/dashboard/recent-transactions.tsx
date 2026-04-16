"use client";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowRight, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { cn, dateFromSeconds, formatCurrency } from "@/lib/utils";
import type { TransactionListItem } from "@/types";

export function RecentTransactions({
  items,
  currency,
  loading,
}: {
  items: TransactionListItem[];
  currency: string;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (!items.length) {
    return (
      <EmptyState
        icon={<Receipt className="h-6 w-6" />}
        title="No transactions yet"
        description="Log your first transaction to see it appear here."
        action={
          <Button asChild size="sm">
            <Link href="/transactions/new">Add transaction</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="-mx-2 divide-y divide-border/50">
      {items.map((t) => (
        <Link
          key={t.id}
          href={`/transactions/${t.id}/edit`}
          className="flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-secondary/60"
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm"
            style={{ backgroundColor: (t.categoryColor ?? "#6366F1") + "22", color: t.categoryColor ?? "#6366F1" }}
          >
            {t.categoryIcon ?? "📦"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{t.description}</div>
            <div className="text-xs text-muted-foreground">
              {t.categoryName ?? "Uncategorized"} · {format(dateFromSeconds(t.date), "MMM d")}
            </div>
          </div>
          <div className={cn(
            "tabular-nums text-sm font-semibold",
            t.type === "income" ? "text-success" : t.type === "expense" ? "text-destructive" : "text-foreground"
          )}>
            {t.type === "income" ? "+" : t.type === "expense" ? "-" : ""}
            {formatCurrency(t.amount, t.currency ?? currency)}
          </div>
        </Link>
      ))}
    </div>
  );
}
