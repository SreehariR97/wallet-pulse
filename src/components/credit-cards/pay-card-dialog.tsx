"use client";
import * as React from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { formatCurrency } from "@/lib/utils";

interface CardOption {
  id: string;
  name: string;
  issuer: string;
  last4: string | null;
  balance: number;
}

export function PayCardDialog({
  open,
  onOpenChange,
  currency,
  presetCardId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currency: string;
  presetCardId?: string;
  onSaved?: () => void;
}) {
  const [cards, setCards] = React.useState<CardOption[]>([]);
  const [cardsLoading, setCardsLoading] = React.useState(false);
  const [cardId, setCardId] = React.useState<string>("");
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = React.useState("");
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setCardsLoading(true);
    // Active cards only — archived cards don't receive new payments through
    // this shortcut (you can still edit older transactions tagged to them).
    fetch("/api/credit-cards")
      .then((r) => r.json())
      .then((j) => {
        const list: CardOption[] = j.data ?? [];
        setCards(list);
        setCardId(presetCardId ?? list[0]?.id ?? "");
        setCardsLoading(false);
      })
      .catch(() => setCardsLoading(false));
    setAmount("");
    setDate(format(new Date(), "yyyy-MM-dd"));
    setNotes("");
  }, [open, presetCardId]);

  const selected = cards.find((c) => c.id === cardId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!cardId) return;
    setPending(true);
    const res = await fetch(`/api/credit-cards/${cardId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Number(amount),
        date,
        notes: notes.trim() || null,
      }),
    });
    setPending(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return toast.error(j.error ?? "Failed to record payment");
    }
    toast.success("Payment recorded");
    onOpenChange(false);
    onSaved?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pay card</DialogTitle>
          <DialogDescription>
            Record a payment against a credit card. Creates a transfer
            transaction that reduces the card&apos;s computed balance.
          </DialogDescription>
        </DialogHeader>

        {cardsLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Loading your cards…
          </div>
        ) : cards.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            You don&apos;t have any active cards yet. Add one on the Cards page first.
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-1.5">
              <Label>Card</Label>
              <Select value={cardId} onValueChange={setCardId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a card" />
                </SelectTrigger>
                <SelectContent>
                  {cards.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.last4 ? ` · ···· ${c.last4}` : ""}
                      {" — "}
                      {formatCurrency(Math.max(0, c.balance), currency)} owed
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selected && selected.balance > 0 && (
                <p className="text-[12px] font-[460] text-muted-foreground">
                  Current balance: {formatCurrency(selected.balance, currency)}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pay-amount">Amount</Label>
                <Input
                  id="pay-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="99999999999.99"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={selected ? String(Math.max(0, selected.balance).toFixed(2)) : "0.00"}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pay-date">Date</Label>
                <Input
                  id="pay-date"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="pay-notes">Notes (optional)</Label>
              <Textarea
                id="pay-notes"
                rows={2}
                maxLength={2000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Autopay from checking, etc."
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !cardId || !amount}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Record payment
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
