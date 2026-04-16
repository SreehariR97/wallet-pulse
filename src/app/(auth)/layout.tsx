import Link from "next/link";
import { Wallet } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-[-10%] left-[20%] h-[400px] w-[400px] rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[20%] h-[400px] w-[400px] rounded-full bg-accent/15 blur-[120px]" />
      </div>
      <Link href="/" className="mb-8 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Wallet className="h-5 w-5" />
        </div>
        <span className="font-heading text-xl font-bold">WalletPulse</span>
      </Link>
      {children}
    </div>
  );
}
