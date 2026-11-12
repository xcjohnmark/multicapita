import { getViewer } from "@/lib/auth/viewer";
import { isSessionConfigured } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { loadExecutionSwitch } from "@/lib/execution/limits";

/**
 * Everything the shell needs to describe the current session truthfully.
 *
 * Resolved on the server so the header never renders a placeholder that later turns out to be
 * wrong: the mode chip, the address chip and the execution envelope are all decided before the
 * first paint.
 */

export type ShellSession = {
  authenticated: boolean;
  demo: boolean;
  address: string | null;
  dataMode: string;
  dataModeLabel: string;
  sessionConfigured: boolean;
  executionEnabled: boolean;
  executionReason: string | null;
  maxMoveUsdc: number;
  maxDailyUsdc: number;
};

const MODE_LABELS: Record<string, string> = {
  sample: "Sample data",
  dry_run: "Dry run",
  live: "Live mainnet",
};

export async function getShellSession(): Promise<ShellSession> {
  const [viewer, execution] = await Promise.all([getViewer(), loadExecutionSwitch()]);

  return {
    authenticated: Boolean(viewer && !viewer.demo),
    demo: viewer?.demo ?? false,
    address: viewer?.address ?? null,
    dataMode: env.APP_DATA_MODE,
    dataModeLabel: MODE_LABELS[env.APP_DATA_MODE] ?? env.APP_DATA_MODE,
    sessionConfigured: isSessionConfigured(),
    executionEnabled: env.APP_DATA_MODE === "live" && !execution.disabled,
    executionReason:
      env.APP_DATA_MODE !== "live"
        ? `Execution requires live mode; this deployment is in ${env.APP_DATA_MODE}.`
        : execution.reason,
    maxMoveUsdc: env.EXECUTION_MAX_MOVE_USDC,
    maxDailyUsdc: env.EXECUTION_MAX_DAILY_USDC,
  };
}
