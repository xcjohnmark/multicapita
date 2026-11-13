import { BadgeCheck, Calculator, KeyRound, ListChecks, Link2, Timer } from "lucide-react";

const BENEFITS = [
  {
    icon: KeyRound,
    title: "Your keys stay yours",
    body: "Capita never sees a seed phrase or private key. Every transaction is signed in your own wallet.",
  },
  {
    icon: Calculator,
    title: "AI proposes, code decides",
    body: "The model ranks and explains. Every amount that reaches a signature is computed by tested code.",
  },
  {
    icon: BadgeCheck,
    title: "Every number has a source",
    body: "Rates, prices and balances carry their provider and observation time. Sample data is labelled.",
  },
  {
    icon: ListChecks,
    title: "Limits you set",
    body: "Liquid reserve, protocol, chain and RWA caps, slippage and price-spread bounds block a plan before you sign.",
  },
  {
    icon: Link2,
    title: "No hidden atomicity",
    body: "A cross-chain move settles one leg. Multi-step strategies show each leg and its confirmation.",
  },
  {
    icon: Timer,
    title: "Fresh quotes only",
    body: "A displayed rate is research. Execution needs a fresh 1Click quote that hasn't expired.",
  },
];

export function SecuritySection() {
  return (
    <section id="security" className="section border-t border-line bg-surface">
      <div className="mx-auto max-w-[1120px]">
        <div className="section-head">
          <p className="eyebrow">Safety</p>
          <h2 className="type-h2 text-ink">Built so an AI can&apos;t spend freely</h2>
          <p className="type-body-lg text-ink-secondary">
            The rules below are enforced in code and covered by tests, not just promised.
          </p>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="panel p-6">
              <Icon className="size-5 text-ink" aria-hidden />
              <h3 className="type-h6 mt-5 text-ink">{title}</h3>
              <p className="type-body-sm mt-2 text-ink-secondary">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
