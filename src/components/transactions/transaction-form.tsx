"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { useReconciledWrite, WriteCancelled } from "@/components/shared/reconciled-confirm";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { useCategories } from "@/stores/categories";
import useSWR from "swr";
import { useAccounts } from "@/hooks/useAccounts";
import { AccountSelect } from "@/components/accounts/account-select";
import { TRANSFER_CATEGORY_NAMES } from "@/lib/db/defaults";
import { cn, currencySymbol, categoryTypeForTransactionType, isInflow, isLoanType } from "@/lib/utils";
import { ApiError, apiFetch, errorMessage, jsonBody, revalidateAll, type ApiEnvelope } from "@/lib/api-client";
import type { TxType, PaymentMethod, RecurringFrequency, TransactionDTO } from "@/types";

export interface TransactionFormValues {
  type: TxType;
  amount: string;
  categoryId: string;
  description: string;
  notes: string;
  date: string;
  paymentMethod: PaymentMethod;
  /** Empty string = none; otherwise an active card id. */
  creditCardId: string;
  /** Empty string = none. Where the money comes from (or goes to, for inflows). */
  accountId: string;
  /** Transfers only: the account receiving the money. Empty = outside your accounts. */
  transferAccountId: string;
  isRecurring: boolean;
  recurringFrequency: RecurringFrequency | "";
  tags: string;
}

// A function, not a constant: a module-level date would freeze at page load,
// so a tab left open overnight defaulted new transactions to yesterday.
const defaultValues = (): TransactionFormValues => ({
  type: "expense",
  amount: "",
  categoryId: "",
  description: "",
  notes: "",
  date: format(new Date(), "yyyy-MM-dd"),
  paymentMethod: "credit_card",
  creditCardId: "",
  accountId: "",
  transferAccountId: "",
  isRecurring: false,
  recurringFrequency: "",
  tags: "",
});

interface CardOption {
  id: string;
  name: string;
  last4: string | null;
}

const NONE_VALUE = "__none__";

type TypeButton = { type: TxType; label: string; subtitle: string };

const TYPE_BUTTONS: TypeButton[] = [
  { type: "expense", label: "Expense", subtitle: "Money out" },
  { type: "income", label: "Income", subtitle: "Money in" },
  { type: "loan_given", label: "Loan Given", subtitle: "You lent" },
  { type: "loan_taken", label: "Loan Taken", subtitle: "You borrowed" },
  { type: "repayment_received", label: "Repayment In", subtitle: "Paid back to you" },
  { type: "repayment_made", label: "Repayment Out", subtitle: "You paid back" },
  { type: "transfer", label: "Transfer", subtitle: "Between accounts" },
];

function typeButtonClasses(active: boolean, type: TxType): string {
  if (!active) return "border-input bg-background text-muted-foreground hover:bg-muted";
  if (type === "income" || type === "repayment_received") return "border-success bg-success/15 text-success";
  if (type === "expense" || type === "repayment_made") return "border-foreground bg-secondary text-foreground";
  if (type === "loan_given") return "border-warning bg-warning/15 text-warning";
  // Solid accent: a half-transparent one over the dark background fails contrast.
  return "border-accent bg-accent text-accent-foreground";
}

export function TransactionForm({
  mode,
  initial,
  transactionId,
  onSuccess,
  onCancel,
  currency = "USD",
  showSaveAndAddAnother = true,
  redirectOnSave = true,
}: {
  mode: "create" | "edit";
  initial?: Partial<TransactionFormValues>;
  transactionId?: string;
  /** `addAnother` is true for "Save & add another": the form stays open and resets. */
  onSuccess?: (tx: TransactionDTO, opts: { addAnother: boolean }) => void;
  /** Defaults to router.back(); pass it when the form lives in a dialog. */
  onCancel?: () => void;
  currency?: string;
  showSaveAndAddAnother?: boolean;
  redirectOnSave?: boolean;
}) {
  const router = useRouter();
  const { items: categories, fetch: fetchCats, loaded } = useCategories();
  const [values, setValues] = React.useState<TransactionFormValues>(() => ({ ...defaultValues(), ...initial }));
  const [pending, setPending] = React.useState<"save" | "saveAdd" | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string[] | undefined>>({});
  const guarded = useReconciledWrite();
  // Active cards only — archived cards are intentionally excluded from the
  // picker (stage 3 rule). Legacy transactions retain their FK. Shared SWR
  // key with the filters and pay dialog, so it's fetched once.
  const cardsReq = useSWR<ApiEnvelope<CardOption[]>>("/api/credit-cards");
  const cards = cardsReq.data?.data ?? [];
  const accounts = useAccounts();

  React.useEffect(() => {
    if (!loaded) fetchCats();
  }, [loaded, fetchCats]);

  const requiredCategoryType = categoryTypeForTransactionType(values.type);
  const filteredCategories = React.useMemo(
    () => categories.filter((c) => c.type === requiredCategoryType),
    [categories, requiredCategoryType]
  );

  React.useEffect(() => {
    // Wait until the categories store has loaded before auto-selecting —
    // otherwise the first effect pass (empty items) wipes the categoryId
    // handed in as `initial`, and the second pass picks the first-sorted
    // category of the required type instead of the one the user set.
    if (!loaded) return;
    const current = categories.find((c) => c.id === values.categoryId);
    if (!current || current.type !== requiredCategoryType) {
      const first =
        (requiredCategoryType === "transfer" &&
          filteredCategories.find((c) => c.name === TRANSFER_CATEGORY_NAMES.accountTransfer)) ||
        filteredCategories[0];
      if (first) setValues((v) => ({ ...v, categoryId: first.id }));
      else if (values.categoryId) setValues((v) => ({ ...v, categoryId: "" }));
    }
  }, [loaded, values.type, requiredCategoryType, categories, filteredCategories, values.categoryId]);

  function set<K extends keyof TransactionFormValues>(k: K, v: TransactionFormValues[K]) {
    setValues((p) => {
      const next = { ...p, [k]: v };
      // Auto-clear creditCardId if paymentMethod leaves credit_card. Keeps
      // the client in sync with the server's coherence check on PUT.
      if (k === "paymentMethod" && v !== "credit_card") next.creditCardId = "";
      // A card purchase is charged to the card, not an account (the account
      // pays when the card is paid) — mirrors validateAccountLinks.
      if (next.type === "expense" && next.creditCardId) next.accountId = "";
      // A new transfer moves money between accounts, not onto a card.
      if (k === "type" && v === "transfer" && p.type !== "transfer" && p.paymentMethod === "credit_card") {
        next.paymentMethod = "bank_transfer";
        next.creditCardId = "";
      }
      return next;
    });
    if (errors[k as string]) setErrors((e) => ({ ...e, [k as string]: undefined }));
  }

  const cardPaidExpense = values.type === "expense" && !!values.creditCardId;
  // A card payment's destination is the card, so it has no "to" account.
  const showTransferTo = values.type === "transfer" && !values.creditCardId;
  const hasAccounts = accounts.all.length > 0;
  const typeButtons = TYPE_BUTTONS.filter(
    (b) => b.type !== "transfer" || values.type === "transfer" || accounts.active.length >= 2,
  );

  async function submit(addAnother: boolean) {
    setPending(addAnother ? "saveAdd" : "save");
    setErrors({});
    const payload = {
      ...values,
      amount: values.amount,
      notes: values.notes || null,
      tags: values.tags || null,
      creditCardId: values.creditCardId || null,
      accountId: cardPaidExpense ? null : values.accountId || null,
      transferAccountId: showTransferTo ? values.transferAccountId || null : null,
      recurringFrequency: values.isRecurring ? values.recurringFrequency || null : null,
    };
    const url = mode === "create" ? "/api/transactions" : `/api/transactions/${transactionId}`;
    let saved: TransactionDTO;
    try {
      const init = jsonBody(mode === "create" ? "POST" : "PUT", payload);
      saved = (await guarded((headers) => apiFetch<TransactionDTO>(url, { ...init, headers }))).data;
    } catch (err) {
      if (err instanceof WriteCancelled) return;
      if (err instanceof ApiError && err.details) setErrors(err.details);
      toast.error(errorMessage(err, "Failed to save transaction"));
      return;
    } finally {
      setPending(null);
    }
    toast.success(mode === "create" ? "Transaction added" : "Transaction updated");
    void revalidateAll();
    onSuccess?.(saved, { addAnother });
    if (addAnother) {
      setValues({
        ...defaultValues(),
        type: values.type,
        paymentMethod: values.paymentMethod,
        categoryId: values.categoryId,
        date: values.date,
        accountId: values.accountId,
      });
    } else if (redirectOnSave) {
      router.push("/transactions");
      router.refresh();
    }
  }

  const amountClass = cn(
    "text-[28px] font-[540] tracking-[-0.015em] h-14 pl-10",
    isInflow(values.type) && "text-success"
  );

  const categoryGroupLabel =
    requiredCategoryType === "loan" ? "Loan" : requiredCategoryType === "income" ? "Income" : "Expense";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      className="space-y-5"
    >
      <div className="grid gap-1.5">
        <Label id="tx-type-label">Type</Label>
        <div role="radiogroup" aria-labelledby="tx-type-label" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {typeButtons.map(({ type, label, subtitle }) => (
            <button
              type="button"
              key={type}
              role="radio"
              aria-checked={values.type === type}
              onClick={() => set("type", type)}
              className={cn(
                "flex flex-col items-start rounded-lg border px-3 py-2.5 text-left transition-colors",
                typeButtonClasses(values.type === type, type)
              )}
            >
              <span className="text-sm font-[540]">{label}</span>
              <span className="text-[11px] font-[460]">{subtitle}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="amount">Amount</Label>
        <div className="relative">
          <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-muted-foreground">
            {currencySymbol(currency)}
          </span>
          <Input
            id="amount"
            inputMode="decimal"
            type="number"
            step="0.01"
            min="0"
            // Matches the Zod cap in src/lib/validations/transaction.ts.
            // Native bound surfaces the error before submit instead of
            // letting users type 15 digits and only see it on save.
            max="99999999999.99"
            required
            aria-invalid={!!errors.amount}
            aria-describedby={errors.amount ? "amount-error" : undefined}
            className={amountClass}
            value={values.amount}
            onChange={(e) => set("amount", e.target.value)}
            placeholder="0.00"
          />
        </div>
        {errors.amount && <p id="amount-error" className="text-xs font-[500] text-destructive">{errors.amount[0]}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="tx-category">Category</Label>
          <Select value={values.categoryId} onValueChange={(v) => set("categoryId", v)}>
            <SelectTrigger id="tx-category" aria-invalid={!!errors.categoryId}>
              <SelectValue placeholder={filteredCategories.length ? "Select category" : `No ${categoryGroupLabel.toLowerCase()} categories`} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>{categoryGroupLabel}</SelectLabel>
                {filteredCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="mr-2">{c.icon}</span>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {isLoanType(values.type) && filteredCategories.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Tip: create a Loan category on the Categories page first.
            </p>
          )}
          {errors.categoryId && <p className="text-xs font-[500] text-destructive">{errors.categoryId[0]}</p>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="date">Date</Label>
          <Input id="date" type="date" required value={values.date} onChange={(e) => set("date", e.target.value)} />
          {errors.date && <p className="text-xs font-[500] text-destructive">{errors.date[0]}</p>}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          required
          maxLength={200}
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder={
            values.type === "loan_given"
              ? "Lent $100 to Alex"
              : values.type === "loan_taken"
                ? "Borrowed from Mom"
                : values.type === "repayment_received"
                  ? "Alex paid me back"
                  : values.type === "repayment_made"
                    ? "Paid back Mom"
                    : "Coffee at Blue Bottle"
          }
        />
        {errors.description && <p className="text-xs font-[500] text-destructive">{errors.description[0]}</p>}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="tx-payment-method">Payment method</Label>
        <Select value={values.paymentMethod} onValueChange={(v) => set("paymentMethod", v as PaymentMethod)}>
          <SelectTrigger id="tx-payment-method">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="credit_card">Credit Card</SelectItem>
            <SelectItem value="debit_card">Debit Card</SelectItem>
            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
            <SelectItem value="upi">UPI</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {values.paymentMethod === "credit_card" && cards.length > 0 && (
        <div className="grid gap-1.5">
          <Label htmlFor="tx-card">Card</Label>
          <Select
            value={values.creditCardId || NONE_VALUE}
            onValueChange={(v) => set("creditCardId", v === NONE_VALUE ? "" : v)}
          >
            <SelectTrigger id="tx-card">
              <SelectValue placeholder="Pick a card" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>— None —</SelectItem>
              {cards.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                  {c.last4 ? ` · ···· ${c.last4}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Optional — reflects on the card&apos;s balance and cycle if set.
          </p>
        </div>
      )}

      {hasAccounts && !cardPaidExpense && (
        <div className={cn("grid gap-4", showTransferTo && "sm:grid-cols-2")}>
          <div className="grid gap-1.5">
            <Label htmlFor="tx-account">
              {values.type === "transfer" ? "From account" : isInflow(values.type) ? "Into account" : "From account"}
            </Label>
            <AccountSelect
              id="tx-account"
              accounts={accounts.all}
              value={values.accountId || null}
              onChange={(v) => set("accountId", v ?? "")}
              exclude={showTransferTo ? values.transferAccountId : undefined}
              noneLabel={showTransferTo ? "— Outside my accounts —" : "— None —"}
            />
            {errors.accountId && <p className="text-xs font-[500] text-destructive">{errors.accountId[0]}</p>}
          </div>
          {showTransferTo && (
            <div className="grid gap-1.5">
              <Label htmlFor="tx-transfer-account">To account</Label>
              <AccountSelect
                id="tx-transfer-account"
                accounts={accounts.all}
                value={values.transferAccountId || null}
                onChange={(v) => set("transferAccountId", v ?? "")}
                exclude={values.accountId}
                noneLabel="— Outside my accounts —"
              />
            </div>
          )}
          {showTransferTo && (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              A move between two of your accounts changes both balances and doesn&apos;t count as
              spending or income.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea
          id="notes"
          rows={2}
          value={values.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder={isLoanType(values.type) ? "Who & why — helpful for tracking" : "Any extra context"}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="tags">Tags (optional)</Label>
        <Input id="tags" value={values.tags} onChange={(e) => set("tags", e.target.value)} placeholder="work, reimbursable, vacation" />
        <p className="text-xs text-muted-foreground">Comma-separated</p>
      </div>

      <div className="rounded-xl border border-border bg-muted p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="recurring" className="cursor-pointer">
              Recurring transaction
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">Mark this as an ongoing commitment</p>
          </div>
          <Switch id="recurring" checked={values.isRecurring} onCheckedChange={(v) => set("isRecurring", v)} />
        </div>
        {values.isRecurring && (
          <div className="mt-3 grid gap-1.5">
            <Label htmlFor="tx-frequency">Frequency</Label>
            <Select value={values.recurringFrequency || undefined} onValueChange={(v) => set("recurringFrequency", v as RecurringFrequency)}>
              <SelectTrigger id="tx-frequency">
                <SelectValue placeholder="Select frequency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={() => (onCancel ? onCancel() : router.back())}>
          Cancel
        </Button>
        {showSaveAndAddAnother && mode === "create" && (
          <Button type="button" variant="secondary" onClick={() => submit(true)} disabled={!!pending}>
            {pending === "saveAdd" && <Loader2 className="h-4 w-4 animate-spin" />}
            Save & add another
          </Button>
        )}
        <Button type="submit" disabled={!!pending}>
          {pending === "save" && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === "create" ? "Add transaction" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
