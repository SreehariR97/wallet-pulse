import Link from "next/link";
import { Github, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="hero-gradient relative overflow-hidden text-white">
      {/* Grid pattern overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse 70% 80% at 50% 40%, black 30%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 80% at 50% 40%, black 30%, transparent 100%)",
        }}
      />

      {/* Purple radial blur behind headline */}
      <div
        className="pointer-events-none absolute left-[5%] top-[15%] h-[420px] w-[480px] rounded-full opacity-30"
        style={{
          background:
            "radial-gradient(ellipse, hsl(258 90% 75% / 0.6) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      <div className="container relative z-10 mx-auto px-4 pb-0 pt-28 md:pt-36">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          {/* ── Left column ── */}
          <div className="flex flex-col items-start">
            {/* Eyebrow pill */}
            <div className="mb-8 inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-1 text-[13px] font-[460] text-white/80 backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              The privacy-first Mint alternative · Open source
            </div>

            {/* Headline */}
            <h1 className="font-heading text-5xl font-[540] leading-[0.96] tracking-[-0.028em] text-white/95 md:text-6xl xl:text-7xl">
              Your money,
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
                beautifully tracked.
              </span>
            </h1>

            {/* Subhead */}
            <p className="mt-8 max-w-[480px] text-[17px] font-[460] leading-[1.5] text-white/75">
              The personal finance tracker that lives in{" "}
              <strong className="font-[540] text-white/90">
                your own database.
              </strong>{" "}
              No bank linking, no telemetry, no monthly fee — just a beautiful
              Mint / YNAB-class app you fully own.
            </p>

            {/* CTAs */}
            <div className="mt-10 flex flex-wrap gap-3">
              <Button size="lg" variant="secondary" asChild>
                <Link href="/register">Start tracking — it&apos;s free</Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/login">Try the live demo</Link>
              </Button>
            </div>

            {/* Trust strip */}
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] font-[460] text-white/55">
              {[
                "MIT licensed",
                "Self-hostable in 5 min",
                "0 trackers",
              ].map((item) => (
                <span key={item} className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                  {item}
                </span>
              ))}
              <a
                href="https://github.com/SreehariR97/wallet-pulse"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 hover:text-white/80 transition-colors"
              >
                <Github className="h-3.5 w-3.5" />
                View on GitHub
              </a>
            </div>
          </div>

          {/* ── Right column — product mockup ── */}
          <div className="relative hidden lg:block">
            {/* Browser chrome frame */}
            <div
              className="relative overflow-hidden rounded-xl border border-white/20"
              style={{ background: "rgba(22,20,50,0.85)", backdropFilter: "blur(4px)" }}
            >
              {/* Title bar */}
              <div
                className="flex items-center gap-3 border-b border-white/10 px-4 py-3"
                style={{ background: "rgba(255,255,255,0.05)" }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                  <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
                  <span className="h-3 w-3 rounded-full bg-[#28c840]" />
                </div>
                <div className="flex flex-1 items-center justify-center">
                  <span
                    className="rounded-md px-4 py-0.5 text-[11px] font-[460] text-white/40"
                    style={{ background: "rgba(255,255,255,0.07)" }}
                  >
                    wallet-pulse.app/dashboard
                  </span>
                </div>
              </div>

              {/* Dashboard content */}
              <div className="p-5">
                {/* Greeting + badge */}
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-[460] text-white/45">April 2026</p>
                    <p className="text-[15px] font-[540] text-white/90">Welcome back 👋</p>
                  </div>
                  <span
                    className="rounded-full px-2.5 py-1 text-[11px] font-[540] text-green-300"
                    style={{ background: "rgba(74,222,128,0.15)" }}
                  >
                    Net +
                  </span>
                </div>

                {/* Summary cards */}
                <div className="mb-5 grid grid-cols-3 gap-2">
                  {[
                    { label: "NET BALANCE", value: "$6,503", accent: true },
                    { label: "INCOME", value: "$8,420", accent: false },
                    { label: "EXPENSES", value: "$1,917", accent: false },
                  ].map((card) => (
                    <div
                      key={card.label}
                      className="rounded-lg p-2.5"
                      style={{
                        background: card.accent
                          ? "rgba(139,92,246,0.25)"
                          : "rgba(255,255,255,0.06)",
                      }}
                    >
                      <p className="text-[9px] font-[600] uppercase tracking-[0.08em] text-white/45">
                        {card.label}
                      </p>
                      <p
                        className="mt-1 text-[14px] font-[540] tabular-nums leading-none"
                        style={{ color: card.accent ? "hsl(258 90% 85%)" : "rgba(255,255,255,0.9)" }}
                      >
                        {card.value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Trend chart — pure inline SVG */}
                <div
                  className="mb-4 overflow-hidden rounded-lg p-3"
                  style={{ background: "rgba(255,255,255,0.04)" }}
                >
                  <p className="mb-2 text-[10px] font-[600] uppercase tracking-[0.08em] text-white/40">
                    Spending Trend
                  </p>
                  <svg
                    viewBox="0 0 280 80"
                    className="w-full"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <defs>
                      <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4ade80" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#4ade80" stopOpacity="0" />
                      </linearGradient>
                      <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {/* Dashed gridlines */}
                    {[20, 40, 60].map((y) => (
                      <line
                        key={y}
                        x1="0"
                        y1={y}
                        x2="280"
                        y2={y}
                        stroke="rgba(255,255,255,0.08)"
                        strokeWidth="1"
                        strokeDasharray="3 4"
                      />
                    ))}
                    {/* Income area */}
                    <path
                      d="M0,55 C20,50 40,42 60,38 C80,34 100,28 120,22 C140,16 160,20 180,18 C200,16 220,14 240,12 C260,10 270,8 280,7 L280,80 L0,80 Z"
                      fill="url(#incomeGrad)"
                    />
                    <path
                      d="M0,55 C20,50 40,42 60,38 C80,34 100,28 120,22 C140,16 160,20 180,18 C200,16 220,14 240,12 C260,10 270,8 280,7"
                      fill="none"
                      stroke="#4ade80"
                      strokeWidth="1.5"
                    />
                    {/* Expense area */}
                    <path
                      d="M0,68 C20,65 40,62 60,60 C80,58 100,55 120,52 C140,49 160,53 180,50 C200,47 220,44 240,46 C260,48 270,50 280,48 L280,80 L0,80 Z"
                      fill="url(#expenseGrad)"
                    />
                    <path
                      d="M0,68 C20,65 40,62 60,60 C80,58 100,55 120,52 C140,49 160,53 180,50 C200,47 220,44 240,46 C260,48 270,50 280,48"
                      fill="none"
                      stroke="#a78bfa"
                      strokeWidth="1.5"
                    />
                  </svg>
                  <div className="mt-2 flex items-center gap-4">
                    <span className="flex items-center gap-1.5 text-[10px] font-[460] text-white/45">
                      <span className="h-1.5 w-3 rounded-full bg-green-400" />
                      Income
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] font-[460] text-white/45">
                      <span className="h-1.5 w-3 rounded-full bg-violet-400" />
                      Expenses
                    </span>
                  </div>
                </div>

                {/* Credit card tiles */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { name: "Chase Sapphire", last4: "4242", balance: "$1,240", due: "May 5", util: 31 },
                    { name: "Citi Double Cash", last4: "8801", balance: "$677", due: "May 12", util: 14 },
                  ].map((card) => (
                    <div
                      key={card.last4}
                      className="rounded-lg p-2.5"
                      style={{ background: "rgba(255,255,255,0.06)" }}
                    >
                      <p className="text-[10px] font-[540] text-white/80 truncate">{card.name}</p>
                      <p className="text-[9px] font-[460] text-white/35">···· {card.last4}</p>
                      <p className="mt-1.5 text-[13px] font-[540] tabular-nums text-white/90">{card.balance}</p>
                      <div
                        className="mt-1.5 h-1 w-full rounded-full overflow-hidden"
                        style={{ background: "rgba(255,255,255,0.1)" }}
                      >
                        <div
                          className="h-full rounded-full bg-green-400"
                          style={{ width: `${card.util}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[9px] font-[460] text-white/35">Due {card.due}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Floating accent pill — Wise remittance */}
            <div
              className="absolute -left-10 top-[58%] hidden md:flex -rotate-2 items-center gap-2 rounded-xl border border-white/20 px-3 py-2 text-[12px] font-[540] text-white shadow-lg"
              style={{ background: "rgba(31,29,61,0.92)", backdropFilter: "blur(8px)" }}
            >
              <span className="text-[16px]">🌍</span>
              <div>
                <p className="text-white/90">$1,200 → ₹100,272</p>
                <p className="text-[10px] font-[460] text-white/50">Wise · 83.56 ₹/$</p>
              </div>
            </div>

            {/* Floating accent pill — Budget progress */}
            <div
              className="absolute -right-8 bottom-1/4 hidden md:block rotate-2 rounded-xl border border-white/20 px-3 py-2 shadow-lg"
              style={{ background: "rgba(31,29,61,0.92)", backdropFilter: "blur(8px)" }}
            >
              <p className="text-[11px] font-[540] text-white/90">Groceries</p>
              <div
                className="mt-1.5 h-1.5 w-28 rounded-full overflow-hidden"
                style={{ background: "rgba(255,255,255,0.1)" }}
              >
                <div className="h-full w-[71%] rounded-full bg-yellow-400" />
              </div>
              <p className="mt-1 text-[10px] font-[460] text-white/50">$284 / $400 · 71%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Hero fade into next section */}
      <div className="pointer-events-none h-40 bg-gradient-to-b from-transparent to-background" />
    </section>
  );
}
