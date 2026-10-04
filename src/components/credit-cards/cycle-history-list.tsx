"use client";
import * as React from "react";
import { cn, formatCurrency, formatCivilDate } from "@/lib/utils";
import type { CreditCardCycleRowDTO, CreditCardCyclePaymentDTO } from "@/types";

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
  // Light text one or two shades darker than the tint: at 10px, -600 on its
  // own 15% tint is ~3:1 (axe needs 4.5). amber-700 still falls short.
  const tone: Record<Status, string> = {
    projected: "bg-muted text-muted-foreground",
    issued: "bg-secondary text-foreground",
    "due-today": "bg-amber-500/15 text-amber-800 dark:text-amber-400",
    "past-due": "bg-destructive/15 text-destructive",
    "paid-in-full": "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    "minimum-paid": "bg-sky-500/15 text-sky-700 dark:text-sky-400",
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

const UNTRACKED = "an untracked account";

/** "from Checking" · "from Checking and Savings" · "from 3 accounts" */
function paidFrom(payments: CreditCardCyclePaymentDTO[]): string | null {
  if (payments.length === 0) return null;
  const names = Array.from(new Set(payments.map((p) => p.accountName ?? UNTRACKED)));
  if (names.length === 1) return `from ${names[0]}`;
  if (names.length === 2) return `from ${names[0]} and ${names[1]}`;
  return `from ${names.length} accounts`;
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
          const from = paidFrom(c.payments);
          return (
            <div key={c.id} className={cn(i > 0 && "border-t border-border")}>
              <Row
                type={interactive ? "button" : undefined}
                onClick={interactive ? () => onMarkIssued(c) : undefined}
                className={cn(
                  "flex w-full items-center justify-between gap-4 px-4 py-3 text-left",
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
                  {from && (
                    <span className="max-w-[16rem] truncate text-[11px] font-[460] text-muted-foreground">{from}</span>
                  )}
                </div>
              </Row>
              {c.payments.length > 0 && (
                <details className="px-4 pb-3 -mt-1">
                  <summary className="w-fit cursor-pointer rounded text-[11px] font-[540] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
                    {c.payments.length === 1 ? "1 payment" : `${c.payments.length} payments`}
                  </summary>
                  <ul className="mt-1.5 space-y-1 text-[12px] tabular-nums">
                    {c.payments.map((p) => (
                      <li key={p.id} className="flex justify-between gap-3">
                        <span className="min-w-0 truncate">
                          {formatCivilDate(p.date, "MMM d")} · {p.accountName ?? <span className="text-muted-foreground">Untracked account</span>}
                        </span>
                        <span className="shrink-0 font-[540]">{formatCurrency(p.amount, currency)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
