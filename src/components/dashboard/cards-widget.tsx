"use client";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn, formatCurrency, formatCivilDate } from "@/lib/utils";
import type { CreditCardSummary } from "@/components/credit-cards/card-tile";

function utilBar(pct: number) {
  if (pct >= 90) return "bg-destructive";
  if (pct >= 50) return "bg-warning";
  return "bg-success";
}

/**
 * Dashboard-only mini tile for a credit card. Rendered by CardsWidget
 * only when the user has at least one active card — the dashboard is
 * for signal, not onboarding (see stage 5 spec).
 */
export function CardsWidget({
  cards,
  currency,
}: {
  cards: CreditCardSummary[];
  currency: string;
}) {
  if (cards.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-heading text-[17px] font-[540] tracking-[-0.015em]">
          Credit cards
        </h2>
        <Link
          href="/cards"
          className="text-[12px] font-[540] text-muted-foreground hover:text-foreground transition-colors"
        >
          Manage →
        </Link>
      </div>
      <div
        className={cn(
          "grid gap-3",
          cards.length === 1 ? "md:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        )}
      >
        {cards.map((c) => {
          const util = Math.max(0, Math.min(100, c.utilizationPercent));
          return (
            <Link
              key={c.id}
              href={`/cards/${c.id}`}
              className="group rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <Card className="transition-colors group-hover:border-accent/50">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-[540] leading-[1.1] tracking-[-0.01em]">
                        {c.name}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] font-[460] text-muted-foreground">
                        {c.issuer}
                        {c.last4 ? ` · ···· ${c.last4}` : ""}
                      </div>
                    </div>
                    <span className="inline-flex items-center rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-[600] uppercase tracking-[0.06em] text-muted-foreground tabular-nums">
                      Due {formatCivilDate(c.currentPaymentDueDate, "MMM d")}
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between gap-2">
                    <span className="font-heading text-[22px] font-[540] leading-[1.05] tracking-[-0.02em] tabular-nums">
                      {formatCurrency(Math.max(0, c.balance), currency)}
                    </span>
                    <span className="text-[11px] font-[460] text-muted-foreground tabular-nums">
                      {util.toFixed(0)}%
                    </span>
                  </div>
                  <div className="mt-2">
                    {util > 0 ? (
                      <Progress value={util} indicatorClassName={utilBar(util)} className="h-1.5" />
                    ) : (
                      <div className="h-1.5" />
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
