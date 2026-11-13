"use client";

import type { ReactNode } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/ui/cn";

/**
 * Modal surfaces (Base UI). `Modal` is for pickers and forms; `ConfirmDialog` is the
 * AlertDialog used before anything irreversible (baseline-ui): it cannot be dismissed by a
 * backdrop click, only by an explicit Cancel or the confirm action.
 */

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className={cn("dialog-popup p-5", className)}>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Dialog.Title className="type-h6 text-balance text-ink">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-sm text-pretty text-ink-muted">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close className="btn btn-ghost btn-icon -mr-1.5 -mt-1.5" aria-label="Close">
              <X className="size-5" strokeWidth={1.5} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  onConfirm,
  confirming = false,
  confirmDisabled = false,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  confirming?: boolean;
  confirmDisabled?: boolean;
  error?: string | null;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="dialog-backdrop" />
        <AlertDialog.Popup className="dialog-popup p-5">
          <AlertDialog.Title className="type-h5 text-balance text-ink">{title}</AlertDialog.Title>
          {description ? (
            <AlertDialog.Description className="mt-1.5 text-sm text-pretty text-ink-muted">
              {description}
            </AlertDialog.Description>
          ) : null}
          {children ? <div className="mt-5">{children}</div> : null}
          {error ? (
            <p role="alert" className="mt-4 rounded-[var(--radius-control)] bg-red-50 px-3 py-2 text-sm text-danger-text">
              {error}
            </p>
          ) : null}
          <div className="mt-6 grid grid-cols-2 gap-2">
            <AlertDialog.Close className="btn btn-secondary h-12" disabled={confirming}>
              Cancel
            </AlertDialog.Close>
            <button
              type="button"
              className="btn btn-primary h-12"
              onClick={onConfirm}
              disabled={confirmDisabled || confirming}
              data-loading={confirming ? "true" : undefined}
            >
              {confirmLabel}
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
