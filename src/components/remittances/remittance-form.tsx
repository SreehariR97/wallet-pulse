"use client";
import * as React from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CURRENCIES, formatFxRate } from "@/lib/utils";

export interface RemittanceFormInitial {
  id: string;
  amount: number;
  date: string;
  description: string;
  notes: string | null;
  paymentMethod: string;
  fromCurrency: string;
  toCurrency: string;
  fxRate: number;
  fee: number;
  service: string;
  recipientNote: string | null;
  isRecurring: boolean;
  recurringFrequency: string | null;
}

export function RemittanceForm({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: RemittanceFormInitial | null;
  onSaved: () => void;
}) {
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(format(new Date(), "yyyy-MM-dd"));
  const [description, setDescription] = React.useState("");
  const [fromCurrency, setFromCurrency] = React.useState("USD");
  const [toCurrency, setToCurrency] = React.useState("INR");
  const [fxRate, setFxRate] = React.useState("");
  const [fee, setFee] = React.useState("");
  const [service, setService] = React.useState<string>("wise");
  const [recipientNote, setRecipientNote] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [isRecurring, setIsRecurring] = React.useState(false);
  const [recurringFrequency, setRecurringFrequency] = React.useState<string>("monthly");
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setAmount(initial ? String(initial.amount) : "");
    setDate(initial ? initial.date.slice(0, 10) : format(new Date(), "yyyy-MM-dd"));
    setDescription(initial?.description ?? "");
    setFromCurrency(initial?.fromCurrency ?? "USD");
    setToCurrency(initial?.toCurrency ?? "INR");
    setFxRate(initial ? String(initial.fxRate) : "");
    setFee(initial ? String(initial.fee) : "");
    setService(initial?.service ?? "wise");
    setRecipientNote(initial?.recipientNote ?? "");
    setNotes(initial?.notes ?? "");
    setIsRecurring(initial?.isRecurring ?? false);
    setRecurringFrequency(initial?.recurringFrequency ?? "monthly");
  }, [open, initial]);

  const amountNum = Number(amount);
  const feeNum = Number(fee);
  const rateNum = Number(fxRate);
  const delivered =
    Number.isFinite(amountNum) && Number.isFinite(feeNum) && Number.isFinite(rateNum)
      ? Math.max(0, (amountNum - feeNum) * rateNum)
      : 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const payload = {
      amount: amountNum,
      date,
      description,
      notes: notes.trim() || null,
      fromCurrency,
      toCurrency,
      fxRate: rateNum,
      fee: feeNum,
      service,
      recipientNote: recipientNote.trim() || null,
      isRecurring,
      recurringFrequency: isRecurring ? recurringFrequency : null,
      paymentMethod: initial?.paymentMethod ?? "bank_transfer",
    };
    const res = await fetch(initial ? `/api/remittances/${initial.id}` : "/api/remittances", {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setPending(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return toast.error(j.error ?? "Failed to save remittance");
    }
    toast.success(initial ? "Remittance updated" : "Remittance recorded");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[560px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit remittance" : "New remittance"}</DialogTitle>
          <DialogDescription>
            Record an international transfer. FX rate and fee are stored with
            full precision so you can audit service cost over time.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="rm-desc">Description</Label>
            <Input
              id="rm-desc"
              required
              maxLength={200}
              placeholder="April transfer home"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-[1fr_140px] gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="rm-amount">Amount sent</Label>
              <div className="relative">
                <Input
                  id="rm-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="500"
                  className="pr-16"
                />
                <Select value={fromCurrency} onValueChange={setFromCurrency}>
                  <SelectTrigger className="absolute inset-y-0 right-0 h-full w-16 rounded-l-none border-l border-border/60 bg-transparent text-[12px] font-[540] shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rm-date">Date</Label>
              <Input
                id="rm-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="rm-service">Service</Label>
              <Select value={service} onValueChange={setService}>
                <SelectTrigger id="rm-service">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wise">Wise</SelectItem>
                  <SelectItem value="remitly">Remitly</SelectItem>
                  <SelectItem value="western_union">Western Union</SelectItem>
                  <SelectItem value="bank_wire">Bank wire</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rm-rate">FX rate</Label>
              <Input
                id="rm-rate"
                type="number"
                step="0.000001"
                min="0"
                required
                placeholder="83.123456"
                value={fxRate}
                onChange={(e) => setFxRate(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rm-fee">Fee</Label>
              <Input
                id="rm-fee"
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="4.99"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="rm-to">Delivered in</Label>
            <div className="flex items-center gap-3">
              <Select value={toCurrency} onValueChange={setToCurrency}>
                <SelectTrigger id="rm-to" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-[13px] font-[460] text-muted-foreground tabular-nums">
                ≈{" "}
                <span className="font-[540] text-foreground">
                  {delivered.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>{" "}
                {toCurrency}
                {rateNum > 0 && (
                  <span className="ml-2 text-[11px]">
                    at {formatFxRate(rateNum)}
                  </span>
                )}
              </span>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="rm-recipient">Recipient (optional)</Label>
            <Input
              id="rm-recipient"
              maxLength={200}
              placeholder="Mom · Dad · Self - ICICI"
              value={recipientNote}
              onChange={(e) => setRecipientNote(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="rm-notes">Notes (optional)</Label>
            <Textarea
              id="rm-notes"
              rows={2}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
            <div>
              <Label htmlFor="rm-rec" className="cursor-pointer text-[13px] font-[540]">
                Recurring
              </Label>
              <p className="text-[11px] font-[460] text-muted-foreground">Monthly transfers home, etc.</p>
            </div>
            <div className="flex items-center gap-3">
              {isRecurring && (
                <Select value={recurringFrequency} onValueChange={setRecurringFrequency}>
                  <SelectTrigger className="h-8 w-32 text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Switch id="rm-rec" checked={isRecurring} onCheckedChange={setIsRecurring} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending || !description || !amount || !fxRate || !fee}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {initial ? "Save" : "Record transfer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
