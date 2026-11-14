"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { LayoutGrid, List, Loader2, Search } from "lucide-react";
import { AssetIcon } from "@/components/ui/asset-icon";
import { Segmented } from "@/components/ui/segmented";
import { SelectMenu } from "@/components/ui/select-menu";

/**
 * Search, chain chips, sort and grid/table toggle. All state lives in the URL so a filtered view
 * is shareable and the server renders exactly what the toolbar shows.
 */
export function OpportunityToolbar({ chains, showAssetFilter }: { chains: number[]; showAssetFilter: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value === null || value === "" || value === "all") next.delete(key);
    else next.set(key, value);
    startTransition(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };

  useEffect(() => {
    const current = params.get("q") ?? "";
    if (q === current) return;
    const timer = setTimeout(() => set("q", q.trim() || null), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on the typed value only
  }, [q]);

  const chain = params.get("chain") ?? "all";
  const asset = params.get("asset") ?? "all";
  const view = params.get("view") === "table" ? "table" : "grid";

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="no-scrollbar -mx-4 flex items-center gap-1 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <Chip active={chain === "all"} onClick={() => set("chain", null)}>
          All networks
        </Chip>
        {chains.map((id) => (
          <Chip key={id} active={chain === String(id)} onClick={() => set("chain", String(id))}>
            <AssetIcon symbolOrName={id === 8453 ? "base" : id === 42161 ? "arbitrum" : "ethereum"} size="sm" />
            {id === 8453 ? "Base" : id === 42161 ? "Arbitrum" : "Ethereum"}
          </Chip>
        ))}
        {showAssetFilter ? (
          <>
            <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden />
            <Chip active={asset === "stable"} onClick={() => set("asset", asset === "stable" ? null : "stable")}>
              Stablecoins
            </Chip>
            <Chip active={asset === "volatile"} onClick={() => set("asset", asset === "volatile" ? null : "volatile")}>
              ETH &amp; BTC
            </Chip>
          </>
        ) : null}
        {pending ? <Loader2 className="ml-2 size-4 shrink-0 animate-spin text-ink-muted" aria-label="Updating" /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="field h-10 min-w-0 basis-full sm:w-auto sm:basis-auto sm:flex-1 lg:w-56 lg:flex-none">
          <Search className="size-4 shrink-0 text-ink-muted" strokeWidth={1.5} aria-hidden />
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search" aria-label="Search this tab" />
        </label>
        <SelectMenu
          ariaLabel="Sort"
          className="h-10 w-auto flex-1 sm:flex-none"
          value={params.get("sort") ?? "rate"}
          onValueChange={(value) => set("sort", value === "rate" ? null : value)}
          options={[
            { value: "rate", label: "Highest return" },
            { value: "tvl", label: "Largest TVL" },
            { value: "risk", label: "Fewest risks" },
            { value: "recent", label: "Recently updated" },
          ]}
        />
        <Segmented
          ariaLabel="View"
          size="sm"
          value={view}
          onValueChange={(value) => set("view", value === "grid" ? null : value)}
          options={[
            { value: "grid", label: <LayoutGrid className="size-4" strokeWidth={1.5} />, ariaLabel: "Cards" },
            { value: "table", label: <List className="size-4" strokeWidth={1.5} />, ariaLabel: "Table" },
          ]}
        />
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className="chip-filter shrink-0">
      {children}
    </button>
  );
}
