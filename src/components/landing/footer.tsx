import Link from "next/link";

const PRODUCT_LINKS = [
  { href: "/app", label: "Overview" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/strategy", label: "Strategy" },
  { href: "/execute", label: "Execute" },
  { href: "/copytrading", label: "Copytrading" },
];

const RESOURCE_LINKS = [
  { href: "https://docs.near-intents.org", label: "NEAR Intents docs" },
  { href: "https://explorer.near-intents.org", label: "Intents explorer" },
  { href: "https://github.com/xcjohnmark/multicapita", label: "Source code" },
];

export function LandingFooter() {
  return (
    <footer className="overflow-hidden border-t border-line bg-canvas">
      <div className="mx-auto max-w-[1120px] px-6 pt-16 md:px-10">
        <div className="grid gap-10 border-b border-line pb-12 md:grid-cols-12">
          <div className="md:col-span-6">
            <p className="text-xl tracking-[-0.02em] text-ink">Capita</p>
            <p className="type-body-sm mt-3 max-w-sm text-ink-secondary">
              All your crypto. One place. A non-custodial cross-chain portfolio operator.
            </p>
          </div>
          <nav className="md:col-span-3" aria-label="Product">
            <p className="eyebrow">Product</p>
            <ul className="type-body-sm mt-4 space-y-2 text-ink-secondary">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav className="md:col-span-3" aria-label="Resources">
            <p className="eyebrow">Resources</p>
            <ul className="type-body-sm mt-4 space-y-2 text-ink-secondary">
              {RESOURCE_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} target="_blank" rel="noopener noreferrer" className="hover:text-ink">
                    {link.label} ↗
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <p
          className="pointer-events-none select-none pt-6 text-center text-[19vw] leading-[0.85] tracking-[-0.06em] text-line md:text-[17vw]"
          aria-hidden
        >
          Capita
        </p>

        <div className="flex flex-col items-center justify-between gap-2 border-t border-line py-6 text-xs text-ink-muted sm:flex-row">
          <p>© 2026 Capita. Non-custodial; you sign every transaction.</p>
          <p>DeFi returns are variable and principal is not guaranteed.</p>
        </div>
      </div>
    </footer>
  );
}
