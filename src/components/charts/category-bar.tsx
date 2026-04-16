"use client";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompactCurrency, formatCurrency } from "@/lib/utils";
import type { CategorySlice } from "./category-donut";

export function CategoryBar({ data, currency }: { data: CategorySlice[]; currency: string }) {
  if (!data.length) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No data</div>;
  }
  const top = data.slice(0, 10);
  return (
    <ResponsiveContainer width="100%" height={Math.max(260, top.length * 36)}>
      <BarChart data={top} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <XAxis
          type="number"
          tickFormatter={(v) => formatCompactCurrency(v, currency)}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fill: "hsl(var(--foreground))", fontSize: 12 }}
          width={120}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "var(--radius)",
            fontSize: 12,
          }}
          formatter={(v: number) => formatCurrency(v, currency)}
          cursor={{ fill: "hsl(var(--secondary))", opacity: 0.4 }}
        />
        <Bar dataKey="total" radius={[0, 6, 6, 0]}>
          {top.map((s) => (
            <Cell key={s.categoryId} fill={s.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
