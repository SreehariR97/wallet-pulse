import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { QuickAddFab } from "@/components/transactions/quick-add-fab";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar user={session.user} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={session.user} />
        <main className="flex-1 overflow-x-hidden px-4 py-6 pb-24 md:px-8 md:pb-8">{children}</main>
      </div>
      <MobileNav />
      <QuickAddFab currency={session.user.currency ?? "USD"} />
    </div>
  );
}
