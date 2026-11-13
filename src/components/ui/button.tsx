import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

export type ButtonVariant =
  | "primary"
  | "accent"
  | "highlight"
  | "secondary"
  | "ghost"
  | "danger"
  | "hero"
  | "hero-primary"
  | "soft";

export type ButtonSize = "sm" | "md" | "lg" | "xl" | "icon";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  accent: "btn-accent",
  highlight: "btn-highlight",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
  hero: "btn-hero",
  "hero-primary": "btn-hero btn-hero-primary",
  soft: "border-transparent bg-surface-raised hover:not-disabled:bg-line-faint",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-[15px]",
  // Flow-page primary action (near.com "Please enter an amount"): full width, 56px.
  xl: "h-14 px-6 text-base",
  icon: "size-9 p-0 [&_svg:not([class*='size-'])]:size-5",
};

/** Class string for links and other elements that must look like a button. */
export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className?: string) {
  return cn("btn", VARIANT_CLASSES[variant], SIZE_CLASSES[size], className);
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  className,
  disabled,
  children,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      data-loading={loading ? "true" : undefined}
      aria-busy={loading || undefined}
      className={buttonClass(variant, size, className)}
      {...props}
    >
      {children}
    </button>
  );
}
