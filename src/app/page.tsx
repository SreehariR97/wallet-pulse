import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Wallet, TrendingUp, PieChart, Target, Shield, Zap } from "lucide-react";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-[-10%] left-[20%] h-[400px] w-[400px] rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[20%] h-[400px] w-[400px] rounded-full bg-accent/15 blur-[120px]" />
      </div>

      <header className="border-b border-border/50 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Wallet className="h-5 w-5" />
            </div>
            <span className="font-heading text-lg font-bold">WalletPulse</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/register">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4">
        <section className="py-20 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/50 bg-card/50 px-4 py-1.5 text-xs text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              Privacy-first · self-hosted · your data stays yours
            </div>
            <h1 className="font-heading text-5xl font-extrabold tracking-tight md:text-7xl">
              Your money,{" "}
              <span className="gradient-text">beautifully tracked.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
              WalletPulse is a modern personal finance tracker that lives on your own machine.
              Track every dollar, understand your spending, and hit your savings goals.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/register">Create free account</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/login">I already have an account</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="pb-24">
          <div className="grid gap-6 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-border/50 bg-card/50 p-6">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mb-2 font-heading font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/50 py-8 text-center text-sm text-muted-foreground">
        Built with Next.js · Drizzle · SQLite. Your data never leaves your machine.
      </footer>
    </div>
  );
}

const FEATURES = [
  { icon: TrendingUp, title: "Smart insights", desc: "See trends, patterns, and category breakdowns with beautiful interactive charts." },
  { icon: PieChart, title: "Full analytics", desc: "Monthly comparisons, spending heatmaps, and payment method distributions." },
  { icon: Target, title: "Budgets that stick", desc: "Set per-category or overall budgets with color-coded progress and alerts." },
  { icon: Shield, title: "Privacy-first", desc: "100% local. Your financial data lives on your machine, not in the cloud." },
  { icon: Zap, title: "Lightning fast", desc: "Built on SQLite + Next.js 14 for instant navigation and zero lag." },
  { icon: Wallet, title: "Import & export", desc: "CSV import with column mapping. Export all your data as CSV or JSON, anytime." },
];
