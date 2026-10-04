import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

/** notFound() from a protected page (e.g. someone else's transaction id). */
export default function ProtectedNotFound() {
  return (
    <EmptyState
      icon={<SearchX className="h-7 w-7" />}
      title="Not found"
      description="This item doesn't exist or was deleted."
      action={
        <Button asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      }
    />
  );
}
