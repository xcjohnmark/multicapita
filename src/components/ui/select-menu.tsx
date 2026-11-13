"use client";

import type { ReactNode } from "react";
import { Select } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/ui/cn";

/**
 * Accessible select (Base UI) in two looks:
 *  - `field`: compact 44px trigger, used for sort and small options;
 *  - `picker`: the near.com Send/Receive row with an icon, a small label and a large value.
 */

export type SelectOption = {
  value: string;
  label: string;
  icon?: ReactNode;
  meta?: ReactNode;
  disabled?: boolean;
};

export function SelectMenu({
  value,
  onValueChange,
  options,
  label,
  placeholder = "Select",
  variant = "field",
  className,
  ariaLabel,
}: {
  value: string | null;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  label?: string;
  placeholder?: string;
  variant?: "field" | "picker";
  className?: string;
  ariaLabel?: string;
}) {
  const selected = options.find((option) => option.value === value) ?? null;

  return (
    <Select.Root
      value={value}
      onValueChange={(next) => {
        if (typeof next === "string") onValueChange(next);
      }}
      items={options.map((option) => ({ value: option.value, label: option.label }))}
    >
      {variant === "picker" ? (
        <Select.Trigger className={cn("picker-row", className)} aria-label={ariaLabel ?? label}>
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-surface-raised">
            {selected?.icon ?? <span className="size-6 rounded-full border-2 border-dashed border-ink-faint" />}
          </span>
          <span className="min-w-0 flex-1">
            {label && selected ? <span className="block text-sm text-ink-muted">{label}</span> : null}
            <span className="block truncate text-lg text-ink">{selected?.label ?? placeholder}</span>
          </span>
          <ChevronDown className="size-5 shrink-0 text-ink-secondary" strokeWidth={1.5} aria-hidden />
        </Select.Trigger>
      ) : (
        <Select.Trigger
          className={cn("field cursor-pointer justify-between whitespace-nowrap", className)}
          aria-label={ariaLabel ?? label}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected?.icon}
            <span className="truncate">{selected?.label ?? placeholder}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-ink-secondary" strokeWidth={1.5} aria-hidden />
        </Select.Trigger>
      )}
      <Select.Portal>
        <Select.Positioner sideOffset={6} alignItemWithTrigger={false} className="z-[var(--z-popover)]">
          <Select.Popup className="popup-surface min-w-[var(--anchor-width)] p-1.5">
            <Select.List className="max-h-[min(22rem,var(--available-height))] overflow-y-auto">
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className="flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5 text-[0.9375rem] text-ink outline-none select-none data-disabled:cursor-not-allowed data-disabled:opacity-40 data-highlighted:bg-surface-raised"
                >
                  {option.icon ? <span className="shrink-0">{option.icon}</span> : null}
                  <Select.ItemText className="min-w-0 flex-1 truncate">{option.label}</Select.ItemText>
                  {option.meta ? (
                    <span className="shrink-0 text-sm text-ink-muted tabular-nums">{option.meta}</span>
                  ) : null}
                  <Select.ItemIndicator className="shrink-0">
                    <Check className="size-4" strokeWidth={1.75} aria-hidden />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
