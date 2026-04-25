"use client";
import * as React from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const MONTH_INDICES = Array.from({ length: 12 }, (_, i) => i);

/**
 * Month/year selector. Visually a drop-in replacement for the inert
 * "April 2026" label between the dashboard's prev/next chevrons — same
 * typography, with a small chevron-down hinting that it opens.
 *
 * Year navigation inside the popover only changes the displayed grid;
 * selection only happens on a month click. This matches typical OS-level
 * date pickers and means a user browsing future years can back out via
 * Escape without committing.
 */
export function MonthYearPicker({
  value,
  onChange,
  className,
}: {
  value: Date;
  onChange: (date: Date) => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [displayedYear, setDisplayedYear] = React.useState(value.getFullYear());

  // Reset the displayed year to the selected value's year each time the
  // popover opens — otherwise a user who scrolled to 2030, closed, and
  // reopened months later would land back on 2030 instead of where they
  // actually are.
  React.useEffect(() => {
    if (open) setDisplayedYear(value.getFullYear());
  }, [open, value]);

  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const selectedYear = value.getFullYear();
  const selectedMonth = value.getMonth();

  function selectMonth(monthIndex: number) {
    onChange(new Date(displayedYear, monthIndex, 1));
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Pick month — current ${format(value, "MMMM yyyy")}`}
          className={cn(
            "inline-flex h-8 min-w-[8.5rem] items-center justify-center gap-1.5 rounded-md px-2 text-sm font-[540] tabular-nums outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent",
            className,
          )}
        >
          <span>{format(value, "MMMM yyyy")}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-[240px] p-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setDisplayedYear((y) => y - 1)}
            aria-label="Previous year"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div
            className="text-sm font-[540] tabular-nums"
            aria-live="polite"
          >
            {displayedYear}
          </div>
          <button
            type="button"
            onClick={() => setDisplayedYear((y) => y + 1)}
            aria-label="Next year"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div
          className="mt-3 grid grid-cols-3 gap-1.5"
          role="grid"
          aria-label={`Months in ${displayedYear}`}
        >
          {MONTH_INDICES.map((m) => {
            const isSelected = displayedYear === selectedYear && m === selectedMonth;
            const isToday = displayedYear === todayYear && m === todayMonth;
            const labelDate = new Date(displayedYear, m, 1);
            return (
              <button
                key={m}
                type="button"
                onClick={() => selectMonth(m)}
                aria-label={format(labelDate, "MMMM yyyy")}
                aria-pressed={isSelected}
                className={cn(
                  "rounded-md py-2 text-sm font-[540] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60",
                  isSelected
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "hover:bg-accent hover:text-accent-foreground",
                  !isSelected && isToday && "ring-1 ring-inset ring-border",
                )}
              >
                {format(labelDate, "MMM")}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
