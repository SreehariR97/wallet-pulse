import { auth } from "@/lib/auth";
import { AnalyticsView } from "@/components/analytics/analytics-view";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const session = await auth();
  return <AnalyticsView currency={session?.user?.currency ?? "USD"} />;
}
