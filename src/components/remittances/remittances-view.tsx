"use client";
import * as React from "react";
import { format } from "date-fns";
import { MoreHorizontal, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { cn, currencySymbol, formatAmountFor, formatCivilDate, formatCurrency, formatFxRate } from "@/lib/utils";
import { RemittanceForm, type RemittanceFormInitial } from "./remittance-form";
import { RemittanceStats, type StatsData } from "./stats-cards";
import { ServiceBadge } from "./service-badge";
import useSWR from "swr";
import { ErrorState } from "@/components/shared/error-state";
import { apiFetch, errorMessage, revalidateAll, type ApiEnvelope } from "@/lib/api-client";

const PAGE_SIZE = 50;

type StatsRow = { totalSent: number; totalFees: number; count: number };

async function loadStats(): Promise<StatsData> {
  const [mtd, ytd, all] = await Promise.all([
    apiFetch<StatsRow[]>(`/api/remittances/stats?from=${monthStartISO()}`),
    apiFetch<StatsRow[]>(`/api/remittances/stats?from=${yearStartISO()}`),
    apiFetch<StatsData["allTime"]>("/api/remittances/stats"),
  ]);
  const sum = (rows: StatsRow[], k: keyof StatsRow) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  return {
    allTime: all.data,
    monthToDateSent: sum(mtd.data, "totalSent"),
    yearToDateFees: sum(ytd.data, "totalFees"),
    totalCount: sum(all.data, "count"),
  };
}

interface RemittanceRow {
  id: string;
  transactionId: string;
  fromCurrency: string;
  toCurrency: string;
  fxRate: number;
  fee: number;
  service: string;
  recipientNote: string | null;
  createdAt: string;
  amount: number;
  currency: string;
  description: string;
  notes: string | null;
  date: string | number | Date;
  paymentMethod: string;
  accountId: string | null;
  isRecurring: boolean;
  recurringFrequency: string | null;
}

function monthStartISO(now = new Date()): string {
  return format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
}
function yearStartISO(now = new Date()): string {
  return format(new Date(now.getFullYear(), 0, 1), "yyyy-MM-dd");
}

export function RemittancesView({ currency }: { currency: string }) {
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<RemittanceRow | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<RemittanceRow | null>(null);
  const [page, setPage] = React.useState(1);

  const list = useSWR<ApiEnvelope<RemittanceRow[]>>(`/api/remittances?limit=${PAGE_SIZE}&page=${page}`);
  const rows = list.data?.data ?? [];
  const totalPages = Number(list.data?.meta?.totalPages ?? 1);
  const loading = list.isLoading;
  // One cache entry for the three stats calls (month, year, all time).
  const statsReq = useSWR<StatsData>("remittance-stats", loadStats);
  const stats = statsReq.data ?? null;
  const statsLoading = statsReq.isLoading;

  async function doDelete(r: RemittanceRow) {
    try {
      await apiFetch(`/api/remittances/${r.id}`, { method: "DELETE" });
      toast.success("Remittance deleted");
      await revalidateAll();
    } catch (err) {
      toast.error(errorMessage(err, "Failed to delete remittance"));
    }
  }

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(r: RemittanceRow) {
    setEditing(r);
    setFormOpen(true);
  }

  const initialForForm: RemittanceFormInitial | null = editing
    ? {
        id: editing.id,
        amount: editing.amount,
        date: new Date(editing.date as string).toISOString(),
        description: editing.description,
        notes: editing.notes,
        paymentMethod: editing.paymentMethod,
        fromCurrency: editing.fromCurrency,
        toCurrency: editing.toCurrency,
        fxRate: editing.fxRate,
        fee: editing.fee,
        service: editing.service,
        recipientNote: editing.recipientNote,
        isRecurring: editing.isRecurring,
        recurringFrequency: editing.recurringFrequency,
        accountId: editing.accountId ?? null,
      }
    : null;

  const empty = !loading && !list.error && rows.length === 0 && page === 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Remittances"
        description="International money transfers — FX rate and fee tracked for every send"
        action={
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" /> New remittance
          </Button>
        }
      />

      {list.error && !list.data ? (
        <ErrorState title="Couldn't load your transfers" onRetry={() => void revalidateAll()} />
      ) : empty ? (
        <EmptyState
          icon={<Send className="h-7 w-7" />}
          title="No transfers yet"
          description="Track international money transfers — USD → INR with exchange rate and fees, so you can audit which service gives you the best deal over time."
          action={
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" /> New remittance
            </Button>
          }
        />
      ) : (
        <>
          <RemittanceStats data={stats} currency={currency} loading={statsLoading} />

          <div className="space-y-3">
            <h2 className="font-heading text-[17px] font-[540] tracking-[-0.015em]">
              All transfers
            </h2>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <RemittanceList
                rows={rows}
                currency={currency}
                onEdit={openEdit}
                onDelete={setConfirmDelete}
              />
            )}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-1">
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
          </div>
        </>
      )}

      <RemittanceForm
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={initialForForm}
        onSaved={() => void revalidateAll()}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Delete this remittance?"
        description="This removes both the remittance record and the underlying transfer transaction. Your other data is unaffected."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (confirmDelete) await doDelete(confirmDelete);
        }}
      />
    </div>
  );
}

function RemittanceList({
  rows,
  currency,
  onEdit,
  onDelete,
}: {
  rows: RemittanceRow[];
  currency: string;
  onEdit: (r: RemittanceRow) => void;
  onDelete: (r: RemittanceRow) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-[11px] font-[600] uppercase tracking-[0.08em] text-muted-foreground">
              <th className="px-4 py-3">Date</th>
              <th className="px-3 py-3">Service</th>
              <th className="px-3 py-3">Description</th>
              <th className="px-3 py-3 hidden md:table-cell text-right">Rate</th>
              <th className="px-3 py-3 hidden lg:table-cell text-right">Fee</th>
              <th className="px-3 py-3 text-right">Amount</th>
              <th className="w-12 px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const sent = r.amount;
              const fee = r.fee;
              const rate = r.fxRate;
              const delivered = Math.max(0, (sent - fee) * rate);
              return (
                <tr
                  key={r.id}
                  className="border-b border-border/60 leading-[1.4] transition-colors last:border-b-0 hover:bg-muted"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-[13px] font-[460] text-muted-foreground">
                    {formatCivilDate(r.date, "MMM d, yyyy")}
                  </td>
                  <td className="px-3 py-3">
                    <ServiceBadge service={r.service} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-[540]">{r.description}</div>
                    {r.recipientNote && (
                      <div className="text-[12px] font-[460] text-muted-foreground">
                        to {r.recipientNote}
                      </div>
                    )}
                  </td>
                  <td className="hidden px-3 py-3 text-right text-[13px] font-[460] tabular-nums md:table-cell">
                    {formatFxRate(rate)}
                  </td>
                  <td className="hidden px-3 py-3 text-right text-[13px] font-[460] text-muted-foreground tabular-nums lg:table-cell">
                    {formatCurrency(fee, r.fromCurrency ?? currency)}
                  </td>
                  <td className={cn("px-3 py-3 text-right font-[540] tabular-nums")}>
                    <div className="flex flex-col items-end leading-tight">
                      <span>{formatCurrency(sent, r.fromCurrency ?? currency)}</span>
                      <span className="text-[11px] font-[460] text-muted-foreground">
                        ≈ {currencySymbol(r.toCurrency)}
                        {formatAmountFor(delivered, r.toCurrency)}{" "}
                        {r.toCurrency}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" aria-label={`Actions for ${r.description}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => onEdit(r)}>
                          <Pencil className="h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => onDelete(r)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
