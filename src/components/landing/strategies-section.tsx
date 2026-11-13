import { ArrowLeftRight, Building2, Droplets, Landmark, Users, Vault } from "lucide-react";

/** The six strategy types from the PRD. No rates here — live figures live in the Markets table. */
const STRATEGIES = [
  {
    icon: Vault,
    tag: "1Click Earn",
    title: "Yield vaults",
    body: "Deposit into supported vaults such as Gauntlet USDC Prime on Base and receive a receipt token.",
    measured: "APY from the yield provider, with its timestamp",
  },
  {
    icon: Landmark,
    tag: "Aave V3",
    title: "Lending",
    body: "Supply stablecoins to Aave V3 on Base or Arbitrum and earn the variable supply rate.",
    measured: "Supply rate and utilisation read on-chain",
  },
  {
    icon: Droplets,
    tag: "Uniswap V3",
    title: "Stablecoin liquidity",
    body: "Provide USDC/EURC or USDC/USDT0 liquidity in a tight range and earn trading fees.",
    measured: "Fee APY from 24h volume, fee tier and TVL",
  },
  {
    icon: ArrowLeftRight,
    tag: "Scanner",
    title: "Cross-chain arbitrage",
    body: "Find price gaps for the same verified asset across chains, after DEX fees, gas and the 1Click fee.",
    measured: "Net profit at your trade size, not the headline spread",
  },
  {
    icon: Building2,
    tag: "Ondo · Dinari · XAUT",
    title: "Tokenized stocks & gold",
    body: "Hold verified tokenized NVDA, AAPL, TSLA and Tether Gold next to your DeFi positions, under a capped sleeve.",
    measured: "On-chain price against the reference price, in bps",
  },
  {
    icon: Users,
    tag: "No memecoins",
    title: "Copytrading",
    body: "Inspect any trader's wallet across chains and mirror eligible spot, vault, lending and LP moves with your approval.",
    measured: "Price drift since the leader's trade, per-trade and daily caps",
  },
];

export function StrategiesSection() {
  return (
    <section id="strategies" className="section bg-canvas">
      <div className="mx-auto max-w-[1120px]">
        <div className="section-head">
          <p className="eyebrow">Strategies</p>
          <h2 className="type-h2 text-ink">Six ways to put capital to work</h2>
          <p className="type-body-lg text-ink-secondary">
            Each strategy shows how its figures are measured, which venue it uses, and its risks
            before you commit anything.
          </p>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STRATEGIES.map(({ icon: Icon, tag, title, body, measured }) => (
            <li key={title} className="panel flex flex-col bg-surface p-6">
              <div className="flex items-center justify-between gap-3">
                <span className="flex size-10 items-center justify-center rounded-[var(--radius-control)] border border-line bg-canvas text-ink">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="eyebrow">{tag}</span>
              </div>
              <h3 className="type-h5 mt-6 text-ink">{title}</h3>
              <p className="type-body-md mt-2 flex-1 text-ink-secondary">{body}</p>
              <p className="type-body-sm mt-6 border-t border-line pt-4 text-ink-muted">
                {measured}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
