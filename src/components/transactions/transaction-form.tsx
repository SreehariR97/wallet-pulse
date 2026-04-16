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
import { cn, currencySymbol } from "@/lib/utils";
import type { TxType, PaymentMethod, RecurringFrequency, TransactionDTO } from "@/types";

export interface TransactionFormValues {
  type: TxType;
  amount: string;
  categoryId: string;
  description: string;
  notes: string;
  date: string;
  paymentMethod: PaymentMethod;
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
  isRecurring: false,
  recurringFrequency: "",
  tags: "",
};

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

  React.useEffect(() => {
    if (!loaded) fetchCats();
  }, [loaded, fetchCats]);

  React.useEffect(() => {
    // Default category selection when type switches
    if (!values.categoryId && categories.length) {
      const match = categories.find((c) => c.type === (values.type === "transfer" ? "expense" : values.type));
      if (match) setValues((v) => ({ ...v, categoryId: match.id }));
    }
  }, [values.type, categories]);

  const filteredCategories = categories.filter((c) =>
    values.type === "income" ? c.type === "income" : c.type === "expense"
  );

  function set<K extends keyof TransactionFormValues>(k: K, v: TransactionFormValues[K]) {
    setValues((p) => ({ ...p, [k]: v }));
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
    "text-2xl font-semibold h-14 pl-10",
    values.type === "income" && "text-success",
    values.type === "expense" && "text-destructive"
  );

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
        <div className="grid grid-cols-3 gap-2">
          {(["expense", "income", "transfer"] as const).map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => set("type", t)}
              className={cn(
                "h-10 rounded-md border text-sm font-medium capitalize transition-colors",
                values.type === t
                  ? t === "income"
                    ? "border-success bg-success/15 text-success"
                    : t === "expense"
                      ? "border-destructive bg-destructive/15 text-destructive"
                      : "border-primary bg-primary/15 text-primary"
                  : "border-input bg-background/50 text-muted-foreground hover:bg-secondary"
              )}
            >
              {t}
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
        {errors.amount && <p className="text-xs text-destructive">{errors.amount[0]}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label>Category</Label>
          <Select value={values.categoryId} onValueChange={(v) => set("categoryId", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>{values.type === "income" ? "Income" : "Expense"}</SelectLabel>
                {filteredCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="mr-2">{c.icon}</span>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {errors.categoryId && <p className="text-xs text-destructive">{errors.categoryId[0]}</p>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="date">Date</Label>
          <Input id="date" type="date" required value={values.date} onChange={(e) => set("date", e.target.value)} />
          {errors.date && <p className="text-xs text-destructive">{errors.date[0]}</p>}
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
          placeholder="Coffee at Blue Bottle"
        />
        {errors.description && <p className="text-xs text-destructive">{errors.description[0]}</p>}
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

      <div className="grid gap-1.5">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" rows={2} value={values.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Any extra context" />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="tags">Tags (optional)</Label>
        <Input id="tags" value={values.tags} onChange={(e) => set("tags", e.target.value)} placeholder="work, reimbursable, vacation" />
        <p className="text-xs text-muted-foreground">Comma-separated</p>
      </div>

      <div className="rounded-lg border border-border/50 bg-card/40 p-4">
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
