"use client";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatCurrency, formatCurrencyAuto } from "@/lib/utils";
import { ACCOUNT_TYPE_LABELS } from "@/components/accounts/account-form";
import type { AccountListItemDTO } from "@/types";

/** Dashboard row of account balances. Hidden until the user adds one. */
export function AccountsWidget({ accounts, currency }: { accounts: AccountListItemDTO[]; currency: string }) {
  if (accounts.length === 0) return null;
  const total = Math.round(accounts.reduce((s, a) => s + a.balance, 0) * 100) / 100;

  return (
    <section className="space-y-3" aria-labelledby="dash-accounts">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="dash-accounts" className="font-heading text-[17px] font-[540] tracking-[-0.015em]">
          Accounts
          <span className={cn("ml-2 text-[13px] font-[460] text-muted-foreground tabular-nums", total < 0 && "text-destructive")}>
            {formatCurrency(total, currency, total < 0)} total
          </span>
        </h2>
        <Link href="/accounts" className="text-[12px] font-[540] text-muted-foreground hover:text-foreground transition-colors">
          Manage →
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {accounts.map((a) => (
          <Link
            key={a.id}
            href={`/transactions?accountId=${encodeURIComponent(a.id)}`}
            className="group rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <Card className="transition-colors group-hover:border-accent/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-[540] leading-[1.1] tracking-[-0.01em]">{a.name}</span>
                  {a.reconciliation && !a.reconciliation.inSync && (
                    <AlertTriangle
                      className="h-3.5 w-3.5 shrink-0 text-warning"
                      role="img"
                      aria-label="Doesn't match the last statement"
                    />
                  )}
                </div>
                <div className="mt-0.5 truncate text-[11px] font-[460] text-muted-foreground">
                  {ACCOUNT_TYPE_LABELS[a.type]}
                  {a.institution ? ` · ${a.institution}` : ""}
                </div>
                <div
                  className={cn(
                    "mt-3 truncate font-heading text-[22px] font-[540] leading-[1.05] tracking-[-0.02em] tabular-nums",
                    a.balance < 0 && "text-destructive",
                  )}
                  title={formatCurrency(a.balance, currency, a.balance < 0)}
                >
                  {formatCurrencyAuto(a.balance, currency, { signed: a.balance < 0 })}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
