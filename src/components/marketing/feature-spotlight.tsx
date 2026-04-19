import {
  TrendingUp,
  CreditCard,
  Globe,
  Target,
  Activity,
  Shield,
  Database,
  FileDown,
  DollarSign,
  Check,
  ChevronRight,
} from "lucide-react";

/* ── Shared helpers ── */

function Check4({ items }: { items: string[] }) {
  return (
    <ul className="mt-4 space-y-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-[14px] font-[460] text-muted-foreground">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function SpotlightText({
  eyebrow,
  headline,
  body,
  bullets,
  ctaLabel,
  ctaHref,
}: {
  eyebrow: string;
  headline: string;
  body: string;
  bullets: string[];
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="flex flex-col justify-center">
      <p className="mb-3 text-[12px] font-[600] uppercase tracking-[0.1em] text-accent">
        {eyebrow}
      </p>
      <h3 className="font-heading text-3xl font-[540] leading-[0.96] tracking-[-0.022em] text-foreground md:text-4xl">
        {headline}
      </h3>
      <p className="mt-5 text-[16px] font-[460] leading-[1.55] text-muted-foreground">{body}</p>
      <Check4 items={bullets} />
      <a
        href={ctaHref}
        className="mt-6 inline-flex items-center gap-1.5 text-[14px] font-[540] text-link hover:opacity-80 transition-opacity"
      >
        {ctaLabel}
        <ChevronRight className="h-4 w-4" />
      </a>
    </div>
  );
}

/* ── Analytics visual ── */
function AnalyticsVisual() {
  const bars = [
    { label: "Groceries", pct: 72, color: "#a78bfa" },
    { label: "Dining Out", pct: 55, color: "#818cf8" },
    { label: "Transport", pct: 38, color: "#60a5fa" },
    { label: "Subscriptions", pct: 29, color: "#34d399" },
    { label: "Shopping", pct: 44, color: "#fb923c" },
    { label: "Health", pct: 18, color: "#f472b6" },
  ];
  return (
    <div className="hero-gradient rounded-2xl p-6 text-white">
      <p className="mb-1 text-[11px] font-[600] uppercase tracking-[0.1em] text-white/50">
        Category Breakdown · Apr 2026
      </p>
      <p className="mb-5 text-[15px] font-[540] text-white/90">$1,917 spent</p>
      <div className="space-y-3">
        {bars.map((b) => (
          <div key={b.label}>
            <div className="mb-1 flex items-center justify-between text-[12px]">
              <span className="font-[460] text-white/75">{b.label}</span>
              <span className="font-[540] text-white/80 tabular-nums">
                ${Math.round((b.pct / 100) * 400)}
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full"
              style={{ background: "rgba(255,255,255,0.1)" }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${b.pct}%`, background: b.color }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Credit cards visual ── */
function CreditCardsVisual() {
  return (
    <div className="hero-gradient rounded-2xl p-6 text-white">
      <p className="mb-4 text-[11px] font-[600] uppercase tracking-[0.1em] text-white/50">
        Credit Card Cycles
      </p>
      {/* Active cycle card */}
      <div
        className="mb-3 rounded-xl p-4"
        style={{ background: "rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[13px] font-[540] text-white/90">Chase Sapphire</p>
            <p className="text-[11px] font-[460] text-white/45">···· 4242</p>
          </div>
          <span
            className="rounded-md px-2 py-0.5 text-[10px] font-[600] text-violet-200"
            style={{ background: "rgba(139,92,246,0.3)" }}
          >
            Active
          </span>
        </div>
        <p className="mt-3 text-[22px] font-[540] tabular-nums text-white/90">$1,240</p>
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: "rgba(255,255,255,0.1)" }}
        >
          <div
            className="h-full rounded-full"
            style={{ width: "31%", background: "#4ade80" }}
          />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          {[
            { label: "Utilization", value: "31%" },
            { label: "Min Due", value: "$35" },
            { label: "Paid", value: "$0" },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-[9px] font-[600] uppercase tracking-[0.06em] text-white/35">{s.label}</p>
              <p className="text-[12px] font-[540] text-white/80">{s.value}</p>
            </div>
          ))}
        </div>
      </div>
      {/* Past cycle row */}
      <div
        className="flex items-center justify-between rounded-xl px-4 py-3"
        style={{ background: "rgba(255,255,255,0.05)" }}
      >
        <div>
          <p className="text-[11px] font-[540] text-white/70">Mar cycle · issued</p>
          <p className="text-[10px] font-[460] text-white/35">Closed Mar 28</p>
        </div>
        <div className="text-right">
          <p className="text-[12px] font-[540] text-white/70 tabular-nums">$982</p>
          <span
            className="rounded-md px-1.5 py-0.5 text-[9px] font-[600] text-green-300"
            style={{ background: "rgba(74,222,128,0.15)" }}
          >
            Paid in full
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Remittances visual ── */
function RemittancesVisual() {
  const services = [
    { name: "Wise", flag: "🌍", rate: "83.56", fee: "$3.80", amount: "$1,200" },
    { name: "Remitly", flag: "💸", rate: "82.90", fee: "$0", amount: "$500" },
    { name: "Wise", flag: "🌍", rate: "83.72", fee: "$3.65", amount: "$800" },
  ];
  return (
    <div className="hero-gradient rounded-2xl p-6 text-white">
      <p className="mb-4 text-[11px] font-[600] uppercase tracking-[0.1em] text-white/50">
        International Remittances · 2026
      </p>
      {/* Stat cards */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        {[
          { label: "Sent MTD", value: "$2,500" },
          { label: "Fees YTD", value: "$42.10" },
          { label: "Avg Rate", value: "83.4 ₹/$" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-lg p-2.5 text-center"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <p className="text-[9px] font-[600] uppercase tracking-[0.06em] text-white/40">{s.label}</p>
            <p className="mt-1 text-[12px] font-[540] tabular-nums text-white/90">{s.value}</p>
          </div>
        ))}
      </div>
      {/* Service rows */}
      <div className="space-y-2">
        {services.map((s, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-lg px-3 py-2"
            style={{ background: "rgba(255,255,255,0.05)" }}
          >
            <div className="flex items-center gap-2">
              <span className="text-[15px]">{s.flag}</span>
              <div>
                <p className="text-[11px] font-[540] text-white/80">{s.name}</p>
                <p className="text-[10px] font-[460] text-white/40">{s.rate} ₹/$ · fee {s.fee}</p>
              </div>
            </div>
            <p className="text-[12px] font-[540] tabular-nums text-white/80">{s.amount}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 6-card supporting grid ── */
const SUPPORT_CARDS = [
  {
    icon: Target,
    title: "Budgets",
    desc: "Per-category or overall, with progress bars that flip red when you overspend.",
  },
  {
    icon: DollarSign,
    title: "Loan tracking",
    desc: "First-class types for money lent, borrowed, and repaid — loans never pollute your totals.",
  },
  {
    icon: Activity,
    title: "Spending heatmap",
    desc: "See at a glance which days of the month you spend the most.",
  },
  {
    icon: Shield,
    title: "Privacy by design",
    desc: "Your data in your database. No analytics pixels, no aggregators, no bank linking.",
  },
  {
    icon: Database,
    title: "Modern stack",
    desc: "Next.js 14, Drizzle ORM, Postgres, and Auth.js v5 — production-grade from day one.",
  },
  {
    icon: FileDown,
    title: "CSV import & export",
    desc: "Bring your Mint history in. Export everything as CSV or JSON at any time.",
  },
];

/* ── Spotlight block ── */
function SpotlightBlock({
  eyebrow,
  headline,
  body,
  bullets,
  ctaLabel,
  ctaHref,
  visual,
  flip,
}: {
  eyebrow: string;
  headline: string;
  body: string;
  bullets: string[];
  ctaLabel: string;
  ctaHref: string;
  visual: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
      {flip ? (
        <>
          <SpotlightText
            eyebrow={eyebrow}
            headline={headline}
            body={body}
            bullets={bullets}
            ctaLabel={ctaLabel}
            ctaHref={ctaHref}
          />
          <div>{visual}</div>
        </>
      ) : (
        <>
          <div>{visual}</div>
          <SpotlightText
            eyebrow={eyebrow}
            headline={headline}
            body={body}
            bullets={bullets}
            ctaLabel={ctaLabel}
            ctaHref={ctaHref}
          />
        </>
      )}
    </div>
  );
}

/* ── Main export ── */
export function FeatureSpotlight() {
  return (
    <section id="features" className="py-20 md:py-28">
      <div className="container mx-auto px-4">
        {/* Section header */}
        <div className="mx-auto mb-20 max-w-2xl text-center">
          <h2 className="font-heading text-4xl font-[540] leading-[0.96] tracking-[-0.028em] text-foreground md:text-5xl">
            Everything Mint did.
            <br />
            Plus what it never could.
          </h2>
          <p className="mt-5 text-[17px] font-[460] leading-[1.5] text-muted-foreground">
            Credit-card cycle history, international remittances, and loan tracking —
            features no hosted app has ever combined in one self-hosted package.
          </p>
        </div>

        {/* Spotlight 1 — Analytics */}
        <SpotlightBlock
          eyebrow="Rich Analytics"
          headline="Understand every dollar you spend."
          body="Interactive category breakdowns, a month-over-month comparison table, payment-method distribution, and a day-of-month spending heatmap — all computed on your own Postgres."
          bullets={[
            "Trend chart: daily, weekly, monthly series",
            "Category donut + horizontal bar breakdown",
            "Income-vs-expense bars with savings rate",
            "Month-over-month table with % change",
          ]}
          ctaLabel="See analytics features"
          ctaHref="/register"
          visual={<AnalyticsVisual />}
          flip={false}
        />

        <div className="my-20 border-t border-border" />

        {/* Spotlight 2 — Credit cards */}
        <SpotlightBlock
          eyebrow="Credit Card Cycles"
          headline="Real statement history. Not just a balance."
          body="Track every statement period with open/close dates, statement balances, minimum payments, and payment progress. Mark statements issued, pay the card, and watch utilization update in real time."
          bullets={[
            "Full cycle history: projected + issued cycles",
            "Auto-allocates payments to the right cycle",
            "Per-cycle category breakdown",
            "Past-due indicator with red dot on the card tile",
          ]}
          ctaLabel="See credit card features"
          ctaHref="/register"
          visual={<CreditCardsVisual />}
          flip={true}
        />

        <div className="my-20 border-t border-border" />

        {/* Spotlight 3 — Remittances */}
        <SpotlightBlock
          eyebrow="International Remittances"
          headline="Audit every dollar you send abroad."
          body="USD→INR (or any corridor) with the exact exchange rate and fee stored at full precision. Stats cards show total sent, fees paid, and average rate by service so you know who gives you the best deal."
          bullets={[
            "FX rate stored at 6-decimal precision",
            "Fee tracking across Wise, Remitly, and more",
            "Per-service aggregates: avg rate, fees YTD",
            "Full CSV export of your transfer audit trail",
          ]}
          ctaLabel="See remittance features"
          ctaHref="/register"
          visual={<RemittancesVisual />}
          flip={false}
        />

        <div className="mt-24 border-t border-border pt-20">
          <h3 className="mb-12 text-center font-heading text-2xl font-[540] leading-[0.96] tracking-[-0.02em] text-foreground">
            And a lot more out of the box
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {SUPPORT_CARDS.map((card) => (
              <div
                key={card.title}
                className="rounded-2xl border border-border bg-card p-6"
              >
                <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <card.icon className="h-4 w-4" />
                </div>
                <h4 className="mb-2 font-heading text-[17px] font-[540] leading-[1.1] tracking-[-0.015em] text-foreground">
                  {card.title}
                </h4>
                <p className="text-[14px] font-[460] leading-[1.5] text-muted-foreground">
                  {card.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
