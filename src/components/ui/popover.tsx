"use client";

import type { ReactElement, ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { Tooltip } from "@base-ui/react/tooltip";
import { cn } from "@/lib/ui/cn";

/** Click-to-open popover anchored to `trigger` (a single button element). */
export function PopoverMenu({
  trigger,
  children,
  align = "end",
  className,
}: {
  trigger: ReactElement;
  children: ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger render={trigger} />
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align={align} className="z-[var(--z-popover)]">
          <Popover.Popup className={cn("popup-surface w-80 p-4 text-ink outline-none", className)}>
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Hover/focus tooltip. Content is short; never put actions inside a tooltip. */
export function Tip({ content, children }: { content: ReactNode; children: ReactElement }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={children} delay={150} />
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6} className="z-[var(--z-popover)]">
          <Tooltip.Popup className="popup-surface max-w-64 bg-ink px-2.5 py-1.5 text-xs leading-snug text-ink-invert">
            {content}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export const TipProvider = Tooltip.Provider;
