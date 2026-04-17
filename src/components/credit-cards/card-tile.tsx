"use client";
import Link from "next/link";
import { format } from "date-fns";
import { Archive, MoreHorizontal, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatCurrency } from "@/lib/utils";

export interface CreditCardSummary {
  id: string;
  name: string;
  issuer: string;
  last4: string | null;
  creditLimit: number;
  balance: number;
  utilizationPercent: number;
  currentCycleStart: string;
  currentCycleEnd: string;
  cycleSpend: number;
  nextDueDate: string;
  minPaymentEstimate: number;
  isActive: boolean;
}

function utilBar(pct: number) {
  if (pct >= 90) return "bg-destructive";
  if (pct >= 50) return "bg-warning";
  return "bg-success";
}

export function CardTile({
  card,
  currency,
  onEdit,
  onArchive,
  onUnarchive,
}: {
  card: CreditCardSummary;
  currency: string;
  onEdit: (c: CreditCardSummary) => void;
  onArchive: (c: CreditCardSummary) => void;
  onUnarchive?: (c: CreditCardSummary) => void;
}) {
  const util = Math.max(0, Math.min(100, card.utilizationPercent));
  const cycleEnd = new Date(card.currentCycleEnd);
  const nextDue = new Date(card.nextDueDate);

  return (
    <Card
      className={cn(
        "group relative transition-colors",
        card.isActive ? "hover:border-accent/60" : "opacity-70",
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <Link
            href={`/cards/${card.id}`}
            className="flex-1 min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded-lg"
          >
            <div className="flex items-center gap-2">
              <span className="font-heading text-[17px] font-[540] leading-[1.1] tracking-[-0.015em] truncate">
                {card.name}
              </span>
              {!card.isActive && (
                <span className="inline-flex items-center rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-[600] uppercase tracking-[0.08em] text-muted-foreground">
                  Archived
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[12px] font-[460] leading-[1.3] text-muted-foreground truncate">
              {card.issuer}
              {card.last4 ? ` · ···· ${card.last4}` : ""}
            </div>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                aria-label="Card actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(card)}>
                <Pencil className="h-4 w-4" /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {card.isActive ? (
                <DropdownMenuItem onClick={() => onArchive(card)}>
                  <Archive className="h-4 w-4" /> Archive
                </DropdownMenuItem>
              ) : (
                onUnarchive && (
                  <DropdownMenuItem onClick={() => onUnarchive(card)}>
                    <Archive className="h-4 w-4" /> Unarchive
                  </DropdownMenuItem>
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Link
          href={`/cards/${card.id}`}
          className="mt-5 block outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded-lg"
        >
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-[600] uppercase tracking-[0.1em] text-muted-foreground">
              Balance
            </span>
            <span className="text-[11px] font-[600] uppercase tracking-[0.1em] text-muted-foreground">
              Limit
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-4">
            <span
              className={cn(
                "font-heading text-[28px] font-[540] leading-[1.05] tracking-[-0.022em] tabular-nums",
                card.balance > 0 ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {formatCurrency(Math.max(0, card.balance), currency)}
            </span>
            <span className="text-[13px] font-[460] text-muted-foreground tabular-nums">
              {formatCurrency(card.creditLimit, currency)}
            </span>
          </div>

          <div className="mt-3">
            <Progress value={util} indicatorClassName={utilBar(util)} />
            <div className="mt-1.5 flex items-center justify-between text-[12px] font-[460] text-muted-foreground tabular-nums">
              <span>{util.toFixed(0)}% utilization</span>
              <span>
                {formatCurrency(card.cycleSpend, currency)} this cycle
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border/60 pt-3">
            <div>
              <div className="text-[10px] font-[600] uppercase tracking-[0.08em] text-muted-foreground">
                Cycle closes
              </div>
              <div className="mt-0.5 text-[13px] font-[540] tabular-nums">
                {format(cycleEnd, "MMM d")}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-[600] uppercase tracking-[0.08em] text-muted-foreground">
                Due
              </div>
              <div className="mt-0.5 text-[13px] font-[540] tabular-nums">
                {format(nextDue, "MMM d")}
                {card.minPaymentEstimate > 0 && (
                  <span className="ml-1.5 text-[11px] font-[460] text-muted-foreground">
                    · min {formatCurrency(card.minPaymentEstimate, currency)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </Link>
      </CardContent>
    </Card>
  );
}
