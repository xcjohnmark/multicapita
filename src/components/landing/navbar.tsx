import Link from "next/link";

/** Transparent over the hero landscape; logo left, section links centered, actions right. */
export function LandingNavbar() {
  return (
    <header className="absolute inset-x-0 top-0 z-50 w-full">
      <div className="mx-auto flex h-20 max-w-[1200px] items-center justify-between px-6 md:px-10">
        <Link href="/" className="flex items-center gap-2.5 text-white">
          <span className="flex size-8 items-center justify-center rounded-[var(--radius-control)] border border-white/25 bg-white/10 text-sm font-medium">
            C
          </span>
          <span className="text-xl tracking-[-0.02em]">Capita</span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm text-white/80 md:flex" aria-label="Sections">
          <Link href="#markets" className="hover:text-white">
            Markets
          </Link>
          <Link href="#how-it-works" className="hover:text-white">
            How it works
          </Link>
          <Link href="#strategies" className="hover:text-white">
            Strategies
          </Link>
          <Link href="#faq" className="hover:text-white">
            FAQ
          </Link>
        </nav>

        <div className="flex items-center gap-5">
          <Link href="/signin" className="hidden text-sm text-white/80 hover:text-white sm:inline">
            Sign in
          </Link>
          <Link
            href="/app"
            className="btn h-10 border-white/50 bg-transparent px-4 text-white hover:!border-white hover:!bg-white/10"
          >
            Launch app
          </Link>
        </div>
      </div>
    </header>
  );
}
