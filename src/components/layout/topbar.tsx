"use client";
import * as React from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Plus, LogOut, Moon, Sun, Wallet } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel } from "@/components/ui/dropdown-menu";

export function Topbar({ user }: { user: { name: string; email: string } }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur-md md:px-8">
      <div className="flex items-center gap-2 md:hidden">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Wallet className="h-4 w-4" />
        </div>
        <span className="font-heading text-[15px] font-[540] tracking-[-0.015em]">WalletPulse</span>
      </div>
      <div className="hidden md:block" />
      <div className="flex items-center gap-2">
        <Button size="sm" asChild>
          <Link href="/transactions/new">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add transaction</span>
          </Link>
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Toggle theme"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {mounted ? (
            theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4 opacity-0" />
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" aria-label="Account menu">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-[600] text-accent-foreground">
                {user.name.charAt(0).toUpperCase()}
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="text-sm font-[540]">{user.name}</div>
              <div className="text-xs font-[460] text-muted-foreground">{user.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => signOut({ callbackUrl: "/" })} className="text-destructive">
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
