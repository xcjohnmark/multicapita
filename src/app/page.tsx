import { LandingNavbar } from "@/components/landing/navbar";
import { LandingHeaderHero } from "@/components/landing/hero";
import { LiveMarketsSection } from "@/components/landing/live-markets";
import { HowItWorksSection } from "@/components/landing/how-it-works";
import { StrategiesSection } from "@/components/landing/strategies-section";
import { SecuritySection } from "@/components/landing/security-section";
import { NearSection } from "@/components/landing/near-section";
import { FaqSection } from "@/components/landing/faq-section";
import { LandingFooter } from "@/components/landing/footer";

// The markets table reads the latest live rows on every request.
export const dynamic = "force-dynamic";

export default function LandingPage() {
  return (
    <div className="flex min-h-full flex-col bg-canvas text-ink antialiased">
      <LandingNavbar />
      <main className="flex-1">
        <LandingHeaderHero />
        <LiveMarketsSection />
        <HowItWorksSection />
        <StrategiesSection />
        <SecuritySection />
        <NearSection />
        <FaqSection />
      </main>
      <LandingFooter />
    </div>
  );
}
