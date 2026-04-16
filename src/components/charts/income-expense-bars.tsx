"use client";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format, parseISO } from "date-fns";
import { formatCompactCurrency, formatCurrency } from "@/lib/utils";
import type { TrendPoint } from "./trend-chart";

export function IncomeExpenseBars({
  data,
  currency,
  granularity = "monthly",
}: {
  data: TrendPoint[];
  currency: string;
  granularity?: "daily" | "monthly";
}) {
  const tickFormatter = (v: string) => {
    try {
      if (granularity === "monthly") return format(parseISO(v + "-01"), "MMM yy");
      return format(parseISO(v), "MMM d");
    } catch {
      return v;
    }
  };
  if (!data.length) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No data</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="bucket" tickFormatter={tickFormatter} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={(v) => formatCompactCurrency(v, currency)} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "var(--radius)",
            fontSize: 12,
          }}
          labelFormatter={(v) => tickFormatter(String(v))}
          formatter={(value: number, name: string) => [formatCurrency(value, currency), name.charAt(0).toUpperCase() + name.slice(1)]}
          cursor={{ fill: "hsl(var(--secondary))", opacity: 0.4 }}
        />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Bar dataKey="income" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
        <Bar dataKey="expense" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
