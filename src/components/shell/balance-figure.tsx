"use client";

import { useSyncExternalStore } from "react";
import { Eye, EyeOff } from "lucide-react";
import { formatUsd } from "@/lib/format";

/**
 * Hero total with a hide toggle (near.com). The preference is a per-browser convenience in
 * localStorage; every read and write is guarded so a blocked storage just shows the figure.
 */

const KEY = "capita:hide-balance";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useHiddenBalance(): [boolean, () => void] {
  const hidden = useSyncExternalStore(subscribe, read, () => false);
  const toggle = () => {
    try {
      window.localStorage.setItem(KEY, hidden ? "0" : "1");
    } catch {
      // Storage unavailable: the toggle simply doesn't persist.
    }
    listeners.forEach((listener) => listener());
  };
  return [hidden, toggle];
}

export function BalanceFigure({
  totalUsd,
  availableUsd,
  deployedUsd,
}: {
  totalUsd: number | null;
  availableUsd: number | null;
  deployedUsd: number | null;
}) {
  const [hidden, toggle] = useHiddenBalance();
  const mask = (value: number | null) => (hidden ? "••••" : formatUsd(value));
  const [whole, cents] = totalUsd === null ? ["$0", ".00"] : splitUsd(totalUsd);

  return (
    <div>
      <div className="flex items-center gap-2 text-hero-muted">
        <span className="text-[0.9375rem]">Total balance</span>
        <button
          type="button"
          onClick={toggle}
          className="grid size-8 place-items-center rounded-full transition-colors duration-100 hover:bg-hero-raised hover:text-hero-ink"
          aria-label={hidden ? "Show balance" : "Hide balance"}
          aria-pressed={hidden}
        >
          {hidden ? <EyeOff className="size-4" strokeWidth={1.5} /> : <Eye className="size-4" strokeWidth={1.5} />}
        </button>
      </div>
      <p className="figure mt-1 text-[2.75rem] leading-none text-hero-ink sm:text-[3.5rem]" aria-live="polite">
        {hidden ? (
          "••••••"
        ) : (
          <>
            {whole}
            <span className="text-hero-muted">{cents}</span>
          </>
        )}
      </p>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-hero-muted tabular-nums">
        <span>
          Available <span className="text-hero-ink">{mask(availableUsd)}</span>
        </span>
        <span>
          Deployed <span className="text-hero-ink">{mask(deployedUsd)}</span>
        </span>
      </p>
    </div>
  );
}

function splitUsd(value: number): [string, string] {
  const text = formatUsd(value);
  const dot = text.lastIndexOf(".");
  return dot === -1 ? [text, ""] : [text.slice(0, dot), text.slice(dot)];
}
