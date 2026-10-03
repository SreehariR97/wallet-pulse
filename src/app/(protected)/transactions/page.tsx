import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { TransactionsView } from "@/components/transactions/transactions-view";

export const metadata: Metadata = { title: "Transactions" };

export default async function TransactionsPage() {
  const session = await auth();
  return <TransactionsView currency={session?.user?.currency ?? "USD"} />;
}
