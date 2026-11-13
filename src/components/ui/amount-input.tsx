"use client";

import { useId } from "react";
import { cn } from "@/lib/ui/cn";

/**
 * Large centred amount entry (near.com Send). The value is a decimal *string*; it is converted
 * to atomic units server-side with `parseDecimalToAtomic`, never with float maths here.
 */

const DECIMAL = /^\d*\.?\d*$/;

export function sanitizeAmount(raw: string, maxDecimals: number): string | null {
  const value = raw.replace(/,/g, "").trim();
  if (value === "") return "";
  if (!DECIMAL.test(value)) return null;
  const [, fraction = ""] = value.split(".");
  if (fraction.length > maxDecimals) return null;
  // Keep a single leading zero ("0.5", not "00.5").
  return value.replace(/^0+(?=\d)/, "");
}

export function AmountInput({
  value,
  onChange,
  symbol,
  decimals,
  usdHint,
  balanceLabel,
  onMax,
  shortcuts,
  invalid,
  label = "Amount",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  symbol: string;
  decimals: number;
  usdHint?: string | null;
  balanceLabel?: string | null;
  onMax?: () => void;
  shortcuts?: { label: string; onSelect: () => void }[];
  invalid?: boolean;
  label?: string;
  className?: string;
}) {
  const id = useId();
  const length = Math.max(value.length, 1);
  const fontSize = length > 12 ? "text-4xl" : length > 8 ? "text-5xl" : "text-6xl";

  return (
    <div className={cn("rounded-[var(--radius-panel)] border border-line px-5 pt-8 pb-4", className)}>
      <label htmlFor={id} className="sr-only">
        {label} in {symbol}
      </label>
      <div className="flex items-baseline justify-center gap-2">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder="0"
          value={value}
          aria-invalid={invalid || undefined}
          onChange={(event) => {
            const next = sanitizeAmount(event.target.value, decimals);
            if (next !== null) onChange(next);
          }}
          style={{ width: `${length + 0.5}ch` }}
          className={cn(
            "figure min-w-[1.5ch] max-w-full bg-transparent text-center leading-none text-ink outline-none placeholder:text-ink-faint",
            fontSize,
            invalid && "text-danger-text",
          )}
        />
        <span className={cn("text-2xl leading-none", value ? "text-ink-secondary" : "text-ink-faint")}>{symbol}</span>
      </div>
      <p className="mt-3 text-center text-base text-ink-secondary tabular-nums">{usdHint ?? "$0.00"}</p>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-muted tabular-nums">{balanceLabel ?? ""}</p>
        <div className="flex items-center gap-1">
          {shortcuts?.map((shortcut) => (
            <button
              key={shortcut.label}
              type="button"
              onClick={shortcut.onSelect}
              className="btn btn-ghost h-8 px-2.5 text-[13px]"
            >
              {shortcut.label}
            </button>
          ))}
          {onMax ? (
            <button type="button" onClick={onMax} className="btn h-8 border-transparent bg-surface-raised px-3 text-[13px]">
              Use max
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
