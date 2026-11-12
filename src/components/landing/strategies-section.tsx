import { ArrowUpRight, BarChart3, Layers, Repeat, ShieldCheck } from "lucide-react";
import { AaveLogo, MorphoLogo, UniswapLogo, ArbitrumLogo, BaseLogo } from "@/components/landing/token-logos";

const STRATEGIES = [
  {
    category: "Yield Vaults",
    badge: "1Click Earn",
    title: "Curated Risk-Weighted Vaults",
    desc: "Deposit capital directly into institutional-grade vaults like Gauntlet USDC Prime on Morpho or Kamino on Solana. Receive receipt tokens with transparent APY accounting.",
    statLabel: "Target APY",
    statValue: "4.8% — 8.2%",
    protocols: [
      { name: "Morpho", icon: MorphoLogo, chain: "Base" },
      { name: "Gauntlet", icon: MorphoLogo, chain: "Base" },
    ],
    features: [
      "Receipt tokens tracked dynamically",
      "Live APY & TVL via Yield.xyz provider",
      "Immediate redemption estimates",
    ],
  },
  {
    category: "Lending Markets",
    badge: "Money Markets",
    title: "Algorithmic Supply Rates",
    desc: "Supply supported stablecoins to premier money markets. Earn variable borrower interest with real-time liquidity depth and utilisation metrics.",
    statLabel: "Supply APY",
    statValue: "3.5% — 6.1%",
    protocols: [
      { name: "Aave V3", icon: AaveLogo, chain: "Arbitrum" },
    ],
    features: [
      "Per-reserve utilisation monitoring",
      "Zero lockup variable supply rates",
      "Gas-optimised destination routing",
    ],
  },
  {
    category: "Stablecoin Liquidity",
    badge: "Concentrated LP",
    title: "Tight-Spread DEX Fee Pools",
    desc: "Supply verified stablecoin pairs (USDC/USDT) to concentrated liquidity pools. Capture trading volume fees without exposing capital to volatile token swings.",
    statLabel: "Fee APY",
    statValue: "7.2% — 12.4%",
    protocols: [
      { name: "Uniswap V3", icon: UniswapLogo, chain: "Base" },
    ],
    features: [
      "In-range tick boundary checks",
      "Historical fee generation ratios",
      "Deterministic impermanent loss tracking",
    ],
  },
  {
    category: "Cross-Chain Arbitrage",
    badge: "DEX Scanner",
    title: "Cross-Chain Price Discrepancies",
    desc: "Scan price spreads for identical verified assets between DEXs on Base and Arbitrum. Calculate execution-aware net profit after routing fees and slippage.",
    statLabel: "Net Spread",
    statValue: "+0.25% — +0.80%",
    protocols: [
      { name: "Base DEX", icon: BaseLogo, chain: "Base" },
      { name: "Arb DEX", icon: ArbitrumLogo, chain: "Arbitrum" },
    ],
    features: [
      "Slippage buffer & gas deductions",
      "Fresh quote validation before execution",
      "No claims of atomic multileg loops",
    ],
  },
];

export function StrategiesSection() {
  return (
    <section id="strategies" className="py-20 md:py-28 bg-canvas border-b border-line">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Heading */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-12 border-b border-line">
          <div>
            <p className="eyebrow">Financial Strategies</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-ink mt-1">
              Four Core DeFi Strategies
            </h2>
          </div>
          <p className="max-w-md text-sm text-ink-secondary">
            Every opportunity displays verified data sources, observed timestamps, and clear risk disclosures. No fabricated APYs or hidden bridging surcharges.
          </p>
        </div>

        {/* 4 Cards Grid */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8">
          {STRATEGIES.map((strat) => (
            <div
              key={strat.category}
              className="p-8 rounded-2xl bg-surface border border-line flex flex-col justify-between hover:border-line-strong transition-all duration-200 group"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    {strat.category}
                  </span>
                  <span className="text-xs font-mono font-medium px-2.5 py-1 rounded-full bg-canvas border border-line text-ink">
                    {strat.badge}
                  </span>
                </div>

                <h3 className="text-xl font-bold text-ink mb-2">
                  {strat.title}
                </h3>
                <p className="text-sm text-ink-secondary leading-relaxed mb-6">
                  {strat.desc}
                </p>

                {/* Protocols Included */}
                <div className="flex items-center gap-2 mb-6">
                  <span className="text-xs text-ink-muted">Venues:</span>
                  {strat.protocols.map((proto) => {
                    const ProtoIcon = proto.icon;
                    return (
                      <span
                        key={proto.name}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-canvas border border-line text-xs font-medium text-ink"
                      >
                        <ProtoIcon className="size-3.5" />
                        <span>{proto.name}</span>
                        <span className="text-[10px] text-ink-muted font-mono">({proto.chain})</span>
                      </span>
                    );
                  })}
                </div>

                {/* Strategy Checklist */}
                <ul className="space-y-2 mb-6">
                  {strat.features.map((feat) => (
                    <li key={feat} className="flex items-center gap-2 text-xs text-ink-secondary">
                      <span className="size-1.5 rounded-full bg-accent" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Bottom Stat Footer */}
              <div className="pt-4 border-t border-line/80 flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wider font-mono text-ink-muted">
                    {strat.statLabel}
                  </p>
                  <p className="text-lg font-mono font-bold text-accent-text">
                    {strat.statValue}
                  </p>
                </div>

                <div className="size-8 rounded-full bg-canvas border border-line flex items-center justify-center text-ink-muted group-hover:text-ink group-hover:scale-105 transition-all">
                  <ArrowUpRight className="size-4" />
                </div>
              </div>

            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
