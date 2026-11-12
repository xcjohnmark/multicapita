"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AssetIcon } from "@/components/ui/asset-icon";

export interface MosaicItem {
  id: string;
  iconSymbol?: string;
  badge?: string;
  badgeColor?: string;
  title: string;
  subtitle: string;
  chainOrCategory: string;
  statLabel: string;
  statValue: string;
  statTone?: "positive" | "highlight" | "default";
  iconBg?: string;
  iconText?: string;
}

interface TileState {
  assetIndex: number;
  previousIndex: number | null;
}

interface MosaicEngineState {
  tiles: TileState[];
  queue: number[];
}

function clearPendingFlip(state: MosaicEngineState, tileIdx: number): MosaicEngineState {
  const tile = state.tiles[tileIdx];
  if (!tile || tile.previousIndex === null) return state;
  return {
    ...state,
    tiles: state.tiles.map((t, i) =>
      i === tileIdx ? { assetIndex: t.assetIndex, previousIndex: null } : t
    ),
  };
}

export function FlowMosaicHeaderVisual({ items }: { items: MosaicItem[] }) {
  if (items.length < 9) {
    throw new Error("Mosaic requires at least 9 items to cycle smoothly.");
  }

  const [engine, setEngine] = useState<MosaicEngineState>(() => {
    const indices = Array.from({ length: items.length }, (_, i) => i);
    return {
      tiles: indices.slice(0, 9).map((idx) => ({ assetIndex: idx, previousIndex: null })),
      queue: indices.slice(9),
    };
  });

  const isVisibleRef = useRef(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timeouts = new Set<number>();
    const safeTimeout = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        timeouts.delete(id);
        fn();
      }, ms);
      timeouts.add(id);
    };

    // Staggered interval cycles for each tile (9 tiles, 3x3)
    for (let tileIdx = 0; tileIdx < 9; tileIdx++) {
      const period = 3200 + ((5 * tileIdx + 2) % 9) * 450;
      const initialDelay = 400 + 220 * tileIdx;

      const triggerFlip = () => {
        if (!isVisibleRef.current) return;

        setEngine((prev) => {
          const cleared = clearPendingFlip(prev, tileIdx);
          const currentTile = cleared.tiles[tileIdx];
          if (!currentTile) return prev;

          const currentlyFlippingOld = new Set(
            cleared.tiles.flatMap((t) => (t.previousIndex !== null ? [t.previousIndex] : []))
          );

          // Find candidate from queue that isn't currently transitioning out
          const nextCandidate = cleared.queue.find((q) => !currentlyFlippingOld.has(q));
          if (nextCandidate === undefined) return prev;

          return {
            tiles: cleared.tiles.map((t, idx) =>
              idx === tileIdx ? { assetIndex: nextCandidate, previousIndex: t.assetIndex } : t
            ),
            queue: [...cleared.queue.filter((q) => q !== nextCandidate), currentTile.assetIndex],
          };
        });

        // 750ms matches the CSS animation duration for flipping
        safeTimeout(() => {
          setEngine((prev) => clearPendingFlip(prev, tileIdx));
        }, 750);

        safeTimeout(triggerFlip, period);
      };

      safeTimeout(triggerFlip, initialDelay);
    }

    return () => {
      timeouts.forEach((id) => window.clearTimeout(id));
    };
  }, [items.length]);

  return (
    <div ref={containerRef} className="w-full select-none">
      <div
        aria-hidden="true"
        className="grid grid-cols-3 gap-2.5 sm:gap-3 lg:gap-3.5 max-w-[460px] mx-auto lg:max-w-none"
      >
        {engine.tiles.map((tile, i) => {
          const currentItem = items[tile.assetIndex];
          const prevItem = tile.previousIndex !== null ? items[tile.previousIndex] : null;

          return (
            <div
              key={i}
              className="relative aspect-square [perspective:800px] rounded-xl overflow-hidden border border-line bg-surface"
            >
              {prevItem && currentItem ? (
                <div
                  key={`${prevItem.id}->${currentItem.id}`}
                  className="landing-mosaic-flip absolute inset-0"
                >
                  <TileFace item={prevItem} className="landing-mosaic-face" />
                  <TileFace item={currentItem} className="landing-mosaic-face landing-mosaic-back" />
                </div>
              ) : currentItem ? (
                <TileFace item={currentItem} />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TileFace({
  item,
  className = "",
}: {
  item: MosaicItem;
  className?: string;
}) {
  const statToneClass =
    item.statTone === "positive"
      ? "text-accent-text bg-accent/10"
      : item.statTone === "highlight"
        ? "text-highlight-ink bg-highlight"
        : "text-ink-secondary bg-surface-raised";

  return (
    <div
      className={`absolute inset-0 flex flex-col justify-between p-3 sm:p-3.5 bg-canvas transition-colors duration-200 ${className}`}
    >
      <div className="flex items-center justify-between gap-1">
        {item.iconSymbol ? (
          <AssetIcon symbolOrName={item.iconSymbol} size="lg" className="rounded-lg shadow-xs" />
        ) : (
          <div
            className="size-7 sm:size-8 rounded-lg flex items-center justify-center font-bold text-xs shadow-xs"
            style={{ backgroundColor: item.iconBg ?? "#F3F4F6", color: item.iconText ?? "#111827" }}
          >
            {item.title.slice(0, 2).toUpperCase()}
          </div>
        )}
        {item.badge ? (
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-line/60 bg-surface text-ink-muted tracking-tight"
          >
            {item.badge}
          </span>
        ) : null}
      </div>

      <div className="mt-auto">
        <div className="flex items-baseline justify-between gap-1">
          <p className="text-xs sm:text-sm font-semibold tracking-tight text-ink truncate">
            {item.title}
          </p>
          <span className="text-[10px] text-ink-muted uppercase tracking-wider font-mono">
            {item.chainOrCategory}
          </span>
        </div>
        <p className="text-[11px] text-ink-muted truncate">{item.subtitle}</p>

        <div className="mt-2 pt-1.5 border-t border-line/60 flex items-center justify-between">
          <span className="text-[9px] uppercase font-medium text-ink-faint tracking-wider">
            {item.statLabel}
          </span>
          <span
            className={`font-mono text-[11px] font-semibold px-1 rounded-sm ${statToneClass}`}
          >
            {item.statValue}
          </span>
        </div>
      </div>
    </div>
  );
}
