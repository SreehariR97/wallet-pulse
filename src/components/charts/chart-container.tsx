"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import * as React from "react";

export function ChartCard({
  title,
  description,
  children,
  className,
  action,
  loading,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
  loading?: boolean;
}) {
  const titleId = React.useId();
  return (
    <Card className={cn(className)} role="region" aria-labelledby={titleId} aria-busy={loading || undefined}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle id={titleId} className="text-[17px] font-[540] tracking-[-0.015em]">{title}</CardTitle>
          {description && <p className="mt-0.5 text-[12px] font-[460] text-muted-foreground">{description}</p>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{loading ? <Skeleton className="h-64 w-full" /> : children}</CardContent>
    </Card>
  );
}
