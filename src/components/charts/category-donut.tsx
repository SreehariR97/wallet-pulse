"use client";
import * as React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCompactCurrency, formatCurrency, formatCurrencyAuto } from "@/lib/utils";
import { TOOLTIP_BG, TOOLTIP_BORDER } from "./palette";

export interface CategorySlice {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  total: number;
  count: number;
}

export function CategoryDonut({
  data,
  currency,
  onSliceClick,
}: {
  data: CategorySlice[];
  currency: string;
  onSliceClick?: (slice: CategorySlice) => void;
}) {
  const total = data.reduce((s, d) => s + d.total, 0);

  if (!data.length) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No expenses for this period
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
      {/*
        Fixed 200x200 square so the donut always has room for its full
        diameter. Previously this was a fluid 1fr column inside a
        md:grid-cols-[1fr_1.2fr] grid — at 1300-1500px viewports the column
        resolved to ~160px, narrower than the 190px pie diameter, and
        Recharts clipped the circle at left+right leaving two arcs.
        Radii are now percentages so the pie scales with the container if
        we ever resize it.
      */}
      <div className="relative mx-auto h-[200px] w-[200px] shrink-0 md:mx-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="total"
              nameKey="name"
              innerRadius="55%"
              outerRadius="92%"
              paddingAngle={2}
              stroke="transparent"
              onClick={(d: any) => onSliceClick?.(d.payload)}
              cursor={onSliceClick ? "pointer" : "default"}
            >
              {data.map((s) => (
                <Cell key={s.categoryId} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: TOOLTIP_BG,
                border: `1px solid ${TOOLTIP_BORDER}`,
                borderRadius: "0.75rem",
                fontSize: 12,
              }}
              formatter={(value: number, _name, props) => [formatCurrency(value, currency), props.payload?.name]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-[10px] font-[600] uppercase tracking-[0.1em] text-muted-foreground">Total</div>
          <div
            className="mt-0.5 max-w-[120px] text-center font-heading text-[20px] font-[540] leading-[1] tracking-[-0.02em] tabular-nums"
            title={formatCurrency(total, currency)}
          >
            {formatCompactCurrency(total, currency)}
          </div>
        </div>
      </div>
      {/*
        min-w-0 lets this ul shrink below its min-content width — without it,
        a flex item defaults to min-width: min-content, so a $10,000,000.00
        amount inside one of the legend rows pushes the whole ul wider than
        the card on dashboard widths.
      */}
      <ul className="min-w-0 flex-1 space-y-2 text-sm">
        {data.slice(0, 8).map((s) => {
          const pct = total ? (s.total / total) * 100 : 0;
          return (
            <li key={s.categoryId} className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                {/*
                  Icon must live OUTSIDE the truncating span. When the
                  legend gets very narrow (dashboard's lg:col-span-2-of-5
                  placement at 1024-1500px), `truncate` was collapsing
                  the icon and name together — both vanished as a unit
                  and users had no way to identify the slice. Splitting
                  ensures the emoji stays a visible anchor even when the
                  name truncates to zero width.
                */}
                <span className="mr-1.5 shrink-0">{s.icon}</span>
                <span className="truncate font-[460]">{s.name}</span>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-right tabular-nums">
                <span className="text-xs font-[460] text-muted-foreground">{pct.toFixed(0)}%</span>
                <span
                  className="whitespace-nowrap font-[540]"
                  title={formatCurrency(s.total, currency)}
                >
                  {formatCurrencyAuto(s.total, currency)}
                </span>
              </div>
            </li>
          );
        })}
        {data.length > 8 && <li className="pt-1 text-xs font-[460] text-muted-foreground">+{data.length - 8} more</li>}
      </ul>
    </div>
  );
}
