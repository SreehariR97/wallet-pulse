/**
 * Small adapters for Recharts 3 behaviour changes. Type-only imports, so
 * this adds nothing to the bundle.
 *
 * Also: charts wrapped in aria-hidden (with an sr-only table alongside)
 * pass accessibilityLayer={false}. Recharts 3 turns it on by default,
 * making the SVG focusable, and a focusable element inside aria-hidden is a
 * keyboard stop screen readers can't announce (axe: aria-hidden-focus).
 */
import type { LegendPayload, TooltipItemSorter, TooltipValueType } from "recharts";

/**
 * Tooltip formatters now receive `number | string | readonly (number | string)[]`
 * (or undefined). Every chart here plots single numeric series.
 */
export function tooltipNumber(v: TooltipValueType | undefined): number {
  const x = Array.isArray(v) ? v[0] : v;
  return Number(x ?? 0);
}

function rank(dataKeys: readonly string[], key: unknown): number {
  const i = dataKeys.indexOf(String(key));
  return i === -1 ? dataKeys.length : i;
}

/**
 * Tooltip rows and legend items are now sorted alphabetically by default,
 * which put "Expenses" before "Income". These keep the drawn series order.
 */
export const INCOME_FIRST_TOOLTIP: TooltipItemSorter = (item) => rank(["income", "expense"], item.dataKey);
export const INCOME_FIRST_LEGEND = (item: LegendPayload) => rank(["income", "expense"], item.dataKey);
