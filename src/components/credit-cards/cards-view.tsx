"use client";
import * as React from "react";
import { ChevronDown, ChevronUp, CreditCard, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { CardForm, type CardFormInitial } from "./card-form";
import { CardTile, type CreditCardSummary } from "./card-tile";
import useSWR from "swr";
import { ErrorState } from "@/components/shared/error-state";
import { apiFetch, errorMessage, jsonBody, revalidateAll, type ApiEnvelope } from "@/lib/api-client";

export function CardsView({ currency }: { currency: string }) {
  const list = useSWR<ApiEnvelope<CreditCardSummary[]>>("/api/credit-cards?includeArchived=1");
  const rows = list.data?.data ?? [];
  const active = rows.filter((r) => r.isActive);
  const archived = rows.filter((r) => !r.isActive);
  const loading = list.isLoading;
  const [showArchived, setShowArchived] = React.useState(false);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CreditCardSummary | null>(null);
  const [confirmArchive, setConfirmArchive] = React.useState<CreditCardSummary | null>(null);


  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(c: CreditCardSummary) {
    setEditing(c);
    setFormOpen(true);
  }

  async function archive(c: CreditCardSummary) {
    try {
      await apiFetch(`/api/credit-cards/${c.id}`, { method: "DELETE" });
      toast.success("Card archived");
      await revalidateAll();
    } catch (err) {
      toast.error(errorMessage(err, "Failed to archive card"));
    }
  }
  async function unarchive(c: CreditCardSummary) {
    try {
      await apiFetch(`/api/credit-cards/${c.id}`, jsonBody("PATCH", { isActive: true }));
      toast.success("Card restored");
      await revalidateAll();
    } catch (err) {
      toast.error(errorMessage(err, "Failed to restore card"));
    }
  }

  const initialForForm: CardFormInitial | null = editing
    ? {
        id: editing.id,
        name: editing.name,
        issuer: editing.issuer,
        last4: editing.last4,
        creditLimit: editing.creditLimit,
        cycleCloseDate: editing.currentCycleCloseDate,
        paymentDueDate: editing.currentPaymentDueDate,
        minimumPaymentPercent: (editing as unknown as { minimumPaymentPercent: number })
          .minimumPaymentPercent,
      }
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cards"
        description="Balance, utilization, and statement cycles in one view"
        action={
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" /> New card
          </Button>
        }
      />

      {list.error && !list.data ? (
        <ErrorState title="Couldn't load your cards" onRetry={() => void list.mutate()} />
      ) : loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-52 w-full" />
          ))}
        </div>
      ) : active.length === 0 && archived.length === 0 ? (
        <EmptyState
          icon={<CreditCard className="h-7 w-7" />}
          title="No cards yet"
          description="Add your first credit card to track balance, utilization, and statement cycles."
          action={
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" /> Add your first card
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {active.map((c) => (
              <CardTile
                key={c.id}
                card={c}
                currency={currency}
                onEdit={openEdit}
                onArchive={setConfirmArchive}
              />
            ))}
          </div>

          {archived.length > 0 && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowArchived((s) => !s)}
                className="flex items-center gap-1.5 text-[12px] font-[600] uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:text-foreground transition-colors"
              >
                {showArchived ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                Archived ({archived.length})
              </button>
              {showArchived && (
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {archived.map((c) => (
                    <CardTile
                      key={c.id}
                      card={c}
                      currency={currency}
                      onEdit={openEdit}
                      onArchive={() => {}}
                      onUnarchive={unarchive}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <CardForm
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={initialForForm}
        onSaved={() => void revalidateAll()}
      />
      <ConfirmDialog
        open={!!confirmArchive}
        onOpenChange={(o) => !o && setConfirmArchive(null)}
        title="Archive this card?"
        description="Archived cards stay in your history and can be restored later. Transactions already tagged to this card keep their link."
        confirmLabel="Archive"
        onConfirm={async () => {
          if (confirmArchive) await archive(confirmArchive);
        }}
      />
    </div>
  );
}
