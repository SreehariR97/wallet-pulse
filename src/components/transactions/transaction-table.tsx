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
import { cn, dateFromSeconds, formatCurrency, paymentMethodLabel } from "@/lib/utils";
import type { TransactionListItem } from "@/types";

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
      <div className="relative overflow-hidden rounded-lg border border-border/50 bg-card/40">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
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
                <tr key={t.id} className="border-b border-border/30 transition-colors hover:bg-secondary/40">
                  <td className="px-4 py-3">
                    <Checkbox
                      checked={selected.has(t.id)}
                      onCheckedChange={() => onToggleSelect(t.id)}
                      aria-label={`Select ${t.description}`}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                    {format(dateFromSeconds(t.date), "MMM d, yyyy")}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-full text-sm"
                        style={{ backgroundColor: (t.categoryColor ?? "#6366F1") + "22", color: t.categoryColor ?? "#6366F1" }}
                      >
                        {t.categoryIcon ?? "📦"}
                      </span>
                      <span className="hidden sm:inline text-xs font-medium">{t.categoryName}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2 font-medium">
                      {t.description}
                      {t.isRecurring && <Repeat className="h-3 w-3 text-primary" aria-label="Recurring" />}
                    </div>
                    {t.tags && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {t.tags.split(",").slice(0, 3).map((tag) => (
                          <span key={tag} className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {tag.trim()}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="hidden px-3 py-3 text-xs text-muted-foreground md:table-cell">
                    {paymentMethodLabel(t.paymentMethod)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-3 text-right font-mono font-semibold tabular-nums",
                      t.type === "income" ? "text-success" : t.type === "expense" ? "text-destructive" : "text-foreground"
                    )}
                  >
                    {t.type === "income" ? "+" : t.type === "expense" ? "-" : ""}
                    {formatCurrency(t.amount, t.currency ?? currency)}
                  </td>
                  <td className="px-3 py-3">
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
