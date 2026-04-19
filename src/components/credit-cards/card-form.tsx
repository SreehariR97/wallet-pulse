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

export interface CardFormInitial {
  id: string;
  name: string;
  issuer: string;
  last4: string | null;
  creditLimit: number;
  // Phase 2 keeps the integer-based DTO so the GET route + card-tile UI can
  // still read these. Phase 5 drops them once all callers are moved over to
  // cycle rows.
  statementDay: number;
  paymentDueDay: number;
  minimumPaymentPercent: number;
}

// Seed date pickers for existing cards by re-deriving a plausible date from
// the legacy day-of-month integer. This is a one-way derivation — the picker
// loses the actual last-saved date across edits until Phase 3 surfaces cycle
// history in the DTO. Known limitation, acceptable for Phase 2.
function cappedDay(year: number, monthIndex: number, day: number): number {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(day, lastDay);
}
function formatLocal(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function mostRecentOccurrence(day: number): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = now.getDate();
  const capped = cappedDay(y, m, day);
  if (today >= capped) return formatLocal(y, m, capped);
  const prev = new Date(y, m - 1, 1);
  const py = prev.getFullYear();
  const pm = prev.getMonth();
  return formatLocal(py, pm, cappedDay(py, pm, day));
}
function nextOccurrence(day: number): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = now.getDate();
  const capped = cappedDay(y, m, day);
  if (today <= capped) return formatLocal(y, m, capped);
  const next = new Date(y, m + 1, 1);
  const ny = next.getFullYear();
  const nm = next.getMonth();
  return formatLocal(ny, nm, cappedDay(ny, nm, day));
}

export function CardForm({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: CardFormInitial | null;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState("");
  const [issuer, setIssuer] = React.useState("");
  const [last4, setLast4] = React.useState("");
  const [creditLimit, setCreditLimit] = React.useState("");
  const [lastStatementCloseDate, setLastStatementCloseDate] = React.useState("");
  const [paymentDueDate, setPaymentDueDate] = React.useState("");
  const [statementBalance, setStatementBalance] = React.useState("");
  const [minimumPayment, setMinimumPayment] = React.useState("");
  const [minPct, setMinPct] = React.useState("2");
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setIssuer(initial?.issuer ?? "");
    setLast4(initial?.last4 ?? "");
    setCreditLimit(initial ? String(initial.creditLimit) : "");
    setLastStatementCloseDate(
      initial ? mostRecentOccurrence(initial.statementDay) : "",
    );
    setPaymentDueDate(initial ? nextOccurrence(initial.paymentDueDay) : "");
    // Balance + min never round-trip from the GET DTO in Phase 2 — always
    // blank on edit. Phase 3 surfaces the saved cycle values.
    setStatementBalance("");
    setMinimumPayment("");
    setMinPct(String(initial?.minimumPaymentPercent ?? 2));
  }, [open, initial]);

  const gracePeriodDays = React.useMemo(() => {
    if (!lastStatementCloseDate || !paymentDueDate) return null;
    if (paymentDueDate <= lastStatementCloseDate) return null;
    const a = new Date(lastStatementCloseDate + "T00:00:00Z").getTime();
    const b = new Date(paymentDueDate + "T00:00:00Z").getTime();
    return Math.round((b - a) / 86400000);
  }, [lastStatementCloseDate, paymentDueDate]);

  const graceWarning = React.useMemo(() => {
    if (gracePeriodDays == null) return null;
    if (gracePeriodDays < 21)
      return `Unusually short grace period (${gracePeriodDays} days). Most cards give at least 21 — double-check the dates.`;
    if (gracePeriodDays > 35)
      return `Unusually long grace period (${gracePeriodDays} days). Most cards give 21–28 — double-check the dates.`;
    return null;
  }, [gracePeriodDays]);

  const datesValid =
    !!lastStatementCloseDate &&
    !!paymentDueDate &&
    paymentDueDate > lastStatementCloseDate;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const payload: Record<string, unknown> = {
      name,
      issuer,
      last4: last4.trim() ? last4.trim() : null,
      creditLimit: Number(creditLimit),
      minimumPaymentPercent: Number(minPct),
      lastStatementCloseDate,
      paymentDueDate,
    };
    if (statementBalance.trim()) payload.statementBalance = Number(statementBalance);
    if (minimumPayment.trim()) payload.minimumPayment = Number(minimumPayment);

    const res = await fetch(initial ? `/api/credit-cards/${initial.id}` : "/api/credit-cards", {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setPending(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return toast.error(j.error ?? "Failed to save card");
    }
    toast.success(initial ? "Card updated" : "Card added");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit card" : "New credit card"}</DialogTitle>
          <DialogDescription>
            Track balance, utilization, and statement cycles. Transactions tagged to
            this card are reflected in the computed balance in real time.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="cc-name">Name</Label>
            <Input
              id="cc-name"
              required
              maxLength={80}
              placeholder="Chase Sapphire Preferred"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cc-issuer">Issuer</Label>
              <Input
                id="cc-issuer"
                required
                maxLength={80}
                placeholder="Chase"
                value={issuer}
                onChange={(e) => setIssuer(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cc-last4">Last 4 (optional)</Label>
              <Input
                id="cc-last4"
                maxLength={4}
                inputMode="numeric"
                pattern="\d{4}"
                placeholder="1234"
                value={last4}
                onChange={(e) => setLast4(e.target.value.replace(/[^\d]/g, ""))}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cc-limit">Credit limit</Label>
            <Input
              id="cc-limit"
              type="number"
              step="0.01"
              min="1"
              required
              placeholder="10000"
              value={creditLimit}
              onChange={(e) => setCreditLimit(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cc-close">Last statement closing date</Label>
              <Input
                id="cc-close"
                type="date"
                required
                value={lastStatementCloseDate}
                onChange={(e) => setLastStatementCloseDate(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cc-due-date">Payment due date</Label>
              <Input
                id="cc-due-date"
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
              <Label htmlFor="cc-stmt-bal">Statement balance (optional)</Label>
              <Input
                id="cc-stmt-bal"
                type="number"
                step="0.01"
                min="0"
                placeholder="$"
                value={statementBalance}
                onChange={(e) => setStatementBalance(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cc-min-pay">Minimum payment (optional)</Label>
              <Input
                id="cc-min-pay"
                type="number"
                step="0.01"
                min="0"
                placeholder="$"
                value={minimumPayment}
                onChange={(e) => setMinimumPayment(e.target.value)}
              />
            </div>
          </div>
          <p className="text-[11px] leading-[1.4] text-muted-foreground">
            Optional — fill both in if you want to track what this statement owes.
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor="cc-min-pct">Minimum payment %</Label>
            <Input
              id="cc-min-pct"
              type="number"
              min="0"
              max="100"
              step="0.1"
              required
              value={minPct}
              onChange={(e) => setMinPct(e.target.value)}
            />
            <p className="text-[11px] leading-[1.4] text-muted-foreground">
              Fallback if the minimum payment above is left blank.
            </p>
          </div>
          <p className="text-[11px] leading-[1.4] text-muted-foreground">
            These dates come from your most recent statement. After the next statement
            arrives, update them from the card detail page.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending || !name || !issuer || !creditLimit || !datesValid}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {initial ? "Save" : "Add card"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
