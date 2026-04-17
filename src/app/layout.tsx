import type { Metadata } from "next";
import { Inter_Tight } from "next/font/google";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { SessionProvider } from "@/components/session-provider";
import "@/styles/globals.css";

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
});

export const metadata: Metadata = {
  title: "WalletPulse — Personal Expense Tracking",
  description: "Privacy-first personal finance tracking. Self-hosted, beautiful, and fast.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={interTight.variable}>
      <body className="min-h-screen bg-background font-sans antialiased">
        <SessionProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </SessionProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
