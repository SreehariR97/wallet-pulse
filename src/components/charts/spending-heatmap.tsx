"use client";
import { eachDayOfInterval, format, getDay, parseISO, startOfWeek } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import type { TrendPoint } from "./trend-chart";

export function SpendingHeatmap({
  data,
  from,
  to,
  currency,
}: {
  data: TrendPoint[];
  from: string;
  to: string;
  currency: string;
}) {
  const fromDate = parseISO(from);
  const toDate = parseISO(to);
  const days = eachDayOfInterval({ start: fromDate, end: toDate });

  const map = new Map<string, number>();
  let max = 0;
  for (const d of data) {
    map.set(d.bucket, d.expense);
    if (d.expense > max) max = d.expense;
  }

  const startPadding = getDay(startOfWeek(fromDate, { weekStartsOn: 0 }));
  const padded: Array<Date | null> = [];
  const firstDow = getDay(fromDate);
  for (let i = 0; i < firstDow; i++) padded.push(null);
  padded.push(...days);

  function intensity(v: number): string {
    if (v <= 0) return "bg-foreground/[0.06]";
    const t = v / max;
    if (t < 0.2) return "bg-accent/30";
    if (t < 0.4) return "bg-accent/55";
    if (t < 0.6) return "bg-accent/80";
    if (t < 0.85) return "bg-accent";
    return "bg-[hsl(261_45%_58%)]";
  }

  return (
    <div>
      <div className="grid auto-cols-min grid-flow-col gap-1">
        {Array.from({ length: Math.ceil(padded.length / 7) }).map((_, colIdx) => (
          <div key={colIdx} className="grid grid-rows-7 gap-1">
            {Array.from({ length: 7 }).map((_, rowIdx) => {
              const i = colIdx * 7 + rowIdx;
              const day = padded[i];
              if (!day) return <div key={rowIdx} className="h-3 w-3 rounded-[3px]" />;
              const key = format(day, "yyyy-MM-dd");
              const v = map.get(key) ?? 0;
              return (
                <div
                  key={rowIdx}
                  className={`h-3 w-3 rounded-[3px] ${intensity(v)} cursor-default transition-transform hover:scale-125`}
                  title={`${format(day, "MMM d, yyyy")} — ${formatCurrency(v, currency)}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-xs font-[460] text-muted-foreground">
        <span>Less</span>
        <span className="h-3 w-3 rounded-[3px] bg-foreground/[0.06]" />
        <span className="h-3 w-3 rounded-[3px] bg-accent/55" />
        <span className="h-3 w-3 rounded-[3px] bg-accent/80" />
        <span className="h-3 w-3 rounded-[3px] bg-accent" />
        <span className="h-3 w-3 rounded-[3px] bg-[hsl(261_45%_58%)]" />
        <span>More</span>
      </div>
    </div>
  );
}
