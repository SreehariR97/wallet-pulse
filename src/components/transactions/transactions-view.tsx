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
import useSWR from "swr";
import { ErrorState } from "@/components/shared/error-state";
import { apiFetch, errorMessage, jsonBody, revalidateAll, type ApiEnvelope } from "@/lib/api-client";
import type { TransactionListItem, ListMeta } from "@/types";

type SortKey = "date" | "amount" | "description" | "createdAt";
type SortOrder = "asc" | "desc";

export function TransactionsView({ currency }: { currency: string }) {
  const [filters, setFilters] = React.useState<TxFilterValues>({});
  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState<SortKey>("date");
  const [order, setOrder] = React.useState<SortOrder>("desc");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = React.useState(false);
  const [bulkPending, setBulkPending] = React.useState(false);

  // Search and the free-text filters (amounts, tags) are debounced together
  // so typing "150" is one request, not three.
  const [debounced, setDebounced] = React.useState({ search: "", filters });
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced({ search: search.trim(), filters }), 300);
    return () => clearTimeout(t);
  }, [search, filters]);

  // Everything except the page number. When it changes, the page snaps back
  // to 1 in the same render (derived below), so there's no extra request
  // for "new filters, old page".
  const baseQuery = React.useMemo(() => {
    const f = debounced.filters;
    const p = new URLSearchParams();
    p.set("limit", "25");
    p.set("sort", sort);
    p.set("order", order);
    if (debounced.search) p.set("search", debounced.search);
    if (f.type) p.set("type", f.type);
    if (f.shortcut) p.set("shortcut", f.shortcut);
    if (f.categoryId) p.set("categoryId", f.categoryId);
    if (f.paymentMethod) p.set("paymentMethod", f.paymentMethod);
    if (f.creditCardId) p.set("creditCardId", f.creditCardId);
    if (f.from) p.set("from", f.from);
    if (f.to) p.set("to", f.to);
    if (f.minAmount) p.set("minAmount", f.minAmount);
    if (f.maxAmount) p.set("maxAmount", f.maxAmount);
    if (f.tags) p.set("tags", f.tags);
    return p.toString();
  }, [debounced, sort, order]);

  const [pageState, setPageState] = React.useState({ base: baseQuery, page: 1 });
  const page = pageState.base === baseQuery ? pageState.page : 1;
  const setPage = (n: number) => setPageState({ base: baseQuery, page: n });

  React.useEffect(() => {
    setSelected(new Set());
  }, [baseQuery]);

  // SWR only ever renders the response for the current key, so a slow
  // response for an old filter can't overwrite a newer one.
  const list = useSWR<ApiEnvelope<TransactionListItem[]>>(`/api/transactions?page=${page}&${baseQuery}`);
  const items = list.data?.data ?? [];
  const meta = (list.data?.meta ?? null) as ListMeta | null;
  const loading = list.isLoading;

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
    try {
      await apiFetch("/api/transactions/bulk", jsonBody("DELETE", { ids: Array.from(selected) }));
      toast.success(`${selected.size} transactions deleted`);
      setSelected(new Set());
      await revalidateAll();
    } catch (err) {
      toast.error(errorMessage(err, "Failed to delete transactions"));
    } finally {
      setBulkPending(false);
    }
  }

  function exportCsv() {
    window.location.href = `/api/export?format=csv&${baseQuery}`;
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
              <Input
                type="search"
                aria-label="Search transactions"
                placeholder="Search description or notes…"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
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

          {list.error && !list.data ? (
            <ErrorState title="Couldn't load transactions" onRetry={() => void list.mutate()} />
          ) : loading ? (
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
                setSelected((s) => {
                  const next = new Set(s);
                  next.delete(id);
                  return next;
                });
                void revalidateAll();
              }}
            />
          )}

          {meta && meta.total > meta.limit && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
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
