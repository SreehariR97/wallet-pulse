"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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
  return (
    <Card className={cn(className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{loading ? <Skeleton className="h-64 w-full" /> : children}</CardContent>
    </Card>
  );
}
