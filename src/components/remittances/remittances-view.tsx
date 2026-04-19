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
import { cn, currencySymbol, dateFromSeconds, formatCivilDate, formatCurrency, formatFxRate } from "@/lib/utils";
import { RemittanceForm, type RemittanceFormInitial } from "./remittance-form";
import { RemittanceStats, type StatsData } from "./stats-cards";
import { ServiceBadge } from "./service-badge";

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
}

function monthStartISO(now = new Date()): string {
  return format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
}
function yearStartISO(now = new Date()): string {
  return format(new Date(now.getFullYear(), 0, 1), "yyyy-MM-dd");
}

export function RemittancesView({ currency }: { currency: string }) {
  const [rows, setRows] = React.useState<RemittanceRow[]>([]);
  const [stats, setStats] = React.useState<StatsData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [statsLoading, setStatsLoading] = React.useState(true);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<RemittanceRow | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<RemittanceRow | null>(null);

  const loadList = React.useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/remittances?limit=100");
    const json = await res.json();
    setRows(json.data ?? []);
    setLoading(false);
  }, []);

  const loadStats = React.useCallback(async () => {
    setStatsLoading(true);
    const [mtdRes, ytdRes, allRes] = await Promise.all([
      fetch(`/api/remittances/stats?from=${monthStartISO()}`),
      fetch(`/api/remittances/stats?from=${yearStartISO()}`),
      fetch(`/api/remittances/stats`),
    ]);
    const mtd = (await mtdRes.json()).data ?? [];
    const ytd = (await ytdRes.json()).data ?? [];
    const all = (await allRes.json()).data ?? [];
    const monthToDateSent = mtd.reduce(
      (s: number, r: { totalSent: number }) => s + Number(r.totalSent ?? 0),
      0,
    );
    const yearToDateFees = ytd.reduce(
      (s: number, r: { totalFees: number }) => s + Number(r.totalFees ?? 0),
      0,
    );
    const totalCount = all.reduce(
      (s: number, r: { count: number }) => s + Number(r.count ?? 0),
      0,
    );
    setStats({ allTime: all, monthToDateSent, yearToDateFees, totalCount });
    setStatsLoading(false);
  }, []);

  React.useEffect(() => {
    loadList();
    loadStats();
  }, [loadList, loadStats]);

  async function doDelete(r: RemittanceRow) {
    const res = await fetch(`/api/remittances/${r.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Failed to delete remittance");
    toast.success("Remittance deleted");
    loadList();
    loadStats();
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
        isRecurring: false,
        recurringFrequency: null,
      }
    : null;

  const empty = !loading && rows.length === 0;

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

      {empty ? (
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
          </div>
        </>
      )}

      <RemittanceForm
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={initialForForm}
        onSaved={() => {
          loadList();
          loadStats();
        }}
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
                        {delivered.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        {r.toCurrency}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" aria-label="Actions">
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
