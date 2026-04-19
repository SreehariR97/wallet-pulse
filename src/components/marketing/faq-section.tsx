"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const FAQS = [
  {
    q: "Do I need to be a developer to use this?",
    a: "Not really — if you can copy a connection string from Neon and click 'Deploy' on Vercel, you're 90% of the way there. The full setup takes about 5 minutes and the README walks you through every step. That said, you do own your own infrastructure, so this is best for people comfortable with running their own services (or willing to learn).",
  },
  {
    q: "Where does my data actually live?",
    a: "In a Postgres database that you provision and control. Most users pick Neon's generous free tier (~$0/mo for personal use), but Supabase, Railway, Vercel Postgres, AWS RDS, or a local Docker container all work. The WalletPulse server only ever talks to the database you give it.",
  },
  {
    q: "How is this different from Mint or YNAB?",
    a: "Mint shut down in 2024. YNAB charges $109/year and stores your data on their servers. WalletPulse is free, open source, runs on your own database, and adds first-class credit-card cycle tracking, international remittances, and loan tracking — features neither hosted app ever shipped.",
  },
  {
    q: "Can I import my existing transaction history?",
    a: "Yes — the import dialog supports CSV with column mapping, so you can bring history from Mint, YNAB, your bank, or any spreadsheet. You can also export everything as CSV or JSON at any time, so your data is never locked in.",
  },
  {
    q: "What if I want to leave?",
    a: "Click Settings → Export and you'll get a complete CSV or JSON dump of every transaction, category, and budget. Then drop your database. There's no account-deletion ticket queue and no data hostage situation — it's all yours.",
  },
  {
    q: "Is it really free? What's the catch?",
    a: "Genuinely free. The catch is that you host it yourself, which means you pay your Postgres provider (usually $0 on Neon's free tier) and your hosting provider (usually $0 on Vercel's hobby tier). There's no team behind a billing model — it's open source software you run yourself.",
  },
];

export function FaqSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section id="faq" className="bg-muted/30 py-20 md:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="font-heading text-4xl font-[540] leading-[0.96] tracking-[-0.028em] text-foreground md:text-5xl">
            Frequently asked.
          </h2>
        </div>

        <div className="mx-auto max-w-2xl space-y-3">
          {FAQS.map((faq, i) => {
            const isOpen = openIdx === i;
            return (
              <div
                key={faq.q}
                className="overflow-hidden rounded-2xl border border-border bg-card"
              >
                <button
                  type="button"
                  onClick={() => setOpenIdx(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-muted/40"
                  aria-expanded={isOpen}
                >
                  <span className="font-heading text-[16px] font-[540] tracking-[-0.01em] text-foreground">
                    {faq.q}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>
                {isOpen && (
                  <div className="px-6 pb-5 text-[14px] font-[460] leading-[1.6] text-muted-foreground">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
