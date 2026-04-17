"use client";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCurrency, paymentMethodLabel } from "@/lib/utils";
import { CHART_PALETTE, TOOLTIP_BG, TOOLTIP_BORDER } from "./palette";

export interface PaymentMethodSlice {
  paymentMethod: string;
  total: number;
  count: number;
}

export function PaymentDonut({ data, currency }: { data: PaymentMethodSlice[]; currency: string }) {
  if (!data.length) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No data</div>;
  }
  const total = data.reduce((s, d) => s + d.total, 0);
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_1fr] md:items-center">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} dataKey="total" nameKey="paymentMethod" innerRadius={50} outerRadius={85} paddingAngle={2} stroke="transparent">
            {data.map((d, i) => (
              <Cell key={d.paymentMethod} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: TOOLTIP_BG,
              border: `1px solid ${TOOLTIP_BORDER}`,
              borderRadius: "0.75rem",
              fontSize: 12,
            }}
            formatter={(v: number, n) => [formatCurrency(v, currency), paymentMethodLabel(String(n))]}
          />
        </PieChart>
      </ResponsiveContainer>
      <ul className="space-y-2 text-sm">
        {data.map((d, i) => {
          const pct = total ? (d.total / total) * 100 : 0;
          return (
            <li key={d.paymentMethod} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length] }} />
                <span className="font-[460]">{paymentMethodLabel(d.paymentMethod)}</span>
              </div>
              <div className="flex items-center gap-3 text-right tabular-nums">
                <span className="text-xs font-[460] text-muted-foreground">{pct.toFixed(0)}%</span>
                <span className="font-[540]">{formatCurrency(d.total, currency)}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
