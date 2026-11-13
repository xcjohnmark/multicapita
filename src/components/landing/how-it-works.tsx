import { Bot, ShieldCheck, Wallet, Waypoints } from "lucide-react";

const STEPS = [
  {
    step: "01",
    icon: Wallet,
    title: "See everything in one place",
    body: "Sign in with your EVM wallet and link more addresses. Capita reads balances on Base, Arbitrum and Ethereum, each figure stamped with its source and time.",
  },
  {
    step: "02",
    icon: Bot,
    title: "Ask for a strategy",
    body: "Describe a goal in plain words. NEAR AI Cloud ranks the opportunities and proposes allocation weights, packaged as a strategy card you can edit.",
  },
  {
    step: "03",
    icon: ShieldCheck,
    title: "Your guardrails check every number",
    body: "Deterministic, tested code turns weights into exact amounts and checks your limits: liquid reserve, protocol and chain caps, slippage, price spread. The AI can't approve itself.",
  },
  {
    step: "04",
    icon: Waypoints,
    title: "Execute one confirmed leg at a time",
    body: "Funds cross chains through NEAR Intents 1Click with a fresh quote and your signature. Multi-step strategies run as separate legs, and each one is confirmed before the next.",
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="section border-t border-line bg-surface">
      <div className="mx-auto max-w-[1120px]">
        <div className="section-head">
          <p className="eyebrow">How it works</p>
          <h2 className="type-h2 text-ink">From a goal to a settled position</h2>
          <p className="type-body-lg text-ink-secondary">
            The AI proposes. Deterministic code decides. You sign.
          </p>
        </div>

        <ol className="grid gap-4 md:grid-cols-2">
          {STEPS.map(({ step, icon: Icon, title, body }) => (
            <li key={step} className="panel p-6 md:p-8">
              <div className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-[var(--radius-control)] border border-line bg-surface text-ink">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="metric text-sm text-ink-muted">{step}</span>
              </div>
              <h3 className="type-h5 mt-6 text-ink">{title}</h3>
              <p className="type-body-md mt-2 text-ink-secondary">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
