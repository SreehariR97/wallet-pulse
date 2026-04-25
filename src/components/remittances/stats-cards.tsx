"use client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatCurrencyAuto, formatFxRate } from "@/lib/utils";
import { serviceLabel } from "./service-badge";

export interface StatsData {
  /** Window-less per-service aggregate. Always the whole history. */
  allTime: Array<{
    service: string;
    count: number;
    totalSent: number;
    totalFees: number;
    avgFxRate: number;
    totalDelivered: number;
  }>;
  /** MTD sum across services. */
  monthToDateSent: number;
  /** YTD sum across services. */
  yearToDateFees: number;
  /** Total transfer count, used for "based on N transfers" caption. */
  totalCount: number;
}

export function RemittanceStats({
  data,
  currency,
  loading,
}: {
  data: StatsData | null;
  currency: string;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }
  if (!data) return null;

  const mtd = data.monthToDateSent;
  const ytdFees = data.yearToDateFees;
  const services = [...data.allTime].sort((a, b) => b.count - a.count);
  const primaryService = services[0];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardContent className="flex h-full flex-col justify-between p-5">
          <span className="text-[11px] font-[600] uppercase tracking-[0.1em] text-muted-foreground">
            Sent this month
          </span>
          <div
            className="mt-3 font-heading text-[24px] sm:text-[28px] md:text-[32px] font-[540] leading-[1] tracking-[-0.022em] tabular-nums"
            title={formatCurrency(mtd, currency)}
          >
            {formatCurrencyAuto(mtd, currency)}
          </div>
          <div className="mt-2 text-[12px] font-[460] text-muted-foreground">
            Month-to-date
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex h-full flex-col justify-between p-5">
          <span className="text-[11px] font-[600] uppercase tracking-[0.1em] text-muted-foreground">
            Fees this year
          </span>
          <div
            className="mt-3 font-heading text-[24px] sm:text-[28px] md:text-[32px] font-[540] leading-[1] tracking-[-0.022em] tabular-nums"
            title={formatCurrency(ytdFees, currency)}
          >
            {formatCurrencyAuto(ytdFees, currency)}
          </div>
          <div className="mt-2 text-[12px] font-[460] text-muted-foreground">
            Year-to-date across all services
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex h-full flex-col justify-between p-5">
          <span className="text-[11px] font-[600] uppercase tracking-[0.1em] text-muted-foreground">
            {services.length > 1 ? "Avg rate by service" : "Avg rate"}
          </span>
          {services.length === 0 ? (
            <div className="mt-3 font-heading text-[32px] font-[540] leading-[1] tabular-nums text-muted-foreground">
              —
            </div>
          ) : services.length === 1 && primaryService ? (
            <>
              <div className="mt-3 font-heading text-[32px] font-[540] leading-[1] tracking-[-0.022em] tabular-nums">
                {formatFxRate(primaryService.avgFxRate)}
              </div>
              <div className="mt-2 text-[12px] font-[460] text-muted-foreground">
                {serviceLabel(primaryService.service)}
                {primaryService.count === 1
                  ? " · based on 1 transfer"
                  : ` · ${primaryService.count} transfers`}
              </div>
            </>
          ) : (
            <ul className="mt-2 space-y-1.5 text-[13px] font-[460] tabular-nums">
              {services.slice(0, 4).map((s) => (
                <li key={s.service} className="flex items-center justify-between gap-3">
                  <span className="truncate text-muted-foreground">
                    {serviceLabel(s.service)}
                    <span className="ml-1.5 text-[11px]">×{s.count}</span>
                  </span>
                  <span className="font-[540] text-foreground">
                    {formatFxRate(s.avgFxRate)}
                  </span>
                </li>
              ))}
              {services.length > 4 && (
                <li className="pt-0.5 text-[11px] font-[460] text-muted-foreground">
                  +{services.length - 4} more
                </li>
              )}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
