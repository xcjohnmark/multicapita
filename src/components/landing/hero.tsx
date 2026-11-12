import Link from "next/link";
import { FlowMosaicHeaderVisual, type MosaicItem } from "@/components/landing/flow-mosaic-header";
import { Button } from "@/components/ui/button";

const FLOW_MARKET_ITEMS: MosaicItem[] = [
  // 1. Vaults
  {
    id: "morpho-usdc",
    iconSymbol: "morpho",
    title: "Gauntlet USDC",
    subtitle: "Morpho Vault",
    chainOrCategory: "Base",
    badge: "Vault",
    statLabel: "Yield APY",
    statValue: "7.84%",
    statTone: "positive",
  },
  // 2. Lending
  {
    id: "aave-v3-arb",
    iconSymbol: "aave",
    title: "Aave V3",
    subtitle: "USDT Supply",
    chainOrCategory: "Arbitrum",
    badge: "Lending",
    statLabel: "Supply APY",
    statValue: "5.12%",
    statTone: "positive",
  },
  // 3. 1Click Routing
  {
    id: "1click-intents",
    iconSymbol: "near",
    title: "Cross-Chain Swap",
    subtitle: "NEAR Settlement",
    chainOrCategory: "NEAR",
    badge: "Transfer",
    statLabel: "Est. Time",
    statValue: "18s",
    statTone: "highlight",
  },
  // 4. Stablecoin LP
  {
    id: "uniswap-usdc-usdt",
    iconSymbol: "uniswap",
    title: "Uniswap V3",
    subtitle: "USDC / USDT pool",
    chainOrCategory: "Base",
    badge: "Pool",
    statLabel: "Fee APY",
    statValue: "9.30%",
    statTone: "positive",
  },
  // 5. Arbitrage
  {
    id: "arb-scanner",
    iconSymbol: "arbitrum",
    title: "Arbitrum USDC",
    subtitle: "DEX Market",
    chainOrCategory: "Arbitrum",
    badge: "Market",
    statLabel: "Net Spread",
    statValue: "+0.42%",
    statTone: "positive",
  },
  // 6. Guardrail Policy
  {
    id: "policy-guard",
    iconSymbol: "base",
    title: "Base USDC",
    subtitle: "Direct Liquidity",
    chainOrCategory: "Base",
    badge: "Liquid",
    statLabel: "Status",
    statValue: "Available",
    statTone: "positive",
  },
  // 7. AI Strategy
  {
    id: "ai-orchestrator",
    iconSymbol: "near",
    title: "wNEAR Staking",
    subtitle: "Liquid Staking",
    chainOrCategory: "NEAR",
    badge: "Staking",
    statLabel: "Yield APY",
    statValue: "8.40%",
    statTone: "positive",
  },
  // 8. Yield.xyz
  {
    id: "kamino-sol",
    iconSymbol: "kamino",
    title: "Kamino USD",
    subtitle: "Yield Vault",
    chainOrCategory: "Solana",
    badge: "Vault",
    statLabel: "Net APY",
    statValue: "8.15%",
    statTone: "positive",
  },
  // 9. Rebalance
  {
    id: "auto-rebalance",
    iconSymbol: "ethereum",
    title: "Mainnet USDC",
    subtitle: "Reserve Balance",
    chainOrCategory: "Ethereum",
    badge: "Reserve",
    statLabel: "Supply APY",
    statValue: "4.10%",
    statTone: "default",
  },
  // 10. Secondary in queue - Compound
  {
    id: "compound-usdc",
    iconSymbol: "compound",
    title: "Compound V3",
    subtitle: "USDC Lending",
    chainOrCategory: "Base",
    badge: "Lending",
    statLabel: "Supply APY",
    statValue: "4.92%",
    statTone: "positive",
  },
  // 11. Secondary in queue - Curve LP
  {
    id: "curve-crvusd",
    iconSymbol: "curve",
    title: "Curve 3pool",
    subtitle: "Stablecoin Pool",
    chainOrCategory: "Arbitrum",
    badge: "Pool",
    statLabel: "Fee APY",
    statValue: "6.20%",
    statTone: "positive",
  },
  // 12. Secondary in queue - Settled Quote
  {
    id: "quote-settled",
    iconSymbol: "usdc",
    title: "1Click Transfer",
    subtitle: "Cross-chain route",
    chainOrCategory: "Transfer",
    badge: "Route",
    statLabel: "Fee",
    statValue: "2.4 bps",
    statTone: "highlight",
  },
];

export function LandingHeaderHero() {
  return (
    <section className="relative overflow-hidden pt-12 pb-16 md:pt-20 md:pb-24 border-b border-line">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* Left Hero Messaging */}
          <div className="lg:col-span-7 space-y-6 text-left">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-ink leading-[1.08]">
              All your crypto. <br />
              <span className="text-ink-secondary font-medium">One place.</span>
            </h1>

            <p className="max-w-xl text-base sm:text-lg text-ink-secondary leading-relaxed">
              Track balances and deploy capital into verified lending markets, vaults, and liquidity pools across Base, Arbitrum, and NEAR.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <Link href="/app">
                <Button variant="primary" size="lg" className="rounded-full shadow-sm font-semibold">
                  Launch App
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="7" y1="17" x2="17" y2="7" />
                    <polyline points="7 7 17 7 17 17" />
                  </svg>
                </Button>
              </Link>

              <Link href="#how-it-works">
                <Button variant="secondary" size="lg" className="rounded-full">
                  How it works
                </Button>
              </Link>
            </div>

            <div className="pt-6 border-t border-line/60 grid grid-cols-3 gap-4 max-w-lg">
              <div>
                <p className="text-xs text-ink-muted">Supported chains</p>
                <p className="text-sm font-semibold text-ink mt-0.5">Base & Arbitrum</p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Settlement</p>
                <p className="text-sm font-semibold text-ink mt-0.5">Cross-chain intents</p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Custody</p>
                <p className="text-sm font-semibold text-ink mt-0.5">Non-custodial</p>
              </div>
            </div>
          </div>

          {/* Right Hero Visual: 3D Mosaic Interactive Grid */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end">
            <div className="w-full max-w-[440px] p-2.5 sm:p-4 rounded-2xl bg-surface border border-line shadow-xs">
              <div className="flex items-center justify-between pb-3 px-1 border-b border-line mb-3">
                <span className="text-xs font-semibold text-ink tracking-tight">Markets & Rates</span>
                <span className="text-[11px] font-mono text-ink-muted">Live Quotes</span>
              </div>

              <FlowMosaicHeaderVisual items={FLOW_MARKET_ITEMS} />

              <div className="mt-3.5 pt-2.5 px-1 border-t border-line/70 flex items-center justify-between text-[11px] text-ink-muted">
                <span>Updated in real time</span>
                <span className="font-mono">USDC / USDT</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
