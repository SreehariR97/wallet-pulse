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
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="font-heading text-[17px] font-[540] tracking-[-0.015em] text-foreground">Nothing to compare yet</p>
        <p className="mt-1 max-w-xs text-[13px] font-[460] leading-[1.5] text-muted-foreground">
          Log a few expenses this month and last month and this view will fill in.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] font-[600] uppercase tracking-[0.08em] text-muted-foreground">
            <th className="py-3">Category</th>
            <th className="py-3 text-right">Previous</th>
            <th className="py-3 text-right">Current</th>
            <th className="py-3 text-right">Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const up = r.change > 0;
            const down = r.change < 0;
            const Icon = up ? ArrowUp : down ? ArrowDown : Minus;
            return (
              <tr key={r.categoryId} className="border-b border-border/60 last:border-b-0">
                <td className="py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg text-sm" style={{ backgroundColor: r.color + "22", color: r.color }}>
                      {r.icon}
                    </span>
                    <span className="font-[540] leading-[1.35]">{r.name}</span>
                  </div>
                </td>
                <td className="py-3 text-right tabular-nums text-muted-foreground font-[460]">{formatCurrency(r.prev, currency)}</td>
                <td className="py-3 text-right tabular-nums font-[540]">{formatCurrency(r.total, currency)}</td>
                <td className="py-3 text-right">
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 rounded-lg px-1.5 py-0.5 text-xs font-[600] tabular-nums",
                      up && "bg-destructive/10 text-destructive",
                      down && "bg-success/10 text-success",
                      !up && !down && "bg-muted text-muted-foreground"
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
