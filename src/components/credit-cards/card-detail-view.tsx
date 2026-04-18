"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Archive,
  ArrowLeft,
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
import type { CreditCardSummary } from "./card-tile";
import type { TransactionListItem } from "@/types";
import { formatCurrency, formatUtcDay } from "@/lib/utils";

type SortKey = "date" | "amount" | "description" | "createdAt";
type SortOrder = "asc" | "desc";

interface CycleData {
  card: {
    id: string;
    name: string;
    issuer: string;
    last4: string | null;
    creditLimit: number;
    statementDay: number;
    paymentDueDay: number;
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
  const [card, setCard] = React.useState<CreditCardSummary | null>(null);
  const [cycle, setCycle] = React.useState<CycleData | null>(null);
  const [period, setPeriod] = React.useState<CyclePeriod>("current");
  const [loading, setLoading] = React.useState(true);
  const [cycleLoading, setCycleLoading] = React.useState(true);
  const [editOpen, setEditOpen] = React.useState(false);
  const [payOpen, setPayOpen] = React.useState(false);
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
        statementDay: (card as unknown as { statementDay: number }).statementDay,
        paymentDueDay: (card as unknown as { paymentDueDay: number }).paymentDueDay,
        minimumPaymentPercent: (card as unknown as { minimumPaymentPercent: number })
          .minimumPaymentPercent,
      }
    : null;

  const util = card
    ? Math.max(0, Math.min(100, card.utilizationPercent))
    : 0;

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
          </span>
        }
        action={
          <>
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
            <div>
              <div className="text-[11px] font-[600] uppercase tracking-[0.1em] text-muted-foreground">
                Balance
              </div>
              <div className="mt-1 font-heading text-[36px] font-[540] leading-[1] tracking-[-0.025em] tabular-nums">
                {formatCurrency(Math.max(0, card.balance), currency)}
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
              <div className="text-[10px] font-[600] uppercase tracking-[0.08em] text-muted-foreground">
                Cycle closes
              </div>
              <div className="mt-1 text-[17px] font-[540] tabular-nums">
                {formatUtcDay(card.currentCycleEnd)}
              </div>
              <div className="mt-0.5 text-[12px] font-[460] text-muted-foreground">
                Statement day {(card as unknown as { statementDay: number }).statementDay}
              </div>
            </div>
            <div className="md:border-l md:border-border/60 md:pl-5">
              <div className="text-[10px] font-[600] uppercase tracking-[0.08em] text-muted-foreground">
                Payment due
              </div>
              <div className="mt-1 text-[17px] font-[540] tabular-nums">
                {formatUtcDay(card.nextDueDate)}
              </div>
              {card.minPaymentEstimate > 0 && (
                <div className="mt-0.5 text-[12px] font-[460] text-muted-foreground tabular-nums">
                  Min {formatCurrency(card.minPaymentEstimate, currency)}
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

      <CardForm
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={initialForForm}
        onSaved={() => {
          loadCard();
          loadCycle();
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
