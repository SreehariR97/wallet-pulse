"use client";
import { eachDayOfInterval, format, getDay, max as maxDate, parseISO, subDays } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import type { TrendPoint } from "./trend-chart";

const MAX_DAYS = 371; // 53 weeks

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
  const toDate = parseISO(to);
  // At most ~a year of cells: "All time" from 2000 used to render ~9,700
  // divs that no screen could show anyway.
  const earliest = subDays(toDate, MAX_DAYS - 1);
  const fromDate = maxDate([parseISO(from), earliest]);
  const capped = parseISO(from) < earliest;
  const days = eachDayOfInterval({ start: fromDate, end: toDate });

  const map = new Map<string, number>();
  let max = 0;
  for (const d of data) {
    map.set(d.bucket, d.expense);
    if (d.expense > max) max = d.expense;
  }

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

  let peakDay: string | null = null;
  for (const d of data) if (d.expense === max && max > 0) peakDay = d.bucket;
  const summary =
    `Daily spending from ${format(fromDate, "MMM d, yyyy")} to ${format(toDate, "MMM d, yyyy")}. ` +
    (peakDay
      ? `Highest day: ${format(parseISO(peakDay), "MMM d, yyyy")} at ${formatCurrency(max, currency)}.`
      : "No spending in this period.");

  return (
    <div>
      {capped && (
        <p className="mb-2 text-xs font-[460] text-muted-foreground">Showing the last 12 months of this range.</p>
      )}
      {/* Scrolls sideways on narrow screens instead of being clipped. */}
      <div className="overflow-x-auto pb-1" tabIndex={0} aria-label="Spending heatmap, scrollable">
        <div className="grid auto-cols-min grid-flow-col gap-1" role="img" aria-label={summary}>
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
