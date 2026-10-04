"use client";
import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useReconciledWrite, WriteCancelled } from "@/components/shared/reconciled-confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch, errorMessage, jsonBody } from "@/lib/api-client";
import type { AccountListItemDTO, AccountType } from "@/types";

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: "Checking",
  savings: "Savings",
  cash: "Cash",
  wallet: "Digital wallet",
  other: "Other",
};

export function AccountForm({
  open,
  onOpenChange,
  initial,
  isFirst,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: AccountListItemDTO | null;
  /** No accounts exist yet: offer to adopt existing transactions by default. */
  isFirst: boolean;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<AccountType>("checking");
  const [institution, setInstitution] = React.useState("");
  const [last4, setLast4] = React.useState("");
  const [opening, setOpening] = React.useState("0");
  const [claim, setClaim] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const guarded = useReconciledWrite();

  React.useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setType(initial?.type ?? "checking");
    setInstitution(initial?.institution ?? "");
    setLast4(initial?.last4 ?? "");
    setOpening(String(initial?.openingBalance ?? 0));
    setClaim(!initial && isFirst);
  }, [open, initial, isFirst]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const payload: Record<string, unknown> = {
      name,
      type,
      institution: institution.trim() || null,
      last4: last4.trim() || null,
      openingBalance: Number(opening || 0),
    };
    if (!initial) payload.claimUnassigned = claim;
    try {
      await guarded((headers) =>
        apiFetch(initial ? `/api/accounts/${initial.id}` : "/api/accounts", {
          ...jsonBody(initial ? "PATCH" : "POST", payload),
          headers,
        }),
      );
    } catch (err) {
      if (err instanceof WriteCancelled) return;
      toast.error(errorMessage(err, "Failed to save account"));
      return;
    } finally {
      setPending(false);
    }
    toast.success(initial ? "Account updated" : "Account added");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit account" : "New account"}</DialogTitle>
          <DialogDescription>
            A bank account, cash, or wallet that money moves in and out of. Its balance is the
            opening balance plus every transaction recorded on it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="acct-name">Name</Label>
            <Input
              id="acct-name"
              required
              maxLength={60}
              placeholder="Everyday checking"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="acct-type">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as AccountType)}>
                <SelectTrigger id="acct-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {ACCOUNT_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="acct-last4">Last 4 (optional)</Label>
              <Input
                id="acct-last4"
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
            <Label htmlFor="acct-institution">Bank or provider (optional)</Label>
            <Input
              id="acct-institution"
              maxLength={80}
              placeholder="Chase"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="acct-opening">Opening balance</Label>
            <Input
              id="acct-opening"
              type="number"
              step="0.01"
              min="-99999999999.99"
              max="99999999999.99"
              required
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              aria-describedby="acct-opening-help"
            />
            <p id="acct-opening-help" className="text-[11px] leading-[1.4] text-muted-foreground">
              What the account held before the first transaction you record on it. Negative if
              overdrawn.
            </p>
          </div>
          {!initial && (
            <div className="flex items-start gap-2.5 rounded-lg border border-border/60 p-3">
              <Checkbox
                id="acct-claim"
                checked={claim}
                onCheckedChange={(v) => setClaim(!!v)}
                className="mt-0.5"
              />
              <div className="grid gap-0.5">
                <Label htmlFor="acct-claim" className="leading-[1.3]">
                  Move unassigned transactions here
                </Label>
                <p className="text-[11px] leading-[1.4] text-muted-foreground">
                  Every transaction not yet linked to an account joins this one. Purchases made on
                  a credit card stay with the card.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {initial ? "Save" : "Add account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
