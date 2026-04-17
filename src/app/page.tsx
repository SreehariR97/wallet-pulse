import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Wallet, TrendingUp, PieChart, Target, Shield, Zap } from "lucide-react";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-background">
      <section className="hero-gradient relative overflow-hidden text-white">
        <header className="relative z-10 border-b border-white/10">
          <div className="container mx-auto flex h-16 items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Wallet className="h-4 w-4" />
              </div>
              <span className="font-heading text-[17px] font-[540] tracking-[-0.02em] text-white">WalletPulse</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" asChild className="text-white/90 hover:bg-white/10 hover:text-white">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/register">Get started</Link>
              </Button>
            </div>
          </div>
        </header>

        <div className="container mx-auto px-4 py-24 md:py-36">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-8 inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-1 text-[13px] font-[460] text-white/80 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Privacy-first · self-hosted · your data stays yours
            </div>
            <h1 className="font-heading text-5xl font-[540] leading-[0.96] tracking-[-0.028em] text-white/95 md:text-7xl">
              Your money,<br />
              <span className="text-accent">beautifully tracked.</span>
            </h1>
            <p className="mx-auto mt-8 max-w-xl text-[17px] font-[460] leading-[1.5] text-white/75">
              WalletPulse is a modern personal finance tracker that lives on your own machine.
              Track every dollar, understand your spending, and hit your savings goals.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" variant="secondary" asChild>
                <Link href="/register">Create free account</Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
                <Link href="/login">I already have an account</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <main className="container mx-auto px-4">
        <section className="py-20 md:py-28">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <h2 className="font-heading text-4xl font-[460] leading-[0.96] tracking-[-0.028em] text-foreground md:text-5xl">
              Everything you need.<br />
              Nothing you don&apos;t.
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-border bg-card p-7">
                <div className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <f.icon className="h-4 w-4" />
                </div>
                <h3 className="mb-2 font-heading text-[20px] font-[540] leading-[1.1] tracking-[-0.015em] text-foreground">{f.title}</h3>
                <p className="text-[15px] font-[460] leading-[1.5] text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-10 text-center text-sm font-[460] text-muted-foreground">
        Built with Next.js · Drizzle · Postgres. Your data, your database.
      </footer>
    </div>
  );
}

const FEATURES = [
  { icon: TrendingUp, title: "Smart insights", desc: "See trends, patterns, and category breakdowns with beautiful interactive charts." },
  { icon: PieChart, title: "Full analytics", desc: "Monthly comparisons, spending heatmaps, and payment method distributions." },
  { icon: Target, title: "Budgets that stick", desc: "Set per-category or overall budgets with color-coded progress and alerts." },
  { icon: Shield, title: "Privacy-first", desc: "100% local. Your financial data lives on your machine, not in the cloud." },
  { icon: Zap, title: "Lightning fast", desc: "Built on Postgres + Next.js 14 for instant navigation and zero lag." },
  { icon: Wallet, title: "Import & export", desc: "CSV import with column mapping. Export all your data as CSV or JSON, anytime." },
];
