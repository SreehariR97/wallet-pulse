"use client";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { INCOME_FIRST_TOOLTIP, tooltipNumber } from "./recharts-helpers";
import { format, parseISO } from "date-fns";
import { formatCompactCurrency, formatCurrency } from "@/lib/utils";
import {
  AXIS_TICK,
  CHART_DESTRUCTIVE,
  CHART_SUCCESS,
  GRID_STROKE,
  TOOLTIP_BG,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_BORDER,
} from "./palette";

export interface TrendPoint {
  bucket: string;
  income: number;
  expense: number;
  net: number;
}

/** Series names: "Income"/"Expenses" for spending, "Money in"/"Money out" for cash flow. */
export interface TrendLabels {
  income: string;
  expense: string;
}
export const SPENDING_LABELS: TrendLabels = { income: "Income", expense: "Expenses" };

export function TrendChart({
  data,
  currency,
  granularity = "daily",
  mode = "area",
  showIncome = true,
  labels = SPENDING_LABELS,
}: {
  data: TrendPoint[];
  currency: string;
  granularity?: "daily" | "monthly";
  mode?: "area" | "line";
  showIncome?: boolean;
  labels?: TrendLabels;
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

  const Chart = mode === "line" ? LineChart : AreaChart;

  // Days with no activity are left out of the screen-reader table.
  const nonZero = data.filter((d) => d.income !== 0 || d.expense !== 0);

  return (
    <>
      <table className="sr-only">
        <caption>{labels.income} and {labels.expense.toLowerCase()} per {granularity === "monthly" ? "month" : "day"}</caption>
        <thead>
          <tr>
            <th scope="col">{granularity === "monthly" ? "Month" : "Day"}</th>
            {showIncome && <th scope="col">{labels.income}</th>}
            <th scope="col">{labels.expense}</th>
          </tr>
        </thead>
        <tbody>
          {nonZero.map((d) => (
            <tr key={d.bucket}>
              <th scope="row">{tickFormatter(d.bucket)}</th>
              {showIncome && <td>{formatCurrency(d.income, currency)}</td>}
              <td>{formatCurrency(d.expense, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div aria-hidden>
        <ResponsiveContainer width="100%" height={280}>
          <Chart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} accessibilityLayer={false}>
            <defs>
              <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_DESTRUCTIVE} stopOpacity={0.35} />
                <stop offset="100%" stopColor={CHART_DESTRUCTIVE} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_SUCCESS} stopOpacity={0.35} />
                <stop offset="100%" stopColor={CHART_SUCCESS} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
            <XAxis dataKey="bucket" tickFormatter={tickFormatter} tick={{ fill: AXIS_TICK, fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={(v) => formatCompactCurrency(v, currency)} tick={{ fill: AXIS_TICK, fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
            <Tooltip
              itemStyle={TOOLTIP_ITEM_STYLE}
              contentStyle={{
                background: TOOLTIP_BG,
                border: `1px solid ${TOOLTIP_BORDER}`,
                borderRadius: "0.75rem",
                fontSize: 12,
              }}
              labelFormatter={(v) => tickFormatter(String(v))}
              formatter={(value, name) => [formatCurrency(tooltipNumber(value), currency), name]}
              itemSorter={INCOME_FIRST_TOOLTIP}
            />
            {mode === "line" ? (
              <>
                {showIncome && (
                  <Line
                    type="monotone"
                    dataKey="income"
                    name={labels.income}
                    stroke={CHART_SUCCESS}
                    strokeWidth={2.25}
                    dot={{ r: 2.5, fill: CHART_SUCCESS, strokeWidth: 0 }}
                    activeDot={{ r: 4 }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="expense"
                  name={labels.expense}
                  stroke={CHART_DESTRUCTIVE}
                  strokeWidth={2.25}
                  dot={{ r: 2.5, fill: CHART_DESTRUCTIVE, strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                />
              </>
            ) : (
              <>
                {showIncome && (
                  <Area type="monotone" dataKey="income" name={labels.income} stroke={CHART_SUCCESS} strokeWidth={2.25} fill="url(#gradIncome)" />
                )}
                <Area type="monotone" dataKey="expense" name={labels.expense} stroke={CHART_DESTRUCTIVE} strokeWidth={2.25} fill="url(#gradExpense)" />
              </>
            )}
          </Chart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
