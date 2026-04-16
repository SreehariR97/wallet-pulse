"use client";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format, parseISO } from "date-fns";
import { formatCompactCurrency, formatCurrency } from "@/lib/utils";

export interface TrendPoint {
  bucket: string;
  income: number;
  expense: number;
  net: number;
}

export function TrendChart({
  data,
  currency,
  granularity = "daily",
  mode = "area",
  showIncome = true,
}: {
  data: TrendPoint[];
  currency: string;
  granularity?: "daily" | "monthly";
  mode?: "area" | "line";
  showIncome?: boolean;
}) {
  const tickFormatter = (v: string) => {
    try {
      if (granularity === "monthly") return format(parseISO(v + "-01"), "MMM");
      return format(parseISO(v), "MMM d");
    } catch {
      return v;
    }
  };

  if (!data.length) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No data for this period
      </div>
    );
  }

  const Chart: any = mode === "line" ? LineChart : AreaChart;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <Chart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.4} />
            <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.4} />
            <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
          </linearGradient>
        </defs>
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
        />
        {mode === "line" ? (
          <>
            {showIncome && <Line type="monotone" dataKey="income" stroke="hsl(var(--success))" strokeWidth={2} dot={false} />}
            <Line type="monotone" dataKey="expense" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
          </>
        ) : (
          <>
            {showIncome && (
              <Area type="monotone" dataKey="income" stroke="hsl(var(--success))" strokeWidth={2} fill="url(#gradIncome)" />
            )}
            <Area type="monotone" dataKey="expense" stroke="hsl(var(--destructive))" strokeWidth={2} fill="url(#gradExpense)" />
          </>
        )}
      </Chart>
    </ResponsiveContainer>
  );
}
