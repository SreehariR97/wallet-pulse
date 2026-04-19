import Link from "next/link";
import { Wallet } from "lucide-react";
import { ThemeProvider } from "@/components/theme-provider";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" forcedTheme="light" enableSystem={false}>
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4 py-10">
        <Link href="/" className="mb-8 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Wallet className="h-4 w-4" />
          </div>
          <span className="font-heading text-[19px] font-[540] tracking-[-0.02em]">WalletPulse</span>
        </Link>
        {children}
      </div>
    </ThemeProvider>
  );
}
