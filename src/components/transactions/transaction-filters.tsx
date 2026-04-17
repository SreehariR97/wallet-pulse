"use client";
import * as React from "react";
import { format, startOfMonth, startOfWeek, subDays, subMonths } from "date-fns";
import { X, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useCategories } from "@/stores/categories";
import type { TxType, PaymentMethod } from "@/types";

export interface TxFilterValues {
  type?: TxType;
  categoryId?: string;
  paymentMethod?: PaymentMethod;
  from?: string;
  to?: string;
  minAmount?: string;
  maxAmount?: string;
  tags?: string;
}

const ALL = "__all__";

function toFilterParam(value: string) {
  return value === ALL ? undefined : value;
}

function presetRange(preset: string): { from?: string; to?: string } {
  const today = new Date();
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");
  switch (preset) {
    case "today":
      return { from: fmt(today), to: fmt(today) };
    case "week":
      return { from: fmt(startOfWeek(today, { weekStartsOn: 1 })), to: fmt(today) };
    case "month":
      return { from: fmt(startOfMonth(today)), to: fmt(today) };
    case "30d":
      return { from: fmt(subDays(today, 30)), to: fmt(today) };
    case "90d":
      return { from: fmt(subDays(today, 90)), to: fmt(today) };
    case "year":
      return { from: fmt(subMonths(today, 12)), to: fmt(today) };
    default:
      return {};
  }
}

export function TransactionFilters({
  values,
  onChange,
}: {
  values: TxFilterValues;
  onChange: (v: TxFilterValues) => void;
}) {
  const { items: categories, fetch, loaded } = useCategories();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!loaded) fetch();
  }, [loaded, fetch]);

  const activeCount = [values.type, values.categoryId, values.paymentMethod, values.from || values.to, values.minAmount, values.maxAmount, values.tags]
    .filter(Boolean).length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={(() => {
          if (values.from === values.to && values.from === format(new Date(), "yyyy-MM-dd")) return "today";
          if (values.from && values.to) return "custom";
          return ALL;
        })()}
        onValueChange={(v) => {
          if (v === ALL) onChange({ ...values, from: undefined, to: undefined });
          else if (v !== "custom") onChange({ ...values, ...presetRange(v) });
        }}
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Date range" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All time</SelectItem>
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="week">This week</SelectItem>
          <SelectItem value="month">This month</SelectItem>
          <SelectItem value="30d">Last 30 days</SelectItem>
          <SelectItem value="90d">Last 90 days</SelectItem>
          <SelectItem value="year">Last year</SelectItem>
          <SelectItem value="custom">Custom</SelectItem>
        </SelectContent>
      </Select>

      <Select value={values.type ?? ALL} onValueChange={(v) => onChange({ ...values, type: toFilterParam(v) as TxType | undefined })}>
        <SelectTrigger className="w-[170px]">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All types</SelectItem>
          <SelectItem value="expense">Expense</SelectItem>
          <SelectItem value="income">Income</SelectItem>
          <SelectItem value="loan_given">Loan Given</SelectItem>
          <SelectItem value="loan_taken">Loan Taken</SelectItem>
          <SelectItem value="repayment_received">Repayment In</SelectItem>
          <SelectItem value="repayment_made">Repayment Out</SelectItem>
        </SelectContent>
      </Select>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 font-[540]">
            <Filter className="h-4 w-4" />
            More filters
            {activeCount > 0 && <Badge className="ml-1 h-5 px-1.5">{activeCount}</Badge>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end">
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block text-xs">Category</Label>
              <Select value={values.categoryId ?? ALL} onValueChange={(v) => onChange({ ...values, categoryId: toFilterParam(v) })}>
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block text-xs">Payment method</Label>
              <Select value={values.paymentMethod ?? ALL} onValueChange={(v) => onChange({ ...values, paymentMethod: toFilterParam(v) as PaymentMethod | undefined })}>
                <SelectTrigger>
                  <SelectValue placeholder="Any method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Any method</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="credit_card">Credit Card</SelectItem>
                  <SelectItem value="debit_card">Debit Card</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="mb-2 block text-xs">From</Label>
                <Input type="date" value={values.from ?? ""} onChange={(e) => onChange({ ...values, from: e.target.value || undefined })} />
              </div>
              <div>
                <Label className="mb-2 block text-xs">To</Label>
                <Input type="date" value={values.to ?? ""} onChange={(e) => onChange({ ...values, to: e.target.value || undefined })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="mb-2 block text-xs">Min amount</Label>
                <Input type="number" step="0.01" value={values.minAmount ?? ""} onChange={(e) => onChange({ ...values, minAmount: e.target.value || undefined })} placeholder="0" />
              </div>
              <div>
                <Label className="mb-2 block text-xs">Max amount</Label>
                <Input type="number" step="0.01" value={values.maxAmount ?? ""} onChange={(e) => onChange({ ...values, maxAmount: e.target.value || undefined })} placeholder="999" />
              </div>
            </div>
            <div>
              <Label className="mb-2 block text-xs">Tags</Label>
              <Input value={values.tags ?? ""} onChange={(e) => onChange({ ...values, tags: e.target.value || undefined })} placeholder="work, vacation" />
            </div>
            <div className="flex justify-between pt-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onChange({})}
                disabled={activeCount === 0}
              >
                <X className="h-3 w-3" /> Clear all
              </Button>
              <Button size="sm" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {activeCount > 0 && (
        <Button variant="ghost" size="sm" onClick={() => onChange({})} className="text-muted-foreground">
          <X className="h-3 w-3" /> Clear
        </Button>
      )}
    </div>
  );
}
