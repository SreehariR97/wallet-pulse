import Link from "next/link";
import { Check, X, Github, Shield, Database, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

/* ─────────────────────────────────────────────
   ComparisonTable
───────────────────────────────────────────── */

const TABLE_ROWS = [
  { feature: "Cost", walletpulse: "Free forever", mint: "Sunset 2023", ynab: "$109 / yr" },
  { feature: "Your data stays yours", walletpulse: true, mint: false, ynab: false },
  { feature: "Self-hostable", walletpulse: true, mint: false, ynab: false },
  { feature: "Open source", walletpulse: true, mint: false, ynab: false },
  { feature: "Credit-card cycle tracking", walletpulse: true, mint: false, ynab: false },
  { feature: "International remittances", walletpulse: true, mint: false, ynab: false },
  { feature: "Loan tracking", walletpulse: true, mint: false, ynab: false },
  { feature: "No bank linking required", walletpulse: true, mint: false, ynab: false },
  { feature: "Zero third-party trackers", walletpulse: true, mint: false, ynab: false },
];

type RowValue = boolean | string;

function Cell({ val, highlight }: { val: RowValue; highlight?: boolean }) {
  if (typeof val === "boolean") {
    return val ? (
      <td className={`px-4 py-3 text-center ${highlight ? "bg-accent/5" : ""}`}>
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-success/15 text-success">
          <Check className="h-3 w-3" />
        </span>
      </td>
    ) : (
      <td className="px-4 py-3 text-center">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-destructive/15 text-destructive/80">
          <X className="h-3 w-3" />
        </span>
      </td>
    );
  }
  return (
    <td className={`px-4 py-3 text-center text-[13px] font-[460] ${highlight ? "bg-accent/5 font-[540] text-foreground" : "text-muted-foreground"}`}>
      {val}
    </td>
  );
}

export function ComparisonTable() {
  return (
    <section className="py-20 md:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="font-heading text-4xl font-[540] leading-[0.96] tracking-[-0.028em] text-foreground md:text-5xl">
            Stop renting your finance app.
          </h2>
          <p className="mt-5 text-[17px] font-[460] leading-[1.5] text-muted-foreground">
            Mint sunsetted. YNAB costs $109 / year and keeps your data on their servers.
            WalletPulse is free, open source, and lives in your own database — forever.
          </p>
        </div>

        <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-left text-[12px] font-[600] uppercase tracking-[0.08em] text-muted-foreground">
                  Feature
                </th>
                <th className="bg-accent/5 px-4 py-3 text-center text-[12px] font-[600] uppercase tracking-[0.08em] text-accent">
                  WalletPulse
                </th>
                <th className="px-4 py-3 text-center text-[12px] font-[600] uppercase tracking-[0.08em] text-muted-foreground">
                  Mint
                </th>
                <th className="px-4 py-3 text-center text-[12px] font-[600] uppercase tracking-[0.08em] text-muted-foreground">
                  YNAB
                </th>
              </tr>
            </thead>
            <tbody>
              {TABLE_ROWS.map((row, i) => (
                <tr key={row.feature} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                  <td className="px-4 py-3 text-[13px] font-[460] text-foreground">
                    {row.feature}
                  </td>
                  <Cell val={row.walletpulse} highlight />
                  <Cell val={row.mint} />
                  <Cell val={row.ynab} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   SecuritySection
───────────────────────────────────────────── */

const SECURITY_PILLARS = [
  {
    icon: Database,
    title: "Your database, your rules",
    desc: "Every transaction, category, and budget lives in a Postgres database you control — local Docker, Neon, Supabase, Railway, or any Postgres host. You can read it, back it up, and delete it whenever you want.",
  },
  {
    icon: Eye,
    title: "Zero trackers, zero pixels",
    desc: "No Segment, no Mixpanel, no Google Analytics, no invisible tracking pixels. WalletPulse loads exactly what you see — nothing phoning home, ever.",
  },
  {
    icon: Shield,
    title: "Open source & auditable",
    desc: "The entire codebase is on GitHub under the MIT license. Read every line, fork it, self-audit it. You don't have to trust us — you can verify.",
  },
];

export function SecuritySection() {
  return (
    <section id="security" className="bg-muted/30 py-20 md:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <h2 className="font-heading text-4xl font-[540] leading-[0.96] tracking-[-0.028em] text-foreground md:text-5xl">
            Your money should answer to you.
            <br />
            Not a startup&apos;s investors.
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {SECURITY_PILLARS.map((p) => (
            <div key={p.title} className="rounded-2xl border border-border bg-card p-7">
              <div className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 text-accent">
                <p.icon className="h-5 w-5" />
              </div>
              <h3 className="mb-3 font-heading text-[19px] font-[540] leading-[1.1] tracking-[-0.015em] text-foreground">
                {p.title}
              </h3>
              <p className="text-[14px] font-[460] leading-[1.55] text-muted-foreground">
                {p.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   PricingSection
───────────────────────────────────────────── */

const PRICING_FEATURES = [
  "Full CRUD for transactions, categories & budgets",
  "Credit-card cycle history & payment tracking",
  "International remittances with FX precision",
  "Rich analytics: trends, heatmap, breakdowns",
  "CSV import / JSON export — full data portability",
  "Self-host on Vercel + Neon in under 5 minutes",
];

export function PricingSection() {
  return (
    <section id="pricing" className="py-20 md:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-12 max-w-xl text-center">
          <h2 className="font-heading text-4xl font-[540] leading-[0.96] tracking-[-0.028em] text-foreground md:text-5xl">
            One price. Always.
          </h2>
        </div>
        <div className="mx-auto max-w-md">
          <div className="hero-gradient overflow-hidden rounded-2xl p-px">
            <div className="rounded-2xl bg-card p-8">
              <div className="mb-2 inline-flex items-center gap-2 rounded-lg bg-accent/15 px-3 py-1 text-[12px] font-[600] uppercase tracking-[0.08em] text-accent">
                Free forever
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-heading text-6xl font-[540] leading-none tracking-[-0.04em] text-foreground">
                  $0
                </span>
                <span className="text-[16px] font-[460] text-muted-foreground">/ month</span>
              </div>
              <p className="mt-3 text-[14px] font-[460] text-muted-foreground">
                Open source. Self-hosted. Yours.
              </p>

              <ul className="mt-7 space-y-3">
                {PRICING_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[14px] font-[460] text-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    {f}
                  </li>
                ))}
              </ul>

              <Button variant="secondary" size="lg" className="mt-8 w-full" asChild>
                <Link href="/register">Get started</Link>
              </Button>
              <p className="mt-3 text-center text-[12px] font-[460] text-muted-foreground">
                No credit card required. Ever.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   FinalCta
───────────────────────────────────────────── */

export function FinalCta() {
  return (
    <section className="hero-gradient relative overflow-hidden py-28 text-white">
      {/* Grid overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
        }}
      />
      <div className="container relative z-10 mx-auto px-4 text-center">
        <h2 className="font-heading text-4xl font-[540] leading-[0.96] tracking-[-0.028em] text-white/95 md:text-6xl">
          Take back control of your
          <br />
          <span
            style={{
              background:
                "linear-gradient(135deg, hsl(258 90% 88%) 0%, hsl(258 90% 75%) 50%, hsl(261 55% 70%) 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              color: "transparent",
            }}
          >
            financial story.
          </span>
        </h2>
        <p className="mx-auto mt-6 max-w-lg text-[17px] font-[460] leading-[1.5] text-white/70">
          Join a growing community of people who decided their financial data
          doesn&apos;t belong in someone else&apos;s database.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" variant="secondary" asChild>
            <Link href="/register">Get started free</Link>
          </Button>
          <a
            href="https://github.com/SreehariR97/wallet-pulse"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/30 bg-transparent px-6 text-sm font-[540] text-white hover:bg-white/10 transition-colors"
          >
            <Github className="h-4 w-4" />
            Star on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   MarketingFooter
───────────────────────────────────────────── */

const FOOTER_COLS = [
  {
    heading: "Product",
    links: [
      { label: "Dashboard", href: "/login" },
      { label: "Transactions", href: "/login" },
      { label: "Analytics", href: "/login" },
      { label: "Credit cards", href: "/login" },
      { label: "Remittances", href: "/login" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "GitHub", href: "https://github.com/SreehariR97/wallet-pulse" },
      { label: "README", href: "https://github.com/SreehariR97/wallet-pulse#readme" },
      { label: "Changelog", href: "https://github.com/SreehariR97/wallet-pulse/commits/main" },
    ],
  },
  {
    heading: "Account",
    links: [
      { label: "Sign in", href: "/login" },
      { label: "Create account", href: "/register" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-card py-16">
      <div className="container mx-auto px-4">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
          {/* Brand blurb */}
          <div>
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Shield className="h-3.5 w-3.5" />
              </div>
              <span className="font-heading text-[15px] font-[540] tracking-[-0.02em] text-foreground">
                WalletPulse
              </span>
            </div>
            <p className="text-[13px] font-[460] leading-[1.6] text-muted-foreground">
              Privacy-first personal finance tracking. Your money, your database,
              your rules.
            </p>
          </div>

          {/* Link columns */}
          {FOOTER_COLS.map((col) => (
            <div key={col.heading}>
              <p className="mb-4 text-[11px] font-[600] uppercase tracking-[0.1em] text-muted-foreground">
                {col.heading}
              </p>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      className="text-[13px] font-[460] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom row */}
        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-8 text-[12px] font-[460] text-muted-foreground">
          <span>MIT licensed · © 2026 WalletPulse · Built with Next.js · Drizzle · Postgres</span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            0 trackers loaded
          </span>
        </div>
      </div>
    </footer>
  );
}
