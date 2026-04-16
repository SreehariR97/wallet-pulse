import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { SettingsView } from "@/components/settings/settings-view";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      currency: users.currency,
      monthlyBudget: users.monthlyBudget,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!row) redirect("/login");

  return <SettingsView initial={row} />;
}
