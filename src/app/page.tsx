import { LandingNavbar } from "@/components/landing/navbar";
import { LandingHeaderHero } from "@/components/landing/hero";
import { HowItWorksSection } from "@/components/landing/how-it-works";
import { StrategiesSection } from "@/components/landing/strategies-section";
import { SecuritySection } from "@/components/landing/security-section";
import { FaqSection } from "@/components/landing/faq-section";
import { LandingFooter } from "@/components/landing/footer";

export const dynamic = "force-dynamic";

export default function LandingPage() {
  return (
    <div className="min-h-full flex flex-col bg-canvas text-ink antialiased">
      <LandingNavbar />
      <main className="flex-1">
        <LandingHeaderHero />
        <HowItWorksSection />
        <StrategiesSection />
        <SecuritySection />
        <FaqSection />
      </main>
      <LandingFooter />
    </div>
  );
}
