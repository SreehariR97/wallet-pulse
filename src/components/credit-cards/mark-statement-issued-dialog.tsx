"use client";
import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

export interface MarkStatementIssuedInitial {
  cardId: string;
  cycleId: string;
  /** YYYY-MM-DD — defaults for the pickers, taken from the current
   *  projected cycle's dates so the usual case is "just confirm". */
  cycleCloseDate: string;
  paymentDueDate: string;
}

export function MarkStatementIssuedDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: MarkStatementIssuedInitial | null;
  onSaved: () => void;
}) {
  const [cycleCloseDate, setCycleCloseDate] = React.useState("");
  const [paymentDueDate, setPaymentDueDate] = React.useState("");
  const [statementBalance, setStatementBalance] = React.useState("");
  const [minimumPayment, setMinimumPayment] = React.useState("");
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setCycleCloseDate(initial?.cycleCloseDate ?? "");
    setPaymentDueDate(initial?.paymentDueDate ?? "");
    setStatementBalance("");
    setMinimumPayment("");
  }, [open, initial]);

  const gracePeriodDays = React.useMemo(() => {
    if (!cycleCloseDate || !paymentDueDate) return null;
    if (paymentDueDate <= cycleCloseDate) return null;
    const a = new Date(cycleCloseDate + "T00:00:00Z").getTime();
    const b = new Date(paymentDueDate + "T00:00:00Z").getTime();
    return Math.round((b - a) / 86400000);
  }, [cycleCloseDate, paymentDueDate]);

  const graceWarning = React.useMemo(() => {
    if (gracePeriodDays == null) return null;
    if (gracePeriodDays < 21)
      return `Unusually short grace period (${gracePeriodDays} days). Most cards give at least 21 — double-check the dates.`;
    if (gracePeriodDays > 35)
      return `Unusually long grace period (${gracePeriodDays} days). Most cards give 21–28 — double-check the dates.`;
    return null;
  }, [gracePeriodDays]);

  const datesValid =
    !!cycleCloseDate && !!paymentDueDate && paymentDueDate > cycleCloseDate;
  const canSubmit =
    datesValid && !!statementBalance.trim() && !!minimumPayment.trim();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!initial) return;
    setPending(true);
    const res = await fetch(
      `/api/credit-cards/${initial.cardId}/cycles/${initial.cycleId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycleCloseDate,
          paymentDueDate,
          statementBalance: Number(statementBalance),
          minimumPayment: Number(minimumPayment),
        }),
      },
    );
    setPending(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return toast.error(j.error ?? "Failed to mark statement issued");
    }
    toast.success("Statement marked as issued");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mark statement issued</DialogTitle>
          <DialogDescription>
            Lock the current projected cycle into a real statement. A new projected
            cycle for next month is created automatically.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="msi-close">Statement closing date</Label>
              <Input
                id="msi-close"
                type="date"
                required
                value={cycleCloseDate}
                onChange={(e) => setCycleCloseDate(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="msi-due">Payment due date</Label>
              <Input
                id="msi-due"
                type="date"
                required
                value={paymentDueDate}
                onChange={(e) => setPaymentDueDate(e.target.value)}
              />
              <p className="text-[11px] leading-[1.4] text-muted-foreground tabular-nums">
                {gracePeriodDays != null
                  ? `${gracePeriodDays}-day grace period`
                  : "Pick both dates"}
              </p>
            </div>
          </div>
          {graceWarning && (
            <p className="text-[11px] leading-[1.4] text-amber-500">{graceWarning}</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="msi-bal">Statement balance</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  id="msi-bal"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={statementBalance}
                  onChange={(e) => setStatementBalance(e.target.value)}
                  className="pl-7"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="msi-min">Minimum payment</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  id="msi-min"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={minimumPayment}
                  onChange={(e) => setMinimumPayment(e.target.value)}
                  className="pl-7"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !canSubmit}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Mark issued
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
