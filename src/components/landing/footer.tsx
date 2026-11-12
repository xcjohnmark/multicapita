import Link from "next/link";
import { NearLogo } from "@/components/landing/token-logos";

export function LandingFooter() {
  return (
    <footer className="w-full bg-black text-white border-t border-neutral-900 pt-16 pb-12 overflow-hidden select-none">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Top Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 pb-12 border-b border-neutral-800">
          
          <div className="md:col-span-6 space-y-4">
            <div className="flex items-center gap-2">
              <div className="size-7 rounded-lg bg-white text-black font-bold flex items-center justify-center text-xs">
                C
              </div>
              <span className="text-xl font-bold tracking-tight text-white">Capita</span>
            </div>
            <p className="max-w-sm text-sm text-neutral-400 leading-relaxed">
              Cross-chain DeFi portfolio operator. Discover opportunities, set guardrails, and execute through cross-chain intents.
            </p>
          </div>

          <div className="md:col-span-3 space-y-3">
            <p className="text-xs uppercase font-mono tracking-wider text-neutral-500 font-semibold">
              Platform
            </p>
            <ul className="space-y-2 text-sm text-neutral-400">
              <li>
                <Link href="/app" className="hover:text-white transition-colors">
                  Overview
                </Link>
              </li>
              <li>
                <Link href="/opportunities" className="hover:text-white transition-colors">
                  Opportunities
                </Link>
              </li>
              <li>
                <Link href="/strategy" className="hover:text-white transition-colors">
                  Strategy
                </Link>
              </li>
              <li>
                <Link href="/execute" className="hover:text-white transition-colors">
                  Execute
                </Link>
              </li>
            </ul>
          </div>

          <div className="md:col-span-3 space-y-3">
            <p className="text-xs uppercase font-mono tracking-wider text-neutral-500 font-semibold">
              Resources
            </p>
            <ul className="space-y-2 text-sm text-neutral-400">
              <li>
                <a
                  href="https://docs.agentsonintents.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  Intents documentation ↗
                </a>
              </li>
              <li>
                <a
                  href="https://explorer.near-intents.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  Explorer ↗
                </a>
              </li>
            </ul>
          </div>

        </div>

        {/* Huge Capita Wordmark Display */}
        <div className="pt-8 pb-6 text-center">
          <p
            className="text-[18vw] font-black tracking-tighter leading-none text-neutral-900 pointer-events-none select-none uppercase"
            style={{
              textShadow: "0 0 1px rgba(255,255,255,0.05)",
            }}
          >
            Capita
          </p>
        </div>

        {/* Bottom Disclosures & Copyright */}
        <div className="pt-6 border-t border-neutral-800/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-400">
          <p>© 2026 Capita. Non-custodial DeFi portfolio management.</p>
          <p className="text-[11px] text-neutral-400 max-w-md text-center sm:text-right">
            DeFi returns are variable and principal is not guaranteed.
          </p>
        </div>

      </div>
    </footer>
  );
}
