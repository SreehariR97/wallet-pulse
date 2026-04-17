"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { useCategories } from "@/stores/categories";
import { cn, currencySymbol, categoryTypeForTransactionType, isInflow, isOutflow, isLoanType } from "@/lib/utils";
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
  isRecurring: boolean;
  recurringFrequency: RecurringFrequency | "";
  tags: string;
}

const DEFAULT: TransactionFormValues = {
  type: "expense",
  amount: "",
  categoryId: "",
  description: "",
  notes: "",
  date: format(new Date(), "yyyy-MM-dd"),
  paymentMethod: "credit_card",
  creditCardId: "",
  isRecurring: false,
  recurringFrequency: "",
  tags: "",
};

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
];

function typeButtonClasses(active: boolean, type: TxType): string {
  if (!active) return "border-input bg-background text-muted-foreground hover:bg-muted";
  if (type === "income" || type === "repayment_received") return "border-success bg-success/15 text-success";
  if (type === "expense" || type === "repayment_made") return "border-foreground bg-secondary text-foreground";
  if (type === "loan_given") return "border-warning bg-warning/15 text-warning";
  if (type === "loan_taken") return "border-accent bg-accent/50 text-accent-foreground";
  return "border-accent bg-accent/50 text-accent-foreground";
}

export function TransactionForm({
  mode,
  initial,
  transactionId,
  onSuccess,
  currency = "USD",
  showSaveAndAddAnother = true,
  redirectOnSave = true,
}: {
  mode: "create" | "edit";
  initial?: Partial<TransactionFormValues>;
  transactionId?: string;
  onSuccess?: (tx: TransactionDTO) => void;
  currency?: string;
  showSaveAndAddAnother?: boolean;
  redirectOnSave?: boolean;
}) {
  const router = useRouter();
  const { items: categories, fetch: fetchCats, loaded } = useCategories();
  const [values, setValues] = React.useState<TransactionFormValues>({ ...DEFAULT, ...initial });
  const [pending, setPending] = React.useState<"save" | "saveAdd" | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string[] | undefined>>({});
  const [cards, setCards] = React.useState<CardOption[]>([]);

  React.useEffect(() => {
    if (!loaded) fetchCats();
  }, [loaded, fetchCats]);

  React.useEffect(() => {
    // Active cards only — archived cards are intentionally excluded from
    // the picker (stage 3 rule). Legacy transactions retain their FK.
    fetch("/api/credit-cards")
      .then((r) => r.json())
      .then((j) => setCards((j.data ?? []) as CardOption[]))
      .catch(() => {});
  }, []);

  const requiredCategoryType = categoryTypeForTransactionType(values.type);
  const filteredCategories = React.useMemo(
    () => categories.filter((c) => c.type === requiredCategoryType),
    [categories, requiredCategoryType]
  );

  React.useEffect(() => {
    // If the current category no longer matches the required type (or none picked), default-select one.
    const current = categories.find((c) => c.id === values.categoryId);
    if (!current || current.type !== requiredCategoryType) {
      const first = filteredCategories[0];
      if (first) setValues((v) => ({ ...v, categoryId: first.id }));
      else if (values.categoryId) setValues((v) => ({ ...v, categoryId: "" }));
    }
  }, [values.type, requiredCategoryType, categories, filteredCategories, values.categoryId]);

  function set<K extends keyof TransactionFormValues>(k: K, v: TransactionFormValues[K]) {
    setValues((p) => {
      const next = { ...p, [k]: v };
      // Auto-clear creditCardId if paymentMethod leaves credit_card. Keeps
      // the client in sync with the server's coherence check on PUT.
      if (k === "paymentMethod" && v !== "credit_card") next.creditCardId = "";
      return next;
    });
    if (errors[k as string]) setErrors((e) => ({ ...e, [k as string]: undefined }));
  }

  async function submit(addAnother: boolean) {
    setPending(addAnother ? "saveAdd" : "save");
    setErrors({});
    const payload = {
      ...values,
      amount: values.amount,
      notes: values.notes || null,
      tags: values.tags || null,
      creditCardId: values.creditCardId || null,
      recurringFrequency: values.isRecurring ? values.recurringFrequency || null : null,
    };
    const url = mode === "create" ? "/api/transactions" : `/api/transactions/${transactionId}`;
    const method = mode === "create" ? "POST" : "PUT";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setPending(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      if (j.details) setErrors(j.details);
      toast.error(j.error ?? "Failed to save transaction");
      return;
    }
    const { data } = await res.json();
    toast.success(mode === "create" ? "Transaction added" : "Transaction updated");
    onSuccess?.(data as TransactionDTO);
    if (addAnother) {
      setValues({
        ...DEFAULT,
        type: values.type,
        paymentMethod: values.paymentMethod,
        categoryId: values.categoryId,
        date: values.date,
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
        <Label>Type</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TYPE_BUTTONS.map(({ type, label, subtitle }) => (
            <button
              type="button"
              key={type}
              onClick={() => set("type", type)}
              className={cn(
                "flex flex-col items-start rounded-lg border px-3 py-2.5 text-left transition-colors",
                typeButtonClasses(values.type === type, type)
              )}
            >
              <span className="text-sm font-[540]">{label}</span>
              <span className="text-[11px] font-[460] opacity-80">{subtitle}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="amount">Amount</Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-muted-foreground">
            {currencySymbol(currency)}
          </span>
          <Input
            id="amount"
            inputMode="decimal"
            type="number"
            step="0.01"
            min="0"
            required
            className={amountClass}
            value={values.amount}
            onChange={(e) => set("amount", e.target.value)}
            placeholder="0.00"
          />
        </div>
        {errors.amount && <p className="text-xs font-[500] text-destructive">{errors.amount[0]}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label>Category</Label>
          <Select value={values.categoryId} onValueChange={(v) => set("categoryId", v)}>
            <SelectTrigger>
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
        <Label>Payment method</Label>
        <Select value={values.paymentMethod} onValueChange={(v) => set("paymentMethod", v as PaymentMethod)}>
          <SelectTrigger>
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
          <Label>Card</Label>
          <Select
            value={values.creditCardId || NONE_VALUE}
            onValueChange={(v) => set("creditCardId", v === NONE_VALUE ? "" : v)}
          >
            <SelectTrigger>
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
            <Label>Frequency</Label>
            <Select value={values.recurringFrequency || undefined} onValueChange={(v) => set("recurringFrequency", v as RecurringFrequency)}>
              <SelectTrigger>
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
        <Button type="button" variant="outline" onClick={() => router.back()}>
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
