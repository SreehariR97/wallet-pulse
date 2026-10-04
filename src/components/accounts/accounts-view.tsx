"use client";
import * as React from "react";
import { ChevronDown, ChevronUp, Landmark, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useAccounts } from "@/hooks/useAccounts";
import { apiFetch, errorMessage, jsonBody, revalidateAll } from "@/lib/api-client";
import { cn, formatCurrency } from "@/lib/utils";
import type { AccountListItemDTO } from "@/types";
import { AccountForm } from "./account-form";
import { AccountTile } from "./account-tile";
import { ReconcileDialog } from "./reconcile-dialog";

export function AccountsView({ currency }: { currency: string }) {
  const list = useAccounts();
  const active = list.active;
  const archived = list.all.filter((a) => !a.isActive);
  const total = Math.round(active.reduce((s, a) => s + a.balance, 0) * 100) / 100;
  const [showArchived, setShowArchived] = React.useState(false);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AccountListItemDTO | null>(null);
  const [confirmArchive, setConfirmArchive] = React.useState<AccountListItemDTO | null>(null);
  const [reconciling, setReconciling] = React.useState<AccountListItemDTO | null>(null);

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(a: AccountListItemDTO) {
    setEditing(a);
    setFormOpen(true);
  }

  async function archive(a: AccountListItemDTO) {
    try {
      await apiFetch(`/api/accounts/${a.id}`, { method: "DELETE" });
      toast.success("Account archived");
      await revalidateAll();
    } catch (err) {
      toast.error(errorMessage(err, "Failed to archive account"));
    }
  }
  async function unarchive(a: AccountListItemDTO) {
    try {
      await apiFetch(`/api/accounts/${a.id}`, jsonBody("PATCH", { isActive: true }));
      toast.success("Account restored");
      await revalidateAll();
    } catch (err) {
      toast.error(errorMessage(err, "Failed to restore account"));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts"
        description={
          active.length > 0 ? (
            <>
              Total across active accounts:{" "}
              <span className={cn("font-[600] tabular-nums text-foreground", total < 0 && "text-destructive")}>
                {formatCurrency(total, currency, total < 0)}
              </span>
            </>
          ) : (
            "Bank accounts, cash and wallets your money moves through"
          )
        }
        action={
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" /> New account
          </Button>
        }
      />

      {list.error && !list.data ? (
        <ErrorState title="Couldn't load your accounts" onRetry={() => void list.mutate()} />
      ) : list.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      ) : list.all.length === 0 ? (
        <EmptyState
          icon={<Landmark className="h-7 w-7" />}
          title="No accounts yet"
          description="Add your checking, savings or cash to see a running balance for each and track money moving between them."
          action={
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" /> Add your first account
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {active.map((a) => (
              <AccountTile
                key={a.id}
                account={a}
                currency={currency}
                onEdit={openEdit}
                onArchive={setConfirmArchive}
                onReconcile={setReconciling}
              />
            ))}
          </div>

          {archived.length > 0 && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowArchived((s) => !s)}
                aria-expanded={showArchived}
                className="flex items-center gap-1.5 text-[12px] font-[600] uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:text-foreground transition-colors"
              >
                {showArchived ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                Archived ({archived.length})
              </button>
              {showArchived && (
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {archived.map((a) => (
                    <AccountTile
                      key={a.id}
                      account={a}
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

      <AccountForm
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        isFirst={list.all.length === 0}
        onSaved={() => void revalidateAll()}
      />
      <ReconcileDialog
        account={reconciling}
        currency={currency}
        onOpenChange={(o) => !o && setReconciling(null)}
        onSaved={() => void revalidateAll()}
      />
      <ConfirmDialog
        open={!!confirmArchive}
        onOpenChange={(o) => !o && setConfirmArchive(null)}
        title="Archive this account?"
        description="Archived accounts stay in your history and can be restored later. Transactions already on this account keep their link; new ones can't be added until you restore it."
        confirmLabel="Archive"
        onConfirm={async () => {
          if (confirmArchive) await archive(confirmArchive);
        }}
      />
    </div>
  );
}
