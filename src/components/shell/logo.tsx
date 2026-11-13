import Link from "next/link";

type Tone = "ink" | "invert";

const SIZES = { md: "text-[1.75rem]", lg: "text-[2.5rem]" } as const;

/** The brand wordmark: "Capita" set in Manufacturing Consent. Plain text, no link. */
export function Wordmark({ tone = "ink", size = "md" }: { tone?: Tone; size?: keyof typeof SIZES }) {
  return (
    <span className={`font-logo leading-none font-normal ${SIZES[size]} ${tone === "invert" ? "text-white" : "text-ink"}`}>
      Capita
    </span>
  );
}

export function Logo({ tone = "ink", href = "/app", className = "" }: { tone?: Tone; href?: string; className?: string }) {
  return (
    <Link href={href} className={`flex items-center rounded-lg outline-offset-4 ${className}`} aria-label="Capita home">
      <Wordmark tone={tone} />
    </Link>
  );
}
