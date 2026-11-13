"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";

/**
 * Shared on-demand sync trigger for server-rendered pages (Portfolio, Opportunities).
 * Calls a same-origin POST endpoint, displays inline errors if any, and refreshes the route.
 */
export function SyncButton({
  endpoint,
  label,
  iconOnly = false,
  variant = "secondary",
  onSynced,
}: {
  endpoint: string;
  label: string;
  iconOnly?: boolean;
  variant?: "secondary" | "highlight" | "primary";
  onSynced?: (payload: unknown) => void;
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      const response = await fetch(endpoint, { method: "POST" });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setError(body.error?.message ?? "Sync failed.");
        return;
      }
      onSynced?.(body);
      router.refresh();
    } catch {
      setError("Could not reach sync endpoint.");
    } finally {
      setSyncing(false);
    }
  }

  const variantClass =
    variant === "highlight"
      ? "btn-highlight"
      : variant === "primary"
        ? "btn-primary"
        : "btn-secondary";

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleSync}
        disabled={syncing}
        data-loading={syncing ? "true" : undefined}
        aria-label={label}
        title={label}
        className={`btn ${variantClass} ${
          iconOnly ? "btn-icon [&_svg:not([class*='size-'])]:size-4" : "h-9 px-3.5 text-sm"
        }`}
      >
        <RefreshCw
          className={`${iconOnly ? "size-4" : "size-3.5"} ${syncing ? "animate-spin" : ""}`}
          strokeWidth={1.5}
          aria-hidden
        />
        {iconOnly ? null : <span>{syncing ? "Syncing…" : label}</span>}
      </button>
      {error ? (
        <span role="alert" className="text-xs text-danger-text">
          {error}
        </span>
      ) : null}
    </div>
  );
}
