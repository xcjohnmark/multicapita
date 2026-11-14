"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { History, Info, Loader2, LogOut, Plus, Search, Settings, Wallet } from "lucide-react";
import { disconnect } from "@wagmi/core";
import { WalletPicker } from "@/components/wallet/wallet-picker";
import { wagmiConfig } from "@/lib/wallet/config";
import { Modal } from "@/components/ui/dialog";
import { Identicon } from "@/components/ui/identicon";
import { PopoverMenu } from "@/components/ui/popover";
import { ProtocolIcon } from "@/components/ui/protocol-icon";
import { Tag } from "@/components/ui/tag";
import { shortenMiddle } from "@/lib/format";
import type { ShellSession } from "@/lib/shell-state";
import { cn } from "@/lib/ui/cn";

type Tone = "invert" | "ink";

function iconButtonClass(tone: Tone) {
  return tone === "invert" ? "btn btn-hero-icon" : "btn btn-ghost btn-icon size-11 rounded-[var(--radius-control)]";
}

export function HeaderActions({ session, tone = "invert" }: { session: ShellSession; tone?: Tone }) {
  return (
    <div className="flex items-center gap-1">
      <ModeInfo session={session} tone={tone} />
      <SearchButton tone={tone} />
      <Link href="/activity" className={cn(iconButtonClass(tone), "max-md:hidden")} aria-label="Activity">
        <History className="size-5" strokeWidth={1.5} />
      </Link>
      <ProfileMenu session={session} tone={tone} />
    </div>
  );
}

function ModeInfo({ session, tone }: { session: ShellSession; tone: Tone }) {
  const live = session.dataMode === "live";
  return (
    <PopoverMenu
      trigger={
        <button type="button" className={cn(iconButtonClass(tone), "relative")} aria-label="Mode and limits">
          <Info className="size-5" strokeWidth={1.5} />
          {!live ? <span className="absolute top-2 right-2 size-2 rounded-full bg-amber-400" aria-hidden /> : null}
        </button>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="type-card-title">Mode</p>
          <Tag tone={live ? "positive" : session.dataMode === "dry_run" ? "sim" : "sample"}>{session.dataModeLabel}</Tag>
        </div>
        <p className="text-sm text-pretty text-ink-secondary">
          {live
            ? "Real signatures. Every step asks your wallet."
            : "Quotes and prices are real. Settlement is simulated and labelled; nothing is signed."}
        </p>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-[10px] bg-surface-raised p-3">
            <dt className="text-ink-muted">Per plan</dt>
            <dd className="figure mt-0.5 text-ink">${session.maxMoveUsdc}</dd>
          </div>
          <div className="rounded-[10px] bg-surface-raised p-3">
            <dt className="text-ink-muted">Per day</dt>
            <dd className="figure mt-0.5 text-ink">${session.maxDailyUsdc}</dd>
          </div>
        </dl>
        {session.executionReason && live ? <p className="text-sm text-warn-text">{session.executionReason}</p> : null}
      </div>
    </PopoverMenu>
  );
}

type SearchHit = {
  kind: "opportunity" | "trader";
  id: string;
  href: string;
  title: string;
  subtitle: string;
  hint: string | null;
};

function SearchButton({ tone }: { tone: Tone }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const request = useRef(0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const runSearch = async (value: string) => {
    const id = ++request.current;
    setLoading(true);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(value)}`);
      const body = (await response.json()) as { data?: SearchHit[] };
      if (id === request.current) setHits(body.data ?? []);
    } catch {
      if (id === request.current) setHits([]);
    } finally {
      if (id === request.current) setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={iconButtonClass(tone)}
        aria-label="Search"
        onClick={() => {
          setOpen(true);
          if (hits === null) void runSearch("");
        }}
      >
        <Search className="size-5" strokeWidth={1.5} />
      </button>
      <Modal open={open} onOpenChange={setOpen} title="Search" className="sm:w-[min(36rem,calc(100vw-2rem))]">
        <label className="field h-12">
          <Search className="size-5 text-ink-muted" strokeWidth={1.5} aria-hidden />
          <input
            autoFocus
            value={q}
            placeholder="Markets, stocks, traders"
            aria-label="Search markets, stocks and traders"
            onChange={(event) => {
              setQ(event.target.value);
              void runSearch(event.target.value);
            }}
          />
          {loading ? <Loader2 className="size-4 animate-spin text-ink-muted" aria-hidden /> : null}
        </label>
        <ul className="mt-3 max-h-[min(24rem,60dvh)] space-y-1 overflow-y-auto">
          {hits?.length === 0 ? <li className="px-3 py-6 text-center text-sm text-ink-muted">No matches</li> : null}
          {hits?.map((hit) => (
            <li key={`${hit.kind}-${hit.id}`}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push(hit.href);
                }}
                className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors duration-100 hover:bg-surface-raised"
              >
                {hit.kind === "trader" ? (
                  <Identicon seed={hit.id} size={36} />
                ) : (
                  <ProtocolIcon hints={[hit.subtitle, hit.title]} label={hit.title} size="md" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink">{hit.title}</span>
                  <span className="block truncate text-sm text-ink-muted">{hit.subtitle}</span>
                </span>
                {hit.hint ? <span className="shrink-0 text-sm text-ink-secondary tabular-nums">{hit.hint}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}

function ProfileMenu({ session, tone }: { session: ShellSession; tone: Tone }) {
  const router = useRouter();
  const [picker, setPicker] = useState<"signin" | "link" | null>(null);

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    await disconnect(wagmiConfig).catch(() => undefined);
    router.refresh();
  };

  return (
    <>
      <PopoverMenu
        trigger={
          <button type="button" className={cn(iconButtonClass(tone), "relative")} aria-label="Account">
            {session.authenticated && session.address ? (
              <Identicon seed={session.address} size={28} />
            ) : (
              <Wallet className="size-5" strokeWidth={1.5} />
            )}
          </button>
        }
      >
        <div className="space-y-3">
          {session.authenticated && session.address ? (
            <div className="flex items-center gap-3">
              <Identicon seed={session.address} size={40} />
              <div className="min-w-0">
                <p className="type-card-title">{shortenMiddle(session.address, 6, 4)}</p>
                <p className="text-sm text-ink-muted">Signed in</p>
              </div>
            </div>
          ) : (
            <div>
              <p className="type-card-title">{session.demo ? "Demo account" : "Not signed in"}</p>
              <p className="mt-0.5 text-sm text-pretty text-ink-muted">
                {session.demo ? "Sample portfolio. Simulations stay in this browser." : "Connect a wallet to see your portfolio."}
              </p>
            </div>
          )}
          <div className="grid gap-1">
            {session.authenticated ? (
              <MenuButton icon={Plus} onClick={() => setPicker("link")}>
                Add wallet
              </MenuButton>
            ) : null}
            <Link href="/settings" className="flex h-10 items-center gap-2.5 rounded-[10px] px-2.5 text-[0.9375rem] hover:bg-surface-raised">
              <Settings className="size-4 text-ink-secondary" strokeWidth={1.5} aria-hidden />
              {session.authenticated ? "Wallets & settings" : "Settings"}
            </Link>
            {session.authenticated ? (
              <MenuButton icon={LogOut} onClick={signOut}>
                Sign out
              </MenuButton>
            ) : (
              <button type="button" onClick={() => setPicker("signin")} className="btn btn-primary mt-1 h-11 w-full">
                <Wallet className="size-4" strokeWidth={1.5} aria-hidden />
                Connect wallet
              </button>
            )}
          </div>
        </div>
      </PopoverMenu>
      <Modal
        open={picker !== null}
        onOpenChange={(open) => !open && setPicker(null)}
        title={picker === "link" ? "Add a wallet" : "Connect a wallet"}
      >
        {picker ? (
          <WalletPicker
            mode={picker}
            signedInAddress={session.address}
            onDone={() => {
              setPicker(null);
              router.refresh();
            }}
          />
        ) : null}
      </Modal>
    </>
  );
}

function MenuButton({ icon: Icon, onClick, children }: { icon: typeof Plus; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[0.9375rem] hover:bg-surface-raised"
    >
      <Icon className="size-4 text-ink-secondary" strokeWidth={1.5} aria-hidden />
      {children}
    </button>
  );
}
