"use client";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency, percentChange } from "@/lib/utils";
import type { CategorySlice } from "@/components/charts/category-donut";

export function MomTable({
  current,
  previous,
  currency,
  loading,
}: {
  current: CategorySlice[];
  previous: CategorySlice[];
  currency: string;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  const prevMap = new Map(previous.map((p) => [p.categoryId, p]));
  const rows = current.map((c) => {
    const prev = prevMap.get(c.categoryId);
    const prevTotal = prev?.total ?? 0;
    const change = percentChange(c.total, prevTotal);
    return { ...c, prev: prevTotal, change };
  });

  for (const p of previous) {
    if (!rows.find((r) => r.categoryId === p.categoryId)) {
      rows.push({
        ...p,
        total: 0,
        prev: p.total,
        change: percentChange(0, p.total),
      } as typeof rows[number]);
    }
  }

  rows.sort((a, b) => b.total - a.total);

  if (!rows.length) {
    return <div className="py-10 text-center text-sm text-muted-foreground">No data for comparison</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <th className="py-2">Category</th>
            <th className="py-2 text-right">Previous</th>
            <th className="py-2 text-right">Current</th>
            <th className="py-2 text-right">Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const up = r.change > 0;
            const down = r.change < 0;
            const Icon = up ? ArrowUp : down ? ArrowDown : Minus;
            return (
              <tr key={r.categoryId} className="border-b border-border/30">
                <td className="py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md text-sm" style={{ backgroundColor: r.color + "22", color: r.color }}>
                      {r.icon}
                    </span>
                    <span className="font-medium">{r.name}</span>
                  </div>
                </td>
                <td className="py-2.5 text-right tabular-nums text-muted-foreground">{formatCurrency(r.prev, currency)}</td>
                <td className="py-2.5 text-right tabular-nums font-medium">{formatCurrency(r.total, currency)}</td>
                <td className="py-2.5 text-right">
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums",
                      up && "bg-destructive/10 text-destructive",
                      down && "bg-success/10 text-success",
                      !up && !down && "bg-muted/50 text-muted-foreground"
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {Math.abs(r.change).toFixed(0)}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
