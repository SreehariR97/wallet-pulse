"use client";
import { cn, formatUtcDay } from "@/lib/utils";

export type CyclePeriod = "current" | "previous";

const OPTIONS: Array<{ value: CyclePeriod; label: string }> = [
  { value: "current", label: "Current" },
  { value: "previous", label: "Previous" },
];

/**
 * Current/previous statement toggle. A radio group, not Radix Tabs: there
 * are no tab panels to point aria-controls at (axe flagged the dangling
 * reference), and CLAUDE.md asks toggle groups to use radiogroup/radio.
 * Styled to match the tabs it replaces.
 */
export function CyclePicker({
  value,
  onChange,
  range,
}: {
  value: CyclePeriod;
  onChange: (v: CyclePeriod) => void;
  /** Active cycle's window — rendered as a caption next to the toggle. */
  range?: { start: Date; end: Date };
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div
        role="radiogroup"
        aria-label="Statement cycle"
        className="inline-flex h-10 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground"
      >
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-[540] tracking-[-0.005em] ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              value === o.value && "bg-background text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {range && (
        <span className="text-[12px] font-[460] leading-[1.2] text-muted-foreground tabular-nums">
          {formatUtcDay(range.start)} – {formatUtcDay(range.end, true)}
        </span>
      )}
    </div>
  );
}
