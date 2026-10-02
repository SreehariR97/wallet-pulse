"use client";
import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/error-state";

/**
 * A render error in one page keeps the sidebar and navigation usable
 * instead of white-screening the whole app.
 */
export default function ProtectedError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-10">
      <ErrorState
        title="This page hit a problem"
        description={
          error.digest
            ? `Something went wrong while showing this page. Reference: ${error.digest}`
            : "Something went wrong while showing this page. Your data is safe."
        }
        onRetry={reset}
      />
      <div className="mt-4 flex justify-center">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
