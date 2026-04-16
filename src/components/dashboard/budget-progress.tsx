"use client";
import Link from "next/link";
import { ArrowRight, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { cn, formatCurrency } from "@/lib/utils";

export interface BudgetProgressItem {
  id: string;
  amount: number;
  spent: number;
  period: "weekly" | "monthly" | "yearly";
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
}

function barColor(pct: number) {
  if (pct >= 100) return "bg-destructive";
  if (pct >= 80) return "bg-warning";
  if (pct >= 50) return "bg-primary";
  return "bg-success";
}

export function BudgetProgressList({
  items,
  currency,
  loading,
  limit = 5,
}: {
  items: BudgetProgressItem[];
  currency: string;
  loading: boolean;
  limit?: number;
}) {
  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }
  if (!items.length) {
    return (
      <EmptyState
        icon={<Target className="h-6 w-6" />}
        title="No budgets yet"
        description="Set category budgets to track your progress at a glance."
        action={
          <Button asChild size="sm">
            <Link href="/budgets">Create a budget</Link>
          </Button>
        }
      />
    );
  }

  const top = items.slice(0, limit);

  return (
    <div className="space-y-4">
      {top.map((b) => {
        const pct = b.amount > 0 ? (b.spent / b.amount) * 100 : 0;
        const clamped = Math.min(100, pct);
        const color = barColor(pct);
        return (
          <div key={b.id}>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-md text-xs"
                  style={{
                    backgroundColor: (b.categoryColor ?? "#6366F1") + "22",
                    color: b.categoryColor ?? "#6366F1",
                  }}
                >
                  {b.categoryIcon ?? "🎯"}
                </span>
                <span className="truncate font-medium">{b.categoryName ?? "Overall"}</span>
              </div>
              <span className={cn("tabular-nums text-xs font-medium", pct >= 100 ? "text-destructive" : "text-muted-foreground")}>
                {formatCurrency(b.spent, currency)} / {formatCurrency(b.amount, currency)}
              </span>
            </div>
            <Progress value={clamped} indicatorClassName={cn(color, pct >= 100 && "animate-pulse")} />
          </div>
        );
      })}
      {items.length > limit && (
        <div className="pt-1 text-right">
          <Button asChild size="sm" variant="ghost">
            <Link href="/budgets">
              See all budgets <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
