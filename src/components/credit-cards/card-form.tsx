"use client";
import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getStatementCycle, getNextDueDate } from "@/lib/credit-cards";
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
  statementDay: number;
  paymentDueDay: number;
  minimumPaymentPercent: number;
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
  const [statementDay, setStatementDay] = React.useState("1");
  const [paymentDueDay, setPaymentDueDay] = React.useState("28");
  const [minPct, setMinPct] = React.useState("2");
  const [pending, setPending] = React.useState(false);

  const now = React.useMemo(() => new Date(), []);

  const statementPreview = React.useMemo(() => {
    const day = Number(statementDay);
    if (!Number.isFinite(day) || day < 1 || day > 31) return null;
    // Offset 0 = the cycle currently accruing. Its `end` is the next statement
    // close date — that's what users want to see ("when does this cycle close?").
    const cycle = getStatementCycle(now, day, 0);
    return {
      close: format(cycle.end, "MMM d"),
      start: format(cycle.start, "MMM d"),
    };
  }, [statementDay, now]);

  const duePreview = React.useMemo(() => {
    const day = Number(paymentDueDay);
    if (!Number.isFinite(day) || day < 1 || day > 31) return null;
    return format(getNextDueDate(now, day), "MMM d");
  }, [paymentDueDay, now]);

  React.useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setIssuer(initial?.issuer ?? "");
    setLast4(initial?.last4 ?? "");
    setCreditLimit(initial ? String(initial.creditLimit) : "");
    setStatementDay(String(initial?.statementDay ?? 1));
    setPaymentDueDay(String(initial?.paymentDueDay ?? 28));
    setMinPct(String(initial?.minimumPaymentPercent ?? 2));
  }, [open, initial]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const payload = {
      name,
      issuer,
      last4: last4.trim() ? last4.trim() : null,
      creditLimit: Number(creditLimit),
      statementDay: Number(statementDay),
      paymentDueDay: Number(paymentDueDay),
      minimumPaymentPercent: Number(minPct),
    };
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
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cc-stmt">Statement day</Label>
              <Input
                id="cc-stmt"
                type="number"
                min="1"
                max="31"
                required
                value={statementDay}
                onChange={(e) => setStatementDay(e.target.value)}
              />
              <p className="text-[11px] leading-[1.4] text-muted-foreground tabular-nums">
                {statementPreview ? (
                  <>Cycle closes <span className="font-[540] text-foreground">{statementPreview.close}</span></>
                ) : (
                  "Day of month (1–31)"
                )}
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cc-due">Due day</Label>
              <Input
                id="cc-due"
                type="number"
                min="1"
                max="31"
                required
                value={paymentDueDay}
                onChange={(e) => setPaymentDueDay(e.target.value)}
              />
              <p className="text-[11px] leading-[1.4] text-muted-foreground tabular-nums">
                {duePreview ? (
                  <>Next due <span className="font-[540] text-foreground">{duePreview}</span></>
                ) : (
                  "Day of month (1–31)"
                )}
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cc-min">Min %</Label>
              <Input
                id="cc-min"
                type="number"
                min="0"
                max="100"
                step="0.1"
                required
                value={minPct}
                onChange={(e) => setMinPct(e.target.value)}
              />
              <p className="text-[11px] leading-[1.4] text-muted-foreground">Of balance</p>
            </div>
          </div>
          <p className="text-[11px] leading-[1.4] text-muted-foreground">
            Days 29–31 automatically cap to the last day of short months (e.g. Feb 28).
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending || !name || !issuer || !creditLimit}
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
