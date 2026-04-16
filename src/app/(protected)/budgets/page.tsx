import { auth } from "@/lib/auth";
import { BudgetsView } from "@/components/budgets/budgets-view";

export const dynamic = "force-dynamic";

export default async function BudgetsPage() {
  const session = await auth();
  return <BudgetsView currency={session?.user?.currency ?? "USD"} />;
}
