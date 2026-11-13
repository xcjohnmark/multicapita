import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const NEAR_PARTS = [
  {
    name: "NEAR Intents · 1Click",
    body: "Quotes and settles each cross-chain move: USDC from Base to Arbitrum, vault deposits, Tether Gold.",
  },
  {
    name: "NEAR AI Cloud",
    body: "Hosts the strategy model. It reads your portfolio and live markets only through typed, read-only tools.",
  },
  {
    name: "Intents Agent API",
    body: "Optional owner-signed spending rules for rule-bound copytrading, with a freeze switch.",
  },
];

/** Feature block card on a landscape panel (Nouva pattern), then the closing call to action. */
export function NearSection() {
  return (
    <section id="near" className="section bg-canvas">
      <div className="mx-auto max-w-[1120px]">
        <div className="section-head">
          <p className="eyebrow">Built on NEAR</p>
          <h2 className="type-h2 text-ink">What NEAR does in Capita</h2>
          <p className="type-body-lg text-ink-secondary">
            Concretely, three pieces of NEAR infrastructure do the cross-chain and AI work.
          </p>
        </div>

        <ul className="grid gap-4 md:grid-cols-3">
          {NEAR_PARTS.map((part) => (
            <li key={part.name} className="panel bg-surface p-6">
              <h3 className="type-h6 text-ink">{part.name}</h3>
              <p className="type-body-sm mt-2 text-ink-secondary">{part.body}</p>
            </li>
          ))}
        </ul>

        <div className="relative mt-16 overflow-hidden rounded-[var(--radius-panel)] border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element -- static landscape panel */}
          <img
            src="/images/financial_district_skyline_sharp.webp"
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-black/55" aria-hidden />
          <div className="relative px-6 py-20 text-center text-white md:py-28">
            <h2 className="type-h2 mx-auto max-w-2xl">Put idle capital to work, on your terms</h2>
            <p className="type-body-lg mx-auto mt-4 max-w-xl text-white/80">
              Connect a wallet, set your limits, and review a strategy before anything moves.
            </p>
            <Link
              href="/app"
              className="btn mt-8 h-12 border-white bg-white px-6 text-[15px] text-neutral-950 hover:!border-white/90 hover:!bg-white/90"
            >
              Launch app
              <ArrowUpRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
