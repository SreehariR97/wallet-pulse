import { auth } from "@/lib/auth";
import { CardsView } from "@/components/credit-cards/cards-view";

export const dynamic = "force-dynamic";

export default async function CardsPage() {
  const session = await auth();
  return <CardsView currency={session?.user?.currency ?? "USD"} />;
}
