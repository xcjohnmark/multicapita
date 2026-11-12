import { ArrowRight, Bot, CheckCircle2, ShieldCheck, Zap } from "lucide-react";
import { BaseLogo, ArbitrumLogo, NearLogo, UsdcLogo } from "@/components/landing/token-logos";

const WORKFLOW_STEPS = [
  {
    step: "01",
    title: "Connect wallet",
    desc: "Connect your self-custodial wallet on Base, Arbitrum, or NEAR. Capita reads your balances and positions without holding your private keys.",
    icon: Zap,
    tag: "Non-custodial",
  },
  {
    step: "02",
    title: "Choose strategy",
    desc: "Pick a goal or select specific opportunities across lending markets, vaults, and liquidity pools.",
    icon: Bot,
    tag: "Research",
  },
  {
    step: "03",
    title: "Set guardrails",
    desc: "Configure your limits. Set maximum exposure per protocol, minimum liquid balance, and slippage tolerance before any trade.",
    icon: ShieldCheck,
    tag: "Protection",
  },
  {
    step: "04",
    title: "Review and execute",
    desc: "Inspect transparent quote fees and confirm. Funds transfer directly to the destination protocol in a single transaction step.",
    icon: CheckCircle2,
    tag: "Fast execution",
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-20 md:py-28 bg-surface border-b border-line">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <p className="eyebrow">Workflow</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-ink">
            How Capita works
          </h2>
          <p className="text-base text-ink-secondary leading-relaxed">
            From opportunity discovery to execution in four clear steps.
          </p>
        </div>

        {/* Workflow Diagram Banner */}
        <div className="mt-12 p-6 rounded-2xl bg-canvas border border-line shadow-xs">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-mono text-ink-secondary">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-accent" />
              <span className="font-semibold text-ink">1. Connect</span>
            </div>
            <ArrowRight className="size-4 text-ink-muted rotate-90 md:rotate-0" />
            <div>
              <span>2. Select opportunity</span>
            </div>
            <ArrowRight className="size-4 text-ink-muted rotate-90 md:rotate-0" />
            <div className="px-2 py-1 rounded bg-surface border border-line text-ink font-semibold">
              <span>3. Verify guardrails</span>
            </div>
            <ArrowRight className="size-4 text-ink-muted rotate-90 md:rotate-0" />
            <div className="flex items-center gap-1.5 text-ink font-semibold">
              <span>4. Execute</span>
            </div>
          </div>
        </div>

        {/* 4 Steps Grid */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {WORKFLOW_STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.step}
                className="relative p-6 rounded-2xl bg-canvas border border-line flex flex-col justify-between hover:border-line-strong transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-2xl font-mono font-bold text-ink-muted">
                      {step.step}
                    </span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-full border border-line bg-surface text-ink-muted">
                      {step.tag}
                    </span>
                  </div>

                  <div className="size-10 rounded-xl bg-surface flex items-center justify-center text-ink mb-4 border border-line">
                    <Icon className="size-5" />
                  </div>

                  <h3 className="text-base font-semibold text-ink mb-2">
                    {step.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-ink-secondary leading-relaxed">
                    {step.desc}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-line/60 flex items-center gap-2 text-xs text-ink-faint">
                  <span>Step verified</span>
                  <div className="h-1 flex-1 bg-surface-raised rounded-full overflow-hidden">
                    <div className="w-full h-full bg-accent" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Protocol & Chain Badges Strip */}
        <div className="mt-16 pt-10 border-t border-line/70 flex flex-wrap items-center justify-center gap-8 text-xs text-ink-muted">
          <span className="font-semibold text-ink">Supported rails & environments:</span>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-canvas border border-line">
            <BaseLogo className="size-4" />
            <span className="font-medium text-ink">Base (8453)</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-canvas border border-line">
            <ArbitrumLogo className="size-4" />
            <span className="font-medium text-ink">Arbitrum One (42161)</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-canvas border border-line">
            <NearLogo className="size-4" />
            <span className="font-medium text-ink">NEAR Intents 1Click</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-canvas border border-line">
            <UsdcLogo className="size-4" />
            <span className="font-medium text-ink">Canonical Native USDC</span>
          </div>
        </div>

      </div>
    </section>
  );
}
