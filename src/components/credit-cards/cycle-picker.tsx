"use client";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatUtcDay } from "@/lib/utils";

export type CyclePeriod = "current" | "previous";

/**
 * Thin composition over shadcn Tabs. Lives in the feature folder (not
 * ui/) because the current/previous pairing + cycle-window caption is
 * specific to credit-card cycles, not a general-purpose primitive.
 */
export function CyclePicker({
  value,
  onChange,
  range,
}: {
  value: CyclePeriod;
  onChange: (v: CyclePeriod) => void;
  /** Active cycle's window — rendered as a caption next to the tabs. */
  range?: { start: Date; end: Date };
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Tabs value={value} onValueChange={(v) => onChange(v as CyclePeriod)}>
        <TabsList>
          <TabsTrigger value="current">Current</TabsTrigger>
          <TabsTrigger value="previous">Previous</TabsTrigger>
        </TabsList>
      </Tabs>
      {range && (
        <span className="text-[12px] font-[460] leading-[1.2] text-muted-foreground tabular-nums">
          {formatUtcDay(range.start)} – {formatUtcDay(range.end, true)}
        </span>
      )}
    </div>
  );
}
