"use client";
import * as React from "react";
import { cn, formatCurrency, formatCivilDate } from "@/lib/utils";
import type { CreditCardCycleRowDTO } from "@/types";

type Status = "projected" | "issued" | "due-today" | "past-due";

function statusForCycle(c: CreditCardCycleRowDTO, todayCivil: string): Status {
  if (c.isProjected) return "projected";
  // Phase 4 will populate amountPaid; until then, the past-due branch never
  // fires because amountPaid is always 0 and statementBalance may be null.
  if (
    todayCivil > c.paymentDueDate &&
    c.statementBalance !== null &&
    c.amountPaid < c.statementBalance
  ) {
    return "past-due";
  }
  if (todayCivil === c.paymentDueDate) return "due-today";
  return "issued";
}

function StatusBadge({ status }: { status: Status }) {
  const tone: Record<Status, string> = {
    projected: "bg-muted text-muted-foreground",
    issued: "bg-secondary text-foreground",
    "due-today": "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    "past-due": "bg-destructive/15 text-destructive",
  };
  const label: Record<Status, string> = {
    projected: "Projected",
    issued: "Issued",
    "due-today": "Due today",
    "past-due": "Past due",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-[600] uppercase tracking-[0.08em]",
        tone[status],
      )}
    >
      {label[status]}
    </span>
  );
}

export function CycleHistoryList({
  cycles,
  currency,
  onMarkIssued,
}: {
  cycles: CreditCardCycleRowDTO[];
  currency: string;
  onMarkIssued: (cycle: CreditCardCycleRowDTO) => void;
}) {
  const todayCivil = React.useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  if (cycles.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="font-heading text-[17px] font-[540] tracking-[-0.015em]">
        Cycle history
      </h2>
      <div className="overflow-hidden rounded-lg border border-border">
        {cycles.map((c, i) => {
          const status = statusForCycle(c, todayCivil);
          const interactive = c.isProjected;
          const Row: React.ElementType = interactive ? "button" : "div";
          return (
            <Row
              key={c.id}
              type={interactive ? "button" : undefined}
              onClick={interactive ? () => onMarkIssued(c) : undefined}
              className={cn(
                "flex w-full items-center justify-between gap-4 px-4 py-3 text-left",
                i > 0 && "border-t border-border",
                interactive && "hover:bg-muted/60 transition-colors",
              )}
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-[540] tabular-nums">
                    {formatCivilDate(c.cycleCloseDate, "MMM d, yyyy")}
                  </span>
                  <StatusBadge status={status} />
                </div>
                <span className="text-[12px] font-[460] text-muted-foreground tabular-nums">
                  Due {formatCivilDate(c.paymentDueDate, "MMM d")}
                </span>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5 tabular-nums">
                <span className="text-[13px] font-[540]">
                  {c.statementBalance !== null
                    ? formatCurrency(c.statementBalance, currency)
                    : "—"}
                </span>
                <span className="text-[11px] font-[460] text-muted-foreground">
                  Min{" "}
                  {c.minimumPayment !== null
                    ? formatCurrency(c.minimumPayment, currency)
                    : "—"}
                </span>
              </div>
            </Row>
          );
        })}
      </div>
    </div>
  );
}
