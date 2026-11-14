"use client";

import type { ReactNode } from "react";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { cn } from "@/lib/ui/cn";

/**
 * Single-choice segmented control (Base UI ToggleGroup): grid/table view, slippage, percent
 * shortcuts. Always one value; pressing the active item keeps it selected.
 */
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  size = "md",
  className,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: { value: T; label: ReactNode; ariaLabel?: string }[];
  ariaLabel: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <ToggleGroup
      aria-label={ariaLabel}
      value={[value]}
      onValueChange={(next) => {
        const picked = next[0] as T | undefined;
        if (picked) onValueChange(picked);
      }}
      className={cn("inline-flex items-center gap-1 rounded-[var(--radius-control)] bg-surface-raised p-1", className)}
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          aria-label={option.ariaLabel}
          className={cn(
            "inline-flex items-center justify-center rounded-[10px] text-ink-secondary transition-colors duration-100 select-none hover:text-ink data-pressed:bg-canvas data-pressed:text-ink",
            size === "sm" ? "h-8 min-w-10 px-2.5 text-[13px]" : "h-10 min-w-11 px-3 text-sm",
          )}
        >
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
