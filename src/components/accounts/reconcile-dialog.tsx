"use client";
import * as React from "react";
import useSWR from "swr";
import { format } from "date-fns";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError, apiFetch, errorMessage, jsonBody, type ApiEnvelope } from "@/lib/api-client";
import { isRealCivilDate } from "@/lib/civil-date";
import { cn, formatCivilDate, formatCurrency } from "@/lib/utils";
import type { AccountListItemDTO, AccountReconcilePreviewDTO, AccountReconciliationDTO } from "@/types";

const AMOUNT = /^-?\d{1,11}(\.\d{1,2})?$/;

function historyLine(h: AccountReconciliationDTO, currency: string): string {
  if (h.difference === 0) return "Matched";
  const diff = formatCurrency(h.difference, currency, true);
  return h.adjustmentTransactionId ? `Adjusted ${diff}` : `Left ${diff} unadjusted`;
}

export function ReconcileDialog({
  account,
  currency,
  onOpenChange,
  onSaved,
}: {
  /** The account being reconciled; null closes the dialog. */
  account: AccountListItemDTO | null;
  currency: string;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const open = !!account;
  const [date, setDate] = React.useState("");
  const [statement, setStatement] = React.useState("");
  const [adjust, setAdjust] = React.useState(true);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setDate(format(new Date(), "yyyy-MM-dd"));
    setStatement("");
    setAdjust(true);
  }, [open, account?.id]);

  const validDate = isRealCivilDate(date);
  const previewKey = account && validDate ? `/api/accounts/${account.id}/reconcile?date=${date}` : null;
  const preview = useSWR<ApiEnvelope<AccountReconcilePreviewDTO>>(previewKey);
  const computed = preview.data?.data.balance;
  const history = preview.data?.data.history ?? [];

  const statementNum = AMOUNT.test(statement.trim()) ? Number(statement.trim()) : null;
  const difference =
    statementNum != null && computed != null ? Math.round((statementNum - computed) * 100) / 100 : null;
  const canSubmit = !!account && validDate && statementNum != null && computed != null && !pending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !account) return;
    setPending(true);
    try {
      await apiFetch(
        `/api/accounts/${account.id}/reconcile`,
        jsonBody("POST", { statementDate: date, statementBalance: statementNum, adjust, expectedBalance: computed }),
      );
    } catch (err) {
      // 409: the balance moved under us — show the fresh number to review.
      if (err instanceof ApiError && err.status === 409) void preview.mutate();
      toast.error(errorMessage(err, "Failed to reconcile"));
      return;
    } finally {
      setPending(false);
    }
    toast.success(
      difference === 0
        ? "Reconciled — balances match"
        : adjust
          ? `Reconciled with a ${formatCurrency(difference ?? 0, currency, true)} adjustment`
          : "Reconciliation recorded",
    );
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reconcile {account?.name}</DialogTitle>
          <DialogDescription>
            Compare this account with your bank statement. Enter the balance the statement shows for its closing
            date.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="rec-date">Statement date</Label>
              <Input id="rec-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rec-balance">Statement balance</Label>
              <Input
                id="rec-balance"
                type="number"
                step="0.01"
                min="-99999999999.99"
                max="99999999999.99"
                required
                inputMode="decimal"
                placeholder="0.00"
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-lg border border-border/60 p-3 text-[13px]" aria-live="polite">
            {!validDate ? (
              <span className="text-muted-foreground">Pick a statement date.</span>
            ) : preview.error ? (
              <span className="text-destructive">Couldn&apos;t load the balance for that date.</span>
            ) : computed == null ? (
              <Skeleton className="h-5 w-48" />
            ) : (
              <div className="space-y-1.5">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">WalletPulse balance on {formatCivilDate(date, "MMM d, yyyy")}</span>
                  <span className="font-[600] tabular-nums">{formatCurrency(computed, currency, computed < 0)}</span>
                </div>
                {difference != null && (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Difference</span>
                    <span className={cn("font-[600] tabular-nums", difference === 0 && "text-success")}>
                      {difference === 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <Check className="h-3.5 w-3.5" aria-hidden /> Matches
                        </span>
                      ) : (
                        formatCurrency(difference, currency, true)
                      )}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {difference != null && difference !== 0 && (
            <div className="flex items-start gap-2.5 rounded-lg border border-border/60 p-3">
              <Checkbox id="rec-adjust" checked={adjust} onCheckedChange={(v) => setAdjust(!!v)} className="mt-0.5" />
              <div className="grid gap-0.5">
                <Label htmlFor="rec-adjust" className="leading-[1.3]">
                  Add a {formatCurrency(difference, currency, true)} balance adjustment on{" "}
                  {formatCivilDate(date, "MMM d")}
                </Label>
                <p className="text-[11px] leading-[1.4] text-muted-foreground">
                  Recorded as a transfer, so it doesn&apos;t count as spending or income. Leave unchecked to find the
                  missing transactions yourself; the account will show as out of sync until they match.
                </p>
              </div>
            </div>
          )}

          {history.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-[11px] font-[600] uppercase tracking-[0.08em] text-muted-foreground">Previous</h3>
              <ul className="space-y-1 text-[12px]">
                {history.slice(0, 5).map((h) => (
                  <li key={h.id} className="flex justify-between gap-3 tabular-nums">
                    <span>
                      {formatCivilDate(h.statementDate, "MMM d, yyyy")} ·{" "}
                      {formatCurrency(h.statementBalance, currency, h.statementBalance < 0)}
                    </span>
                    <span className="text-muted-foreground">{historyLine(h, currency)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Reconcile
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
