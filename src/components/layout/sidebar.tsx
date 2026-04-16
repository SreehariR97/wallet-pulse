"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

export function Sidebar({ user }: { user: { name: string; email: string } }) {
  const pathname = usePathname();
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border/50 bg-card/30 backdrop-blur-sm md:flex">
      <div className="flex h-16 items-center gap-2 border-b border-border/50 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Wallet className="h-5 w-5" />
        </div>
        <div>
          <div className="font-heading text-sm font-bold leading-tight">WalletPulse</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">personal finance</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border/50 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="truncate text-xs text-muted-foreground">{user.email}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
