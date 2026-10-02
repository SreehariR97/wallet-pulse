import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { RemittancesView } from "@/components/remittances/remittances-view";

export const metadata: Metadata = { title: "Remittances" };

export const dynamic = "force-dynamic";

export default async function RemittancesPage() {
  const session = await auth();
  return <RemittancesView currency={session?.user?.currency ?? "USD"} />;
}
