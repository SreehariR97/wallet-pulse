import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { AccountsView } from "@/components/accounts/accounts-view";

export const metadata: Metadata = { title: "Accounts" };

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const session = await auth();
  return <AccountsView currency={session?.user?.currency ?? "USD"} />;
}
