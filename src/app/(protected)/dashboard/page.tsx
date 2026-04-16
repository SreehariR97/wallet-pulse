import { auth } from "@/lib/auth";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  return (
    <DashboardView
      userName={session?.user?.name ?? "there"}
      currency={session?.user?.currency ?? "USD"}
    />
  );
}
