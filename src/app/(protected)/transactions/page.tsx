import { auth } from "@/lib/auth";
import { TransactionsView } from "@/components/transactions/transactions-view";

export default async function TransactionsPage() {
  const session = await auth();
  return <TransactionsView currency={session?.user?.currency ?? "USD"} />;
}
