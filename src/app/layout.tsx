import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { SessionProvider } from "@/components/session-provider";
import "@/styles/globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "WalletPulse — Personal Expense Tracking",
  description: "Privacy-first personal finance tracking. Self-hosted, beautiful, and fast.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={jakarta.variable}>
      <body className="min-h-screen bg-background font-sans antialiased">
        <SessionProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </SessionProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
