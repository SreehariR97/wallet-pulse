"use client";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Shown in place of data when a request failed, so it never reads as "empty". */
export function ErrorState({
  title = "Couldn't load this",
  description = "Something went wrong talking to the server. Your data is safe.",
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center",
        className,
      )}
    >
      <AlertTriangle className="mb-3 h-6 w-6 text-destructive" aria-hidden />
      <h3 className="font-heading text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RotateCw className="h-4 w-4" aria-hidden /> Try again
        </Button>
      )}
    </div>
  );
}
