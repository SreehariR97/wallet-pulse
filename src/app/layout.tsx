import type { Metadata } from "next";
import { Inter_Tight } from "next/font/google";
import { Toaster } from "sonner";
import { SessionProvider } from "@/components/session-provider";
import "@/styles/globals.css";

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
});

export const metadata: Metadata = {
  // Pages export `metadata = { title: "Budgets" }` → "Budgets · WalletPulse".
  title: { default: "WalletPulse — Personal Expense Tracking", template: "%s · WalletPulse" },
  description: "Privacy-first personal finance tracking. Self-hosted, beautiful, and fast.",
  ...(process.env.NEXTAUTH_URL ? { metadataBase: new URL(process.env.NEXTAUTH_URL) } : {}),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={interTight.variable}>
      <body className="min-h-screen bg-background font-sans antialiased">
        <SessionProvider>
          {children}
        </SessionProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
