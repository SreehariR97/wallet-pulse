"use client";
import Link from "next/link";
import { AlertTriangle, Archive, CheckCircle2, MoreHorizontal, Pencil, Scale } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatCivilDate, formatCurrency, formatCurrencyAuto } from "@/lib/utils";
import type { AccountListItemDTO } from "@/types";
import { ACCOUNT_TYPE_LABELS } from "./account-form";

export function AccountTile({
  account,
  currency,
  onEdit,
  onArchive,
  onUnarchive,
  onReconcile,
}: {
  account: AccountListItemDTO;
  currency: string;
  onReconcile?: (a: AccountListItemDTO) => void;
  onEdit: (a: AccountListItemDTO) => void;
  onArchive: (a: AccountListItemDTO) => void;
  onUnarchive?: (a: AccountListItemDTO) => void;
}) {
  const href = `/transactions?accountId=${encodeURIComponent(account.id)}`;
  const subtitle = [ACCOUNT_TYPE_LABELS[account.type], account.institution, account.last4 ? `···· ${account.last4}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card className={cn("group relative transition-colors", account.isActive ? "hover:border-accent/60" : "opacity-70")}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <Link
            href={href}
            className="flex-1 min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded-lg"
          >
            <div className="flex items-center gap-2">
              <span className="font-heading text-[17px] font-[540] leading-[1.1] tracking-[-0.015em] truncate">
                {account.name}
              </span>
              {!account.isActive && (
                <span className="inline-flex items-center rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-[600] uppercase tracking-[0.08em] text-muted-foreground">
                  Archived
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[12px] font-[460] leading-[1.3] text-muted-foreground truncate">{subtitle}</div>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
                aria-label={`Actions for ${account.name}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {account.isActive && onReconcile && (
                <DropdownMenuItem onClick={() => onReconcile(account)}>
                  <Scale className="h-4 w-4" /> Reconcile
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onEdit(account)}>
                <Pencil className="h-4 w-4" /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {account.isActive ? (
                <DropdownMenuItem onClick={() => onArchive(account)}>
                  <Archive className="h-4 w-4" /> Archive
                </DropdownMenuItem>
              ) : (
                onUnarchive && (
                  <DropdownMenuItem onClick={() => onUnarchive(account)}>
                    <Archive className="h-4 w-4" /> Unarchive
                  </DropdownMenuItem>
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Link
          href={href}
          className="mt-5 block outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded-lg"
        >
          <span className="text-[11px] font-[600] uppercase tracking-[0.1em] text-muted-foreground">Balance</span>
          <div
            className={cn(
              "mt-1 truncate font-heading text-[28px] font-[540] leading-[1.05] tracking-[-0.022em] tabular-nums",
              account.balance < 0 && "text-destructive",
            )}
            title={formatCurrency(account.balance, currency, account.balance < 0)}
          >
            {formatCurrencyAuto(account.balance, currency, { signed: account.balance < 0 })}
          </div>
          <div className="mt-3 border-t border-border/60 pt-3 text-[12px] font-[460] text-muted-foreground tabular-nums">
            {account.transactionCount === 0
              ? "No transactions yet"
              : `${account.transactionCount} transaction${account.transactionCount === 1 ? "" : "s"}`}
            {account.openingBalance !== 0 && ` · opened at ${formatCurrency(account.openingBalance, currency, account.openingBalance < 0)}`}
          </div>
          {account.reconciliation && <ReconcileStatus status={account.reconciliation} currency={currency} />}
        </Link>
      </CardContent>
    </Card>
  );
}

function ReconcileStatus({
  status,
  currency,
}: {
  status: NonNullable<AccountListItemDTO["reconciliation"]>;
  currency: string;
}) {
  const when = formatCivilDate(status.statementDate, "MMM d");
  if (status.inSync) {
    return (
      <div className="mt-1.5 flex items-center gap-1.5 text-[12px] font-[460] text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden />
        Reconciled {when}
      </div>
    );
  }
  const off = Math.round((status.balanceNow - status.statementBalance) * 100) / 100;
  return (
    <div
      className="mt-1.5 flex items-center gap-1.5 text-[12px] font-[540] text-foreground"
      title={`Your statement said ${formatCurrency(status.statementBalance, currency, status.statementBalance < 0)} on ${when}`}
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
      {formatCurrency(off, currency, true)} off the {when} statement
    </div>
  );
}
