import Link from "next/link";
import { FlowMosaicHeaderVisual, type MosaicItem } from "@/components/landing/flow-mosaic-header";
import { Button } from "@/components/ui/button";

const FLOW_MARKET_ITEMS: MosaicItem[] = [
  // 1. Vaults
  {
    id: "morpho-usdc",
    iconSymbol: "morpho",
    title: "Gauntlet",
    subtitle: "USDC Prime Vault",
    chainOrCategory: "Base",
    statLabel: "Yield APY",
    statValue: "7.84%",
    statTone: "positive",
  },
  // 2. Lending
  {
    id: "aave-v3-arb",
    iconSymbol: "aave",
    title: "Aave V3",
    subtitle: "USDT Supply Market",
    chainOrCategory: "Arbitrum",
    statLabel: "Supply APY",
    statValue: "5.12%",
    statTone: "positive",
  },
  // 3. 1Click Routing
  {
    id: "1click-intents",
    iconSymbol: "near",
    title: "NEAR Intent",
    subtitle: "Fast Cross-Swap",
    chainOrCategory: "NEAR",
    statLabel: "Settlement",
    statValue: "18s",
    statTone: "highlight",
  },
  // 4. Stablecoin LP
  {
    id: "uniswap-usdc-usdt",
    iconSymbol: "uniswap",
    title: "Uniswap",
    subtitle: "USDC / USDT Pool",
    chainOrCategory: "Base",
    statLabel: "Fee APY",
    statValue: "9.30%",
    statTone: "positive",
  },
  // 5. Arbitrage
  {
    id: "arb-scanner",
    iconSymbol: "arbitrum",
    title: "Arbitrum",
    subtitle: "USDC Market Spread",
    chainOrCategory: "Arbitrum",
    statLabel: "Net Spread",
    statValue: "+0.42%",
    statTone: "positive",
  },
  // 6. Guardrail Policy
  {
    id: "policy-guard",
    iconSymbol: "base",
    title: "Base USDC",
    subtitle: "Native Liquid Cash",
    chainOrCategory: "Base",
    statLabel: "Reserve",
    statValue: "Available",
    statTone: "positive",
  },
  // 7. Liquid Staking
  {
    id: "ai-orchestrator",
    iconSymbol: "near",
    title: "wNEAR",
    subtitle: "Liquid Staking Rate",
    chainOrCategory: "NEAR",
    statLabel: "Yield APY",
    statValue: "8.40%",
    statTone: "positive",
  },
  // 8. Yield Vault
  {
    id: "kamino-sol",
    iconSymbol: "kamino",
    title: "Kamino",
    subtitle: "USD Lending Vault",
    chainOrCategory: "Solana",
    statLabel: "Net APY",
    statValue: "8.15%",
    statTone: "positive",
  },
  // 9. Reserve
  {
    id: "auto-rebalance",
    iconSymbol: "ethereum",
    title: "Ethereum",
    subtitle: "Mainnet Reserve",
    chainOrCategory: "Ethereum",
    statLabel: "Supply APY",
    statValue: "4.10%",
    statTone: "default",
  },
  // 10. Secondary - Compound
  {
    id: "compound-usdc",
    iconSymbol: "compound",
    title: "Compound",
    subtitle: "USDC Liquidity",
    chainOrCategory: "Base",
    statLabel: "Supply APY",
    statValue: "4.92%",
    statTone: "positive",
  },
  // 11. Secondary - Curve LP
  {
    id: "curve-crvusd",
    iconSymbol: "curve",
    title: "Curve",
    subtitle: "3pool Stablecoins",
    chainOrCategory: "Arbitrum",
    statLabel: "Fee APY",
    statValue: "6.20%",
    statTone: "positive",
  },
  // 12. Secondary - 1Click Transfer
  {
    id: "quote-settled",
    iconSymbol: "usdc",
    title: "USDC Transfer",
    subtitle: "Direct 1Click Route",
    chainOrCategory: "Intents",
    statLabel: "Fee",
    statValue: "2.4 bps",
    statTone: "highlight",
  },
];

export function LandingHeaderHero() {
  return (
    <section className="relative overflow-hidden pt-28 pb-20 md:pt-36 md:pb-28 lg:pt-40 border-b border-neutral-800 bg-neutral-950 text-white min-h-[680px] lg:min-h-[720px] flex items-center">
      {/* High-resolution sharp Wall Street architectural background */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
        <img
          src="/images/wall_street_hero.webp"
          alt="Wall Street Manhattan Financial District"
          className="w-full h-full object-cover object-center filter brightness-[1.08] contrast-[1.04]"
        />
        {/* Soft, minimal scrims: buildings, columns, and skyline stay clear and bright */}
        <div className="absolute top-0 inset-x-0 h-36 bg-gradient-to-b from-black/60 to-transparent" />
        <div className="absolute inset-y-0 left-0 w-full lg:w-3/5 bg-gradient-to-r from-black/55 via-black/25 to-transparent" />
        <div className="absolute bottom-0 inset-x-0 h-28 bg-gradient-to-t from-neutral-950/80 to-transparent" />
      </div>

      <div className="relative z-10 max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* Left Hero Messaging */}
          <div className="lg:col-span-7 space-y-6 text-left">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.08] drop-shadow-[0_2px_14px_rgba(0,0,0,0.9)]">
              All your crypto. <br />
              <span className="text-neutral-200 font-medium">One place.</span>
            </h1>

            <p className="max-w-xl text-base sm:text-lg text-neutral-100 leading-relaxed drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)]">
              Track balances and deploy capital into verified lending markets, vaults, and liquidity pools across Base, Arbitrum, and NEAR.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <Link href="/app">
                <Button variant="accent" size="lg" className="rounded-full shadow-lg font-semibold text-black bg-[#00EC97] hover:bg-[#00D888]">
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
                <Button variant="secondary" size="lg" className="rounded-full border-white/30 text-white bg-black/20 backdrop-blur-xs hover:bg-white/15">
                  How it works
                </Button>
              </Link>
            </div>

            <div className="pt-6 border-t border-white/20 grid grid-cols-3 gap-4 max-w-lg">
              <div>
                <p className="text-xs text-neutral-300 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">Supported chains</p>
                <p className="text-sm font-semibold text-white mt-0.5 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">Base & Arbitrum</p>
              </div>
              <div>
                <p className="text-xs text-neutral-300 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">Settlement</p>
                <p className="text-sm font-semibold text-white mt-0.5 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">Cross-chain intents</p>
              </div>
              <div>
                <p className="text-xs text-neutral-300 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">Custody</p>
                <p className="text-sm font-semibold text-white mt-0.5 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">Non-custodial</p>
              </div>
            </div>
          </div>

          {/* Right Hero Visual: 3D Mosaic Interactive Grid */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end">
            <div className="w-full max-w-[480px] p-3 sm:p-5 rounded-2xl bg-black/40 backdrop-blur-md border border-white/20 shadow-2xl">
              <div className="flex items-center justify-between pb-3 px-1 border-b border-white/10 mb-3">
                <span className="text-xs font-semibold text-white tracking-tight">Markets & Rates</span>
                <span className="text-[11px] font-mono text-neutral-300">Live Quotes</span>
              </div>

              <FlowMosaicHeaderVisual items={FLOW_MARKET_ITEMS} />

              <div className="mt-3.5 pt-2.5 px-1 border-t border-white/10 flex items-center justify-between text-[11px] text-neutral-300">
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
