"use client";
import * as React from "react";
import { Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import dynamic from "next/dynamic";

// The button is on every page; the three forms behind it load on first use.
const TransactionForm = dynamic(() => import("./transaction-form").then((m) => m.TransactionForm), { ssr: false });
const PayCardDialog = dynamic(() => import("@/components/credit-cards/pay-card-dialog").then((m) => m.PayCardDialog), {
  ssr: false,
});
const RemittanceForm = dynamic(() => import("@/components/remittances/remittance-form").then((m) => m.RemittanceForm), {
  ssr: false,
});
import { cn } from "@/lib/utils";
import { revalidateAll } from "@/lib/api-client";
import type { TxType } from "@/types";

type QuickAction =
  | { kind: "tx"; type: TxType }
  | { kind: "payCard" }
  | { kind: "sendMoney" };

export function QuickAddFab({ currency }: { currency: string }) {
  const [action, setAction] = React.useState<QuickAction | null>(null);

  const txInitial = action?.kind === "tx" ? { type: action.type } : undefined;
  const txOpen = action?.kind === "tx";
  const payOpen = action?.kind === "payCard";
  const sendMoneyOpen = action?.kind === "sendMoney";

  // Every page reads through the SWR cache, so a write here has to refresh
  // it — router.refresh() alone never reached the client-fetched views.
  function close() {
    setAction(null);
    void revalidateAll();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Quick add"
            className={cn(
              "fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:scale-105 hover:bg-primary/90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:bottom-6 md:right-6",
            )}
          >
            <Plus className="h-6 w-6" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="end"
          sideOffset={8}
          className="w-44"
        >
          <DropdownMenuItem onSelect={() => setAction({ kind: "tx", type: "expense" })}>
            Expense
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setAction({ kind: "tx", type: "income" })}>
            Income
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Loan</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuItem onSelect={() => setAction({ kind: "tx", type: "loan_given" })}>
                  Loan given
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setAction({ kind: "tx", type: "loan_taken" })}>
                  Loan taken
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setAction({ kind: "tx", type: "repayment_received" })}>
                  Repayment in
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setAction({ kind: "tx", type: "repayment_made" })}>
                  Repayment out
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Transfer</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuItem onSelect={() => setAction({ kind: "payCard" })}>
                  Pay card
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setAction({ kind: "sendMoney" })}>
                  Send money
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={txOpen} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Quick add</DialogTitle>
          </DialogHeader>
          <TransactionForm
            mode="create"
            currency={currency}
            initial={txInitial}
            showSaveAndAddAnother
            redirectOnSave={false}
            onSuccess={(_tx, { addAnother }) => {
              // "Save & add another" keeps the dialog open; the form resets itself.
              if (!addAnother) close();
            }}
            onCancel={() => setAction(null)}
          />
        </DialogContent>
      </Dialog>

      {/* Mounted only when chosen, so their code isn't fetched up front. */}
      {payOpen && (
        <PayCardDialog open onOpenChange={(o) => !o && setAction(null)} currency={currency} onSaved={close} />
      )}

      {sendMoneyOpen && (
        <RemittanceForm open onOpenChange={(o) => !o && setAction(null)} initial={null} onSaved={close} />
      )}
    </>
  );
}
