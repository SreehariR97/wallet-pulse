import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { CardDetailView } from "@/components/credit-cards/card-detail-view";

export const metadata: Metadata = { title: "Card" };

export const dynamic = "force-dynamic";

export default async function CardDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  return <CardDetailView cardId={params.id} currency={session?.user?.currency ?? "USD"} />;
}
