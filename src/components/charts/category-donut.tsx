"use client";
import * as React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/utils";

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
    <div className="grid gap-4 md:grid-cols-[1fr_1.2fr] md:items-center">
      <div className="relative">
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={data}
              dataKey="total"
              nameKey="name"
              innerRadius={60}
              outerRadius={95}
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
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "var(--radius)",
                fontSize: 12,
              }}
              formatter={(value: number, _name, props) => [formatCurrency(value, currency), props.payload?.name]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Total</div>
          <div className="font-heading text-xl font-bold tabular-nums">{formatCurrency(total, currency)}</div>
        </div>
      </div>
      <ul className="space-y-1.5 text-sm">
        {data.slice(0, 8).map((s) => {
          const pct = total ? (s.total / total) * 100 : 0;
          return (
            <li key={s.categoryId} className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="truncate">
                  <span className="mr-1">{s.icon}</span>
                  {s.name}
                </span>
              </div>
              <div className="flex items-center gap-3 text-right tabular-nums">
                <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                <span className="font-medium">{formatCurrency(s.total, currency)}</span>
              </div>
            </li>
          );
        })}
        {data.length > 8 && <li className="pt-1 text-xs text-muted-foreground">+{data.length - 8} more</li>}
      </ul>
    </div>
  );
}
