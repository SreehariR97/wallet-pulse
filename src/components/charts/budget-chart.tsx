"use client";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { tooltipNumber } from "./recharts-helpers";
import { formatCurrency } from "@/lib/utils";
import {
  AXIS_LABEL,
  AXIS_TICK,
  CHART_ACCENT,
  CHART_DESTRUCTIVE,
  CHART_SUCCESS,
  CHART_WARNING,
  CURSOR_FILL,
  GRID_STROKE,
  TOOLTIP_BG,
  TOOLTIP_BORDER,
  TOOLTIP_ITEM_STYLE,
} from "./palette";

export interface BudgetChartRow {
  name: string;
  amount: number;
  spent: number;
}

/** Same thresholds as the progress bars on the budget cards. */
function spentColor(pct: number) {
  if (pct >= 100) return CHART_DESTRUCTIVE;
  if (pct >= 80) return CHART_WARNING;
  if (pct >= 50) return CHART_ACCENT;
  return CHART_SUCCESS;
}

/**
 * Budget vs spent per budget. The budget cards above it list the same
 * numbers as text, so the graphic is hidden from assistive tech.
 */
export function BudgetChart({ rows, currency }: { rows: BudgetChartRow[]; currency: string }) {
  return (
    <div aria-hidden>
      <ResponsiveContainer width="100%" height={Math.max(260, rows.length * 44)}>
        <BarChart
          data={rows.map((r) => ({ name: r.name, budget: r.amount, spent: r.spent }))}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
          accessibilityLayer={false}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: AXIS_TICK, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => formatCurrency(v, currency)}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: AXIS_LABEL, fontSize: 12 }}
            width={120}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            itemStyle={TOOLTIP_ITEM_STYLE}
            contentStyle={{
              background: TOOLTIP_BG,
              border: `1px solid ${TOOLTIP_BORDER}`,
              borderRadius: "0.75rem",
              fontSize: 12,
            }}
            formatter={(v, n) => [formatCurrency(tooltipNumber(v), currency), n === "budget" ? "Budget" : "Spent"]}
            cursor={{ fill: CURSOR_FILL, opacity: 0.6 }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          <Bar dataKey="budget" fill="hsl(27 11% 78%)" radius={[0, 6, 6, 0]} />
          <Bar dataKey="spent" fill={CHART_ACCENT} radius={[0, 6, 6, 0]}>
            {rows.map((r, i) => (
              <Cell key={i} fill={spentColor(r.amount > 0 ? (r.spent / r.amount) * 100 : 0)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
