"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TransactionForm } from "./transaction-form";
import { cn } from "@/lib/utils";

export function QuickAddFab({ currency }: { currency: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Quick add transaction"
        className={cn(
          "fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:scale-105 hover:bg-primary/90 active:scale-95 md:bottom-6 md:right-6"
        )}
      >
        <Plus className="h-6 w-6" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Quick add</DialogTitle>
          </DialogHeader>
          <TransactionForm
            mode="create"
            currency={currency}
            showSaveAndAddAnother
            redirectOnSave={false}
            onSuccess={() => {
              setOpen(false);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
