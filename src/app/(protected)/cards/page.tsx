import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { CardsView } from "@/components/credit-cards/cards-view";

export const metadata: Metadata = { title: "Cards" };

export const dynamic = "force-dynamic";

export default async function CardsPage() {
  const session = await auth();
  return <CardsView currency={session?.user?.currency ?? "USD"} />;
}
