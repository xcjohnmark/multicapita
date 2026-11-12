import { Lock, Cpu, Eye, ShieldAlert, Sparkles, Scale } from "lucide-react";
import { NearLogo } from "@/components/landing/token-logos";

const PILLARS = [
  {
    icon: Lock,
    title: "Self-custodial",
    desc: "Capita never holds your keys or funds. Every transaction requires your wallet signature.",
  },
  {
    icon: ShieldAlert,
    title: "User-defined guardrails",
    desc: "Set hard rules on max allocation per protocol, slippage limits, and minimum liquidity reserves.",
  },
  {
    icon: Eye,
    title: "Clear quote pricing",
    desc: "Every rate shows its source and timestamp. No hidden bridge spreads or surprise fees.",
  },
  {
    icon: Scale,
    title: "Direct verification",
    desc: "All figures and trade limits are calculated deterministically before reaching your wallet.",
  },
];

export function SecuritySection() {
  return (
    <section id="security" className="py-20 md:py-28 bg-surface border-b border-line">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="max-w-2xl mx-auto text-center space-y-3">
          <p className="eyebrow">Security</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-ink">
            Built for safety and transparency
          </h2>
          <p className="text-sm sm:text-base text-ink-secondary leading-relaxed">
            Your keys stay in your wallet, and you retain control over every deposit and withdrawal.
          </p>
        </div>

        {/* 4 Pillars Grid */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {PILLARS.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <div
                key={pillar.title}
                className="p-6 rounded-2xl bg-canvas border border-line hover:border-line-strong transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="size-10 rounded-xl bg-surface border border-line flex items-center justify-center text-ink mb-4">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="text-base font-bold text-ink mb-2">
                    {pillar.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-ink-secondary leading-relaxed">
                    {pillar.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
