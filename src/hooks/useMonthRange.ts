"use client";
import * as React from "react";
import { startOfMonth, endOfMonth, format, addMonths, subMonths } from "date-fns";

export function useMonthRange(initial: Date = new Date()) {
  const [ref, setRef] = React.useState(initial);

  const start = startOfMonth(ref);
  const end = endOfMonth(ref);
  const from = format(start, "yyyy-MM-dd");
  const to = format(end, "yyyy-MM-dd");
  const label = format(start, "MMMM yyyy");

  return {
    ref,
    from,
    to,
    label,
    prev: () => setRef((d) => subMonths(d, 1)),
    next: () => setRef((d) => addMonths(d, 1)),
    setRef,
  };
}
