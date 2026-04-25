"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  MoreHorizontal,
  Pencil,
  Receipt,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
import { ChartCard } from "@/components/charts/chart-container";
import { CategoryDonut, type CategorySlice } from "@/components/charts/category-donut";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { CardForm, type CardFormInitial } from "./card-form";
import { CyclePicker, type CyclePeriod } from "./cycle-picker";
import { PayCardDialog } from "./pay-card-dialog";
import { MarkStatementIssuedDialog, type MarkStatementIssuedInitial } from "./mark-statement-issued-dialog";
import { CycleHistoryList } from "./cycle-history-list";
import type { CreditCardDetailDTO, CreditCardCycleRowDTO, TransactionListItem } from "@/types";
import { formatCurrency, formatCurrencyAuto, formatUtcDay } from "@/lib/utils";

type SortKey = "date" | "amount" | "description" | "createdAt";
type SortOrder = "asc" | "desc";

interface CycleData {
  card: {
    id: string;
    name: string;
    issuer: string;
    last4: string | null;
    creditLimit: number;
  };
  offset: number;
  start: string;
  end: string;
  totalExpense: number;
  totalPayments: number;
  count: number;
  categoryBreakdown: CategorySlice[];
  transactions: TransactionListItem[];
}

function utilBar(pct: number) {
  if (pct >= 90) return "bg-destructive";
  if (pct >= 50) return "bg-warning";
  return "bg-success";
}

export function CardDetailView({
  cardId,
  currency,
}: {
  cardId: string;
  currency: string;
}) {
  const router = useRouter();
  const [card, setCard] = React.useState<CreditCardDetailDTO | null>(null);
  const [cycle, setCycle] = React.useState<CycleData | null>(null);
  const [cycleRows, setCycleRows] = React.useState<CreditCardCycleRowDTO[]>([]);
  const [period, setPeriod] = React.useState<CyclePeriod>("current");
  const [loading, setLoading] = React.useState(true);
  const [cycleLoading, setCycleLoading] = React.useState(true);
  const [editOpen, setEditOpen] = React.useState(false);
  const [payOpen, setPayOpen] = React.useState(false);
  const [markIssuedInitial, setMarkIssuedInitial] =
    React.useState<MarkStatementIssuedInitial | null>(null);
  const [confirmArchive, setConfirmArchive] = React.useState(false);
  const [sort, setSort] = React.useState<SortKey>("date");
  const [order, setOrder] = React.useState<SortOrder>("desc");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const loadCard = React.useCallback(async () => {
    const res = await fetch(`/api/credit-cards/${cardId}`);
    if (res.status === 404) {
      router.replace("/cards");
      return;
    }
    const json = await res.json();
    setCard(json.data);
    setLoading(false);
  }, [cardId, router]);

  const loadCycleHistory = React.useCallback(async () => {
    const res = await fetch(`/api/credit-cards/${cardId}/cycles`);
    if (!res.ok) return;
    const json = await res.json();
    setCycleRows(json.data);
  }, [cardId]);

  const loadCycle = React.useCallback(async () => {
    setCycleLoading(true);
    const res = await fetch(`/api/credit-cards/${cardId}/cycle?period=${period}`);
    if (!res.ok) {
      setCycleLoading(false);
      return;
    }
    const json = await res.json();
    setCycle(json.data);
    setCycleLoading(false);
    setSelected(new Set());
  }, [cardId, period]);

  React.useEffect(() => {
    loadCard();
  }, [loadCard]);

  React.useEffect(() => {
    loadCycle();
  }, [loadCycle]);

  React.useEffect(() => {
    loadCycleHistory();
  }, [loadCycleHistory]);

  async function archive(): Promise<void> {
    const res = await fetch(`/api/credit-cards/${cardId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to archive card");
      return;
    }
    toast.success("Card archived");
    router.push("/cards");
  }

  async function unarchive() {
    const res = await fetch(`/api/credit-cards/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: true }),
    });
    if (!res.ok) return toast.error("Failed to restore card");
    toast.success("Card restored");
    loadCard();
  }

  function handleSort(k: SortKey) {
    if (k === sort) setOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSort(k);
      setOrder("desc");
    }
  }

  const initialForForm: CardFormInitial | null = card
    ? {
        id: card.id,
        name: card.name,
        issuer: card.issuer,
        last4: card.last4,
        creditLimit: card.creditLimit,
        // Phase 5: seed civil dates directly from the current cycle row
        // (detail DTO exposes these as ISO-at-boundary strings).
        cycleCloseDate: card.currentCycleEnd.slice(0, 10),
        paymentDueDate: card.nextDueDate.slice(0, 10),
        minimumPaymentPercent: card.minimumPaymentPercent,
      }
    : null;

  function openMarkIssuedFromHeader() {
    if (!card || !card.currentCycleId) return;
    setMarkIssuedInitial({
      cardId: card.id,
      cycleId: card.currentCycleId,
      cycleCloseDate: card.currentCycleEnd.slice(0, 10),
      paymentDueDate: card.nextDueDate.slice(0, 10),
    });
  }

  function openMarkIssuedFromHistory(row: CreditCardCycleRowDTO) {
    setMarkIssuedInitial({
      cardId: row.cardId,
      cycleId: row.id,
      cycleCloseDate: row.cycleCloseDate,
      paymentDueDate: row.paymentDueDate,
    });
  }

  const util = card
    ? Math.max(0, Math.min(100, card.utilizationPercent))
    : 0;

  // Phase 4: compact payoff-status chip for the header. Uses the current
  // cycle row (matched on id) from the already-fetched cycle history; no
  // extra round-trip needed. Projected cycles don't emit a chip because
  // "carrying/paid" questions are meaningless until the statement is issued.
  const currentCycleRow = React.useMemo(
    () => cycleRows.find((r) => r.id === card?.currentCycleId) ?? null,
    [cycleRows, card?.currentCycleId],
  );
  const headerStatus = React.useMemo((): {
    label: string;
    tone: "success" | "destructive" | "muted";
  } | null => {
    if (!card || !currentCycleRow || currentCycleRow.isProjected) return null;
    if (currentCycleRow.statementBalance === null) return null;
    const remaining = Math.max(
      0,
      currentCycleRow.statementBalance - currentCycleRow.amountPaid,
    );
    if (remaining < 0.005) return { label: "Paid in full", tone: "success" };
    const today = new Date();
    const todayStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;
    if (todayStr > currentCycleRow.paymentDueDate) {
      return {
        label: `${formatCurrency(remaining, currency)} past due`,
        tone: "destructive",
      };
    }
    return {
      label: `Carrying ${formatCurrency(remaining, currency)}`,
      tone: "muted",
    };
  }, [card, currentCycleRow, currency]);

  const activeRange = cycle
    ? { start: new Date(cycle.start), end: new Date(cycle.end) }
    : undefined;

  // Client-side sorting for the cycle view. Cheap — cycle windows rarely
  // exceed a few hundred rows for one card in one month, so re-fetching
  // just to sort would be gratuitous.
  const sortedTxs = React.useMemo(() => {
    if (!cycle) return [] as TransactionListItem[];
    const arr = [...cycle.transactions];
    arr.sort((a, b) => {
      const ax =
        sort === "amount"
          ? a.amount
          : sort === "description"
            ? a.description
            : sort === "createdAt"
              ? new Date(a.createdAt as string | number | Date).getTime()
              : String(a.date);
      const bx =
        sort === "amount"
          ? b.amount
          : sort === "description"
            ? b.description
            : sort === "createdAt"
              ? new Date(b.createdAt as string | number | Date).getTime()
              : String(b.date);
      if (ax < bx) return order === "asc" ? -1 : 1;
      if (ax > bx) return order === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [cycle, sort, order]);

  if (loading || !card) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const cycleEmpty = cycle != null && cycle.count === 0;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/cards"
          className="inline-flex items-center gap-1.5 text-[12px] font-[540] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All cards
        </Link>
      </div>

      <PageHeader
        title={card.name}
        description={
          <span className="inline-flex items-center gap-2">
            <span>{card.issuer}</span>
            {card.last4 && (
              <>
                <span aria-hidden>·</span>
                <span className="tabular-nums">···· {card.last4}</span>
              </>
            )}
            {!card.isActive && (
              <span className="inline-flex items-center rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-[600] uppercase tracking-[0.08em] text-muted-foreground">
                Archived
              </span>
            )}
            {headerStatus && (
              <span
                className={
                  headerStatus.tone === "success"
                    ? "inline-flex items-center rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-[600] uppercase tracking-[0.08em] text-emerald-600 dark:text-emerald-400"
                    : headerStatus.tone === "destructive"
                      ? "inline-flex items-center rounded-md bg-destructive/15 px-1.5 py-0.5 text-[10px] font-[600] uppercase tracking-[0.08em] text-destructive"
                      : "inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-[600] uppercase tracking-[0.08em] text-muted-foreground"
                }
              >
                {headerStatus.label}
              </span>
            )}
          </span>
        }
        action={
          <>
            {card.isActive && card.currentIsProjected && card.currentCycleId && (
              <Button variant="outline" onClick={openMarkIssuedFromHeader}>
                <CheckCircle2 className="h-4 w-4" /> Mark statement issued
              </Button>
            )}
            {card.isActive && (
              <Button onClick={() => setPayOpen(true)}>
                <CreditCard className="h-4 w-4" /> Pay card
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Card actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4" /> Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {card.isActive ? (
                  <DropdownMenuItem onSelect={() => setConfirmArchive(true)}>
                    <Archive className="h-4 w-4" /> Archive
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={unarchive}>
                    <RotateCcw className="h-4 w-4" /> Unarchive
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {/* Balance + utilization summary card */}
      <Card>
        <CardContent className="p-5">
          <div className="grid gap-5 md:grid-cols-[1.4fr_1fr_1fr] md:items-center">
            <div className="min-w-0">
              <div className="text-[11px] font-[600] uppercase tracking-[0.1em] text-muted-foreground">
                Balance
              </div>
              <div
                className="mt-1 font-heading text-[28px] sm:text-[32px] md:text-[36px] font-[540] leading-[1] tracking-[-0.025em] tabular-nums"
                title={formatCurrency(Math.max(0, card.balance), currency)}
              >
                {formatCurrencyAuto(Math.max(0, card.balance), currency)}
              </div>
              <div className="mt-3 space-y-1.5">
                <Progress value={util} indicatorClassName={utilBar(util)} />
                <div className="flex items-center justify-between text-[12px] font-[460] text-muted-foreground tabular-nums">
                  <span>{util.toFixed(0)}% utilization</span>
                  <span>{formatCurrency(card.creditLimit, currency)} limit</span>
                </div>
              </div>
            </div>
            <div className="md:border-l md:border-border/60 md:pl-5">
              <div className="flex items-center gap-1.5">
                <div className="text-[10px] font-[600] uppercase tracking-[0.08em] text-muted-foreground">
                  Cycle closes
                </div>
                {card.currentIsProjected && (
                  <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-[600] uppercase tracking-[0.08em] text-muted-foreground">
                    Projected
                  </span>
                )}
              </div>
              <div className="mt-1 text-[17px] font-[540] tabular-nums">
                {formatUtcDay(card.currentCycleEnd)}
              </div>
            </div>
            <div className="md:border-l md:border-border/60 md:pl-5">
              <div className="text-[10px] font-[600] uppercase tracking-[0.08em] text-muted-foreground">
                Payment due
              </div>
              <div className="mt-1 text-[17px] font-[540] tabular-nums">
                {formatUtcDay(card.nextDueDate)}
              </div>
              {card.currentStatementBalance !== null ? (
                <div className="mt-0.5 text-[12px] font-[460] text-muted-foreground tabular-nums">
                  Statement balance{" "}
                  {formatCurrency(card.currentStatementBalance, currency)}
                </div>
              ) : null}
              {(card.currentMinimumPayment !== null || card.minPaymentEstimate > 0) && (
                <div className="mt-0.5 text-[12px] font-[460] text-muted-foreground tabular-nums">
                  Min{" "}
                  {formatCurrency(
                    card.currentMinimumPayment ?? card.minPaymentEstimate,
                    currency,
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cycle picker + totals */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <CyclePicker value={period} onChange={setPeriod} range={activeRange} />
        <div className="flex items-center gap-5 text-[13px] font-[460] tabular-nums">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] font-[600] uppercase tracking-[0.08em] text-muted-foreground">
              Spent
            </span>
            <span className="font-[540]">
              {formatCurrency(cycle?.totalExpense ?? 0, currency)}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] font-[600] uppercase tracking-[0.08em] text-muted-foreground">
              Paid
            </span>
            <span className="font-[540] text-success">
              {formatCurrency(cycle?.totalPayments ?? 0, currency)}
            </span>
          </div>
        </div>
      </div>

      {/* Donut slot — category breakdown OR empty state (no activity) */}
      {cycleLoading ? (
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      ) : cycleEmpty ? (
        <EmptyState
          icon={<Receipt className="h-7 w-7" />}
          title={
            period === "current" ? "Nothing on this cycle yet" : "No activity in the previous cycle"
          }
          description={
            cycle
              ? period === "current"
                ? `Transactions tagged to ${card.name} dated ${formatUtcDay(cycle.start)}–${formatUtcDay(cycle.end)} will show up here.`
                : `This card had no transactions between ${formatUtcDay(cycle.start)} and ${formatUtcDay(cycle.end)}.`
              : undefined
          }
        />
      ) : (
        <ChartCard
          title="Spending by category"
          description="Expenses tagged to this card within the selected cycle"
        >
          <CategoryDonut data={cycle!.categoryBreakdown} currency={currency} />
        </ChartCard>
      )}

      {/* Transactions list — hidden entirely when cycle is empty (per stage 4.2 spec) */}
      {!cycleLoading && !cycleEmpty && cycle && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-[17px] font-[540] tracking-[-0.015em]">
              Transactions
            </h2>
            <span className="text-[12px] font-[460] text-muted-foreground tabular-nums">
              {cycle.count} {cycle.count === 1 ? "entry" : "entries"}
            </span>
          </div>
          <TransactionTable
            items={sortedTxs}
            currency={currency}
            sort={sort}
            order={order}
            onSort={handleSort}
            selected={selected}
            onToggleSelect={(id) => {
              setSelected((s) => {
                const next = new Set(s);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
            }}
            onToggleSelectAll={(all) => {
              if (all) setSelected(new Set(cycle.transactions.map((t) => t.id)));
              else setSelected(new Set());
            }}
            onDeleted={() => {
              loadCycle();
              loadCard();
            }}
          />
        </div>
      )}

      <CycleHistoryList
        cycles={cycleRows}
        currency={currency}
        onMarkIssued={openMarkIssuedFromHistory}
      />

      <CardForm
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={initialForForm}
        onSaved={() => {
          loadCard();
          loadCycle();
          loadCycleHistory();
        }}
      />
      <PayCardDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        currency={currency}
        presetCardId={cardId}
        onSaved={() => {
          loadCard();
          loadCycle();
          loadCycleHistory();
        }}
      />
      <MarkStatementIssuedDialog
        open={markIssuedInitial !== null}
        onOpenChange={(o) => {
          if (!o) setMarkIssuedInitial(null);
        }}
        initial={markIssuedInitial}
        onSaved={() => {
          loadCard();
          loadCycleHistory();
        }}
      />
      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title="Archive this card?"
        description="Archived cards stay in your history and can be restored later. Transactions already tagged to this card keep their link."
        confirmLabel="Archive"
        onConfirm={archive}
      />
    </div>
  );
}
