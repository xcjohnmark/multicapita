import Link from "next/link";
import { NearLogo } from "@/components/landing/token-logos";

export function LandingNavbar() {
  return (
    <header className="absolute top-0 inset-x-0 z-50 w-full border-b border-white/10 bg-transparent">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        
        {/* Brand Logo & Wordmark */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="size-8 rounded-lg bg-black/80 border border-white/20 text-white flex items-center justify-center font-bold text-sm tracking-tighter transition-transform group-hover:scale-105 shadow-md">
            C
          </div>
          <span className="text-xl font-bold tracking-tight text-white font-sans drop-shadow-sm">
            Capita
          </span>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-white/80">
          <Link href="#how-it-works" className="hover:text-white transition-colors drop-shadow-sm">
            How it works
          </Link>
          <Link href="#strategies" className="hover:text-white transition-colors drop-shadow-sm">
            Strategies
          </Link>
          <Link href="#security" className="hover:text-white transition-colors drop-shadow-sm">
            Security & Rails
          </Link>
          <Link href="#faq" className="hover:text-white transition-colors drop-shadow-sm">
            FAQ
          </Link>
        </nav>

        {/* Action Button: Launch App */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/15 bg-black/30 backdrop-blur-sm text-xs text-white/90 shadow-sm">
            <NearLogo className="size-3.5 text-[#00EC97]" />
            <span className="font-medium">NEAR Rail</span>
          </div>

          <Link
            href="/app"
            className="inline-flex items-center gap-1.5 rounded-full bg-white hover:bg-neutral-100 text-black px-5 py-2 text-sm font-semibold transition-all duration-150 active:scale-95 shadow-lg"
          >
            <span>Launch App</span>
            <svg
              width="13"
              height="13"
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
          </Link>
        </div>

      </div>
    </header>
  );
}
