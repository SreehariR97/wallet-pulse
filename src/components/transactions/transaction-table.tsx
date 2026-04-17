"use client";
import Link from "next/link";
import * as React from "react";
import { format } from "date-fns";
import { ArrowDown, ArrowUp, ChevronsUpDown, MoreHorizontal, Pencil, Trash2, Repeat } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { cn, dateFromSeconds, formatCurrency, paymentMethodLabel, isInflow, isOutflow, isLoanType, transactionTypeLabel } from "@/lib/utils";
import type { TransactionListItem, TxType } from "@/types";

function amountColorClass(type: TxType): string {
  if (type === "income" || type === "repayment_received") return "text-success";
  if (type === "loan_given") return "text-warning";
  return "text-foreground";
}

function amountSign(type: TxType): string {
  if (isInflow(type)) return "+";
  if (isOutflow(type)) return "−";
  return "";
}

type SortKey = "date" | "amount" | "description" | "createdAt";
type SortOrder = "asc" | "desc";

export function TransactionTable({
  items,
  currency,
  sort,
  order,
  onSort,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  onDeleted,
}: {
  items: TransactionListItem[];
  currency: string;
  sort: SortKey;
  order: SortOrder;
  onSort: (key: SortKey) => void;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (all: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const [confirmingId, setConfirmingId] = React.useState<string | null>(null);

  async function doDelete(id: string) {
    const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Failed to delete transaction");
    toast.success("Transaction deleted");
    onDeleted(id);
  }

  const allSelected = items.length > 0 && items.every((t) => selected.has(t.id));

  return (
    <>
      <div className="relative overflow-hidden rounded-lg border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-[11px] font-[600] uppercase tracking-[0.08em] text-muted-foreground">
                <th className="w-8 px-4 py-3">
                  <Checkbox checked={allSelected} onCheckedChange={(v) => onToggleSelectAll(!!v)} aria-label="Select all" />
                </th>
                <SortableTh active={sort === "date"} order={order} onClick={() => onSort("date")}>Date</SortableTh>
                <th className="px-3 py-3">Category</th>
                <SortableTh active={sort === "description"} order={order} onClick={() => onSort("description")}>Description</SortableTh>
                <th className="px-3 py-3 hidden md:table-cell">Method</th>
                <SortableTh align="right" active={sort === "amount"} order={order} onClick={() => onSort("amount")}>Amount</SortableTh>
                <th className="w-12 px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id} className="border-b border-border/60 transition-colors last:border-b-0 hover:bg-muted">
                  <td className="px-4 py-3.5">
                    <Checkbox
                      checked={selected.has(t.id)}
                      onCheckedChange={() => onToggleSelect(t.id)}
                      aria-label={`Select ${t.description}`}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3.5 text-[13px] font-[460] text-muted-foreground">
                    {format(dateFromSeconds(t.date), "MMM d, yyyy")}
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-sm"
                        style={{ backgroundColor: (t.categoryColor ?? "#6366F1") + "22", color: t.categoryColor ?? "#6366F1" }}
                      >
                        {t.categoryIcon ?? "📦"}
                      </span>
                      <span className="hidden sm:inline text-[13px] font-[540]">{t.categoryName}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-2 font-[540] leading-[1.35]">
                      {t.description}
                      {t.isRecurring && <Repeat className="h-3 w-3 text-accent-foreground" aria-label="Recurring" />}
                    </div>
                    {t.tags && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {t.tags.split(",").slice(0, 3).map((tag) => (
                          <span key={tag} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-[500] text-muted-foreground">
                            {tag.trim()}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="hidden px-3 py-3.5 text-[12px] font-[460] text-muted-foreground md:table-cell">
                    {paymentMethodLabel(t.paymentMethod)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-3.5 text-right font-[540] tabular-nums",
                      amountColorClass(t.type)
                    )}
                  >
                    <div className="flex flex-col items-end leading-tight">
                      <span>
                        {amountSign(t.type)}
                        {formatCurrency(t.amount, t.currency ?? currency)}
                      </span>
                      {isLoanType(t.type) && (
                        <span className="text-[10px] font-[500] uppercase tracking-[0.08em] opacity-70">
                          {transactionTypeLabel(t.type)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" aria-label="Actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/transactions/${t.id}/edit`}>
                            <Pencil className="h-4 w-4" /> Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setConfirmingId(t.id)} className="text-destructive">
                          <Trash2 className="h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <ConfirmDialog
        open={!!confirmingId}
        onOpenChange={(o) => !o && setConfirmingId(null)}
        title="Delete transaction?"
        description="This will permanently delete this transaction. This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (confirmingId) await doDelete(confirmingId);
        }}
      />
    </>
  );
}

function SortableTh({
  children,
  onClick,
  active,
  order,
  align,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  order: SortOrder;
  align?: "right";
}) {
  const Icon = active ? (order === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
  return (
    <th className={cn("px-3 py-3", align === "right" && "text-right")}>
      <button
        type="button"
        onClick={onClick}
        className={cn("inline-flex items-center gap-1 transition-colors hover:text-foreground", active && "text-foreground")}
      >
        {children}
        <Icon className="h-3 w-3" />
      </button>
    </th>
  );
}
