"use client";
import * as React from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useReconciledWrite, WriteCancelled } from "@/components/shared/reconciled-confirm";
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
import { apiFetch, errorMessage } from "@/lib/api-client";
import useSWR from "swr";
import type { ApiEnvelope } from "@/lib/api-client";
import type { CreditCardCycleRowDTO } from "@/types";
import { useAccounts } from "@/hooks/useAccounts";
import { AccountSelect } from "@/components/accounts/account-select";

interface CardOption {
  id: string;
  name: string;
  issuer: string;
  last4: string | null;
  balance: number;
}

const NO_CARDS: CardOption[] = [];

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
  const [cardId, setCardId] = React.useState<string>("");
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = React.useState("");
  const [accountId, setAccountId] = React.useState<string | null>(null);
  // Once the user picks "Paid from" themselves, stop defaulting it.
  const [accountTouched, setAccountTouched] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const guarded = useReconciledWrite();

  // Active cards only — archived cards don't receive new payments through
  // this shortcut (you can still edit older transactions tagged to them).
  const cardsReq = useSWR<ApiEnvelope<CardOption[]>>(open ? "/api/credit-cards" : null);
  const cards = cardsReq.data?.data ?? NO_CARDS;
  const cardsLoading = cardsReq.isLoading;
  const accounts = useAccounts().all;

  // Reset on open, then (below, same commit) pick the preset or first card.
  // Order matters: the pick's functional update runs after this reset.
  React.useEffect(() => {
    if (!open) return;
    setCardId(presetCardId ?? "");
    setAmount("");
    setDate(format(new Date(), "yyyy-MM-dd"));
    setNotes("");
    setAccountId(null);
    setAccountTouched(false);
  }, [open, presetCardId]);

  // Pick the preset (or first) card once the list is available.
  React.useEffect(() => {
    if (!open) return;
    setCardId((current) => current || presetCardId || cards[0]?.id || "");
  }, [open, presetCardId, cards]);

  const selected = cards.find((c) => c.id === cardId);

  // Default "Paid from" to whichever active account paid this card last.
  // Same SWR key as the card page's cycle history, so usually cached.
  const historyReq = useSWR<ApiEnvelope<CreditCardCycleRowDTO[]>>(
    open && cardId ? `/api/credit-cards/${cardId}/cycles` : null,
  );
  const lastPaidFrom = React.useMemo(() => {
    const payments = (historyReq.data?.data ?? []).flatMap((c) => c.payments);
    const last = payments.reduce<(typeof payments)[number] | null>(
      (best, p) => (!best || p.date > best.date ? p : best),
      null,
    );
    return last?.accountId && accounts.some((a) => a.id === last.accountId && a.isActive) ? last.accountId : null;
  }, [historyReq.data, accounts]);
  React.useEffect(() => {
    if (open && !accountTouched) setAccountId(lastPaidFrom);
  }, [open, accountTouched, lastPaidFrom]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!cardId) return;
    setPending(true);
    try {
      const body = JSON.stringify({ amount: Number(amount), date, notes: notes.trim() || null, accountId });
      await guarded((headers) => apiFetch(`/api/credit-cards/${cardId}/pay`, { method: "POST", body, headers }));
    } catch (err) {
      if (err instanceof WriteCancelled) return;
      toast.error(errorMessage(err, "Failed to record payment"));
      return;
    } finally {
      setPending(false);
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
              <Label htmlFor="pay-card">Card</Label>
              <Select value={cardId} onValueChange={setCardId}>
                <SelectTrigger id="pay-card">
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

            {accounts.length > 0 && (
              <div className="grid gap-1.5">
                <Label htmlFor="pay-account">Paid from</Label>
                <AccountSelect
                  id="pay-account"
                  accounts={accounts}
                  value={accountId}
                  onChange={(v) => {
                    setAccountTouched(true);
                    setAccountId(v);
                  }}
                  noneLabel="— Not tracked —"
                />
              </div>
            )}

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
