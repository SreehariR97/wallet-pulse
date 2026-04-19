import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { Hero } from "@/components/marketing/hero";
import { FeatureSpotlight } from "@/components/marketing/feature-spotlight";
import {
  ComparisonTable,
  SecuritySection,
  PricingSection,
  FinalCta,
  MarketingFooter,
} from "@/components/marketing/supporting-sections";
import { FaqSection } from "@/components/marketing/faq-section";

export const metadata: Metadata = {
  title: "WalletPulse — The privacy-first personal finance tracker",
  description:
    "Track every dollar in your own database. No bank linking, no telemetry, no monthly fee. The open-source Mint alternative with first-class credit-card cycles and international remittance tracking.",
  openGraph: {
    title: "WalletPulse — Your money, beautifully tracked.",
    description:
      "The privacy-first personal finance tracker. Open source, self-hostable, and free forever.",
    type: "website",
    url: "https://wallet-pulse-lac.vercel.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "WalletPulse — Your money, beautifully tracked.",
    description:
      "The privacy-first personal finance tracker. Open source, self-hostable, and free forever.",
  },
};

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-background">
      <MarketingNav />
      <Hero />
      <FeatureSpotlight />
      <ComparisonTable />
      <SecuritySection />
      <PricingSection />
      <FaqSection />
      <FinalCta />
      <MarketingFooter />
    </div>
  );
}
