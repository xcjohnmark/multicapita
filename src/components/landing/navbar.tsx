import Link from "next/link";
import { NearLogo } from "@/components/landing/token-logos";

export function LandingNavbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-line bg-canvas/80 backdrop-blur-md">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Brand Logo & Wordmark */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="size-8 rounded-lg bg-black text-white flex items-center justify-center font-bold text-sm tracking-tighter transition-transform group-hover:scale-105">
            C
          </div>
          <span className="text-lg font-bold tracking-tight text-ink font-sans">
            Capita
          </span>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-ink-secondary">
          <Link href="#how-it-works" className="hover:text-ink transition-colors">
            How it works
          </Link>
          <Link href="#strategies" className="hover:text-ink transition-colors">
            Strategies
          </Link>
          <Link href="#security" className="hover:text-ink transition-colors">
            Security & Rails
          </Link>
          <Link href="#faq" className="hover:text-ink transition-colors">
            FAQ
          </Link>
        </nav>

        {/* Action Button: Launch App */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-line bg-surface text-xs text-ink-muted">
            <NearLogo className="size-3.5 text-ink" />
            <span>NEAR Rail</span>
          </div>

          <Link
            href="/app"
            className="inline-flex items-center gap-1.5 rounded-full bg-black hover:bg-neutral-800 text-white px-5 py-2 text-sm font-semibold transition-all duration-150 active:scale-95 shadow-xs"
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
