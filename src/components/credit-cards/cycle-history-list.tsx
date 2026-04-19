"use client";
import * as React from "react";
import { cn, formatCurrency, formatCivilDate } from "@/lib/utils";
import type { CreditCardCycleRowDTO } from "@/types";

type Status =
  | "projected"
  | "paid-in-full"
  | "past-due"
  | "due-today"
  | "minimum-paid"
  | "issued";

const EPSILON = 0.005;

// Precedence (highest → lowest): projected wins trivially; for real cycles,
// full payoff trumps lateness (a paid-in-full statement is NOT past-due even
// if logged after the due date), past-due trumps due-today, due-today trumps
// minimum-paid, issued is the fallback. statementBalance may be 0 (rare but
// legal after a carryover), in which case we treat it as paid-in-full.
function statusForCycle(c: CreditCardCycleRowDTO, today: string): Status {
  if (c.isProjected) return "projected";
  if (c.statementBalance !== null) {
    const paid = c.amountPaid;
    if (paid + EPSILON >= c.statementBalance) return "paid-in-full";
    if (today > c.paymentDueDate) return "past-due";
    if (today === c.paymentDueDate) return "due-today";
    if (c.minimumPayment !== null && paid + EPSILON >= c.minimumPayment) {
      return "minimum-paid";
    }
  }
  return "issued";
}

function StatusBadge({ status }: { status: Status }) {
  const tone: Record<Status, string> = {
    projected: "bg-muted text-muted-foreground",
    issued: "bg-secondary text-foreground",
    "due-today": "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    "past-due": "bg-destructive/15 text-destructive",
    "paid-in-full": "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    "minimum-paid": "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  };
  const label: Record<Status, string> = {
    projected: "Projected",
    issued: "Issued",
    "due-today": "Due today",
    "past-due": "Past due",
    "paid-in-full": "Paid in full",
    "minimum-paid": "Min paid",
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
          // Remaining = statementBalance - amountPaid (clamped to 0). Only
          // meaningful for issued cycles; projected has no statement balance.
          const remaining =
            c.statementBalance !== null
              ? Math.max(0, c.statementBalance - c.amountPaid)
              : null;
          const secondary =
            c.isProjected
              ? c.minimumPayment !== null
                ? `Min ${formatCurrency(c.minimumPayment, currency)}`
                : "Tap to mark issued"
              : remaining !== null && c.amountPaid > 0
                ? `Paid ${formatCurrency(c.amountPaid, currency)} · ${formatCurrency(remaining, currency)} left`
                : c.minimumPayment !== null
                  ? `Min ${formatCurrency(c.minimumPayment, currency)}`
                  : null;
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
                {secondary && (
                  <span className="text-[11px] font-[460] text-muted-foreground">
                    {secondary}
                  </span>
                )}
              </div>
            </Row>
          );
        })}
      </div>
    </div>
  );
}
