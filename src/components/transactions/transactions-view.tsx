"use client";
import * as React from "react";
import Link from "next/link";
import { Download, Loader2, Plus, Search, Trash2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { TransactionFilters, type TxFilterValues } from "./transaction-filters";
import { TransactionTable } from "./transaction-table";
import type { TransactionListItem, ListMeta } from "@/types";

type SortKey = "date" | "amount" | "description" | "createdAt";
type SortOrder = "asc" | "desc";

export function TransactionsView({ currency }: { currency: string }) {
  const [filters, setFilters] = React.useState<TxFilterValues>({});
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [sort, setSort] = React.useState<SortKey>("date");
  const [order, setOrder] = React.useState<SortOrder>("desc");
  const [page, setPage] = React.useState(1);
  const [items, setItems] = React.useState<TransactionListItem[]>([]);
  const [meta, setMeta] = React.useState<ListMeta | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = React.useState(false);
  const [bulkPending, setBulkPending] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const queryString = React.useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("limit", "25");
    p.set("sort", sort);
    p.set("order", order);
    if (debouncedSearch) p.set("search", debouncedSearch);
    if (filters.type) p.set("type", filters.type);
    if (filters.shortcut) p.set("shortcut", filters.shortcut);
    if (filters.categoryId) p.set("categoryId", filters.categoryId);
    if (filters.paymentMethod) p.set("paymentMethod", filters.paymentMethod);
    if (filters.creditCardId) p.set("creditCardId", filters.creditCardId);
    if (filters.from) p.set("from", filters.from);
    if (filters.to) p.set("to", filters.to);
    if (filters.minAmount) p.set("minAmount", filters.minAmount);
    if (filters.maxAmount) p.set("maxAmount", filters.maxAmount);
    if (filters.tags) p.set("tags", filters.tags);
    return p.toString();
  }, [page, sort, order, debouncedSearch, filters]);

  const fetchList = React.useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/transactions?${queryString}`);
    const json = await res.json();
    setItems(json.data ?? []);
    setMeta(json.meta ?? null);
    setLoading(false);
  }, [queryString]);

  React.useEffect(() => {
    fetchList();
  }, [fetchList]);

  React.useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [debouncedSearch, filters, sort, order]);

  function handleSort(key: SortKey) {
    if (sort === key) {
      setOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setOrder("desc");
    }
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAll(all: boolean) {
    setSelected(all ? new Set(items.map((t) => t.id)) : new Set());
  }

  async function bulkDelete() {
    setBulkPending(true);
    const res = await fetch("/api/transactions/bulk", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selected) }),
    });
    setBulkPending(false);
    if (!res.ok) {
      toast.error("Failed to delete transactions");
      return;
    }
    toast.success(`${selected.size} transactions deleted`);
    setSelected(new Set());
    fetchList();
  }

  function exportCsv() {
    window.location.href = `/api/export?format=csv&${queryString}`;
  }

  const total = meta?.total ?? 0;
  const totalPages = meta?.totalPages ?? 1;

  return (
    <div>
      <PageHeader
        title="Transactions"
        description={loading ? "Loading…" : total === 0 ? "No transactions yet" : `${total} transaction${total === 1 ? "" : "s"}`}
        action={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Button size="sm" asChild>
              <Link href="/transactions/new">
                <Plus className="h-4 w-4" /> Add
              </Link>
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search description or notes…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <TransactionFilters values={filters} onChange={setFilters} />
          </div>

          {selected.size > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted px-4 py-2 text-sm">
              <span className="font-[540]">{selected.size} selected</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setBulkConfirm(true)} disabled={bulkPending}>
                  {bulkPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  Delete selected
                </Button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Receipt className="h-7 w-7" />}
              title="No transactions found"
              description="Try adjusting filters or add your first transaction."
              action={
                <Button asChild>
                  <Link href="/transactions/new">
                    <Plus className="h-4 w-4" /> Add transaction
                  </Link>
                </Button>
              }
            />
          ) : (
            <TransactionTable
              items={items}
              currency={currency}
              sort={sort}
              order={order}
              onSort={handleSort}
              selected={selected}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
              onDeleted={(id) => {
                setItems((xs) => xs.filter((x) => x.id !== id));
                setSelected((s) => {
                  const next = new Set(s);
                  next.delete(id);
                  return next;
                });
                if (meta) setMeta({ ...meta, total: Math.max(0, meta.total - 1) });
              }}
            />
          )}

          {meta && meta.total > meta.limit && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={bulkConfirm}
        onOpenChange={setBulkConfirm}
        title={`Delete ${selected.size} transactions?`}
        description="This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={bulkDelete}
      />
    </div>
  );
}
