import Link from "next/link";
import { ArrowUpRight, ChevronDown } from "lucide-react";

/**
 * Nouva-structured hero: full-height landscape, centered regular-weight headline, one lead line,
 * one primary and one secondary action, scroll indicator pinned to the bottom.
 */
export function LandingHeaderHero() {
  return (
    <section className="relative flex min-h-[100svh] flex-col overflow-hidden bg-neutral-950 text-white">
      <div className="pointer-events-none absolute inset-0 select-none" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element -- static hero, already optimised webp */}
        <img
          src="/images/wall_street_hero.webp"
          alt=""
          className="h-full w-full object-cover object-center"
        />
        {/* Even scrim so centered type stays legible over the bright skyline. */}
        <div className="absolute inset-0 bg-black/45" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/60 to-transparent" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-[880px] flex-1 flex-col items-center justify-center px-6 pt-[150px] pb-24 text-center">
        <p className="eyebrow text-white/70">Cross-chain portfolio operator</p>
        <h1 className="type-h1 mt-4 text-white">
          All your crypto.
          <br />
          One place.
        </h1>
        <p className="type-body-lg mt-5 max-w-xl text-white/80">
          See your balances across Base, Arbitrum and Ethereum, get an AI-built strategy that your
          own guardrails check, and move funds across chains through NEAR Intents.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/app"
            className="btn h-12 border-white bg-white px-6 text-[15px] text-neutral-950 hover:!border-white/90 hover:!bg-white/90"
          >
            Launch app
            <ArrowUpRight className="size-4" aria-hidden />
          </Link>
          <Link
            href="#how-it-works"
            className="btn h-12 border-white/40 bg-transparent px-6 text-[15px] text-white hover:!border-white hover:!bg-white/10"
          >
            How it works
          </Link>
        </div>
      </div>

      <a
        href="#markets"
        className="relative z-10 mx-auto mb-8 flex flex-col items-center gap-1 text-xs uppercase tracking-[0.06em] text-white/60 hover:text-white"
      >
        Scroll to discover
        <ChevronDown className="size-4" aria-hidden />
      </a>
    </section>
  );
}
