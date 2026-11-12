import { getPrisma } from "@/lib/db/client";
import { env } from "@/lib/env";

/**
 * Per-user notional limits and the runtime kill switch.
 *
 * Caps are expressed in whole USDC because USDC is the only executable asset and is the unit the
 * user typed. They are converted to atomic units once, here, and compared as integers. A cap in
 * USD that needs a price feed would be a cap that changes when the feed moves; this one does not.
 *
 * Counted states are every quote that could still become a deposit. Failed and refunded quotes do
 * not consume headroom; a quote that is merely `quoted` does, because the user may still fund it.
 */

const COUNTED_QUOTE_STATUSES = ["quoted", "deposited", "processing", "success"];

export function startOfUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export type ExecutionLimits = {
  maxMoveAtomic: bigint;
  maxDailyAtomic: bigint;
  dailyUsedAtomic: bigint;
  disabled: boolean;
  disabledReason: string | null;
};

/**
 * The kill switch alone, for the shell and the session endpoint.
 *
 * Reads the database flag and merges the environment flag. Kept separate from
 * `loadExecutionLimits` so a page can report "execution disabled" without loading a user's quotes.
 */
export async function loadExecutionSwitch(): Promise<{ disabled: boolean; reason: string | null }> {
  const flag = await getPrisma().systemFlag.findUnique({ where: { key: "execution_disabled" } });
  const runtimeDisabled = flag?.value === "true";
  const disabled = env.EXECUTION_DISABLED || runtimeDisabled;
  return {
    disabled,
    reason: disabled
      ? runtimeDisabled
        ? "Execution is disabled by the runtime kill switch."
        : "Execution is disabled by configuration."
      : null,
  };
}

export async function loadExecutionLimits(input: {
  userId: string;
  decimals: number;
  now?: Date;
}): Promise<ExecutionLimits> {
  const prisma = getPrisma();
  const now = input.now ?? new Date();
  const unit = 10n ** BigInt(input.decimals);

  const [flag, quotes] = await Promise.all([
    prisma.systemFlag.findUnique({ where: { key: "execution_disabled" } }),
    prisma.quote.findMany({
      where: {
        userId: input.userId,
        createdAt: { gte: startOfUtcDay(now) },
        status: { in: COUNTED_QUOTE_STATUSES },
      },
      select: { originAmountAtomic: true },
    }),
  ]);

  const dailyUsedAtomic = quotes.reduce((sum, quote) => {
    try {
      return sum + BigInt(quote.originAmountAtomic);
    } catch {
      return sum;
    }
  }, 0n);

  const runtimeDisabled = flag?.value === "true";
  const disabled = env.EXECUTION_DISABLED || runtimeDisabled;

  return {
    maxMoveAtomic: BigInt(Math.round(env.EXECUTION_MAX_MOVE_USDC)) * unit,
    maxDailyAtomic: BigInt(Math.round(env.EXECUTION_MAX_DAILY_USDC)) * unit,
    dailyUsedAtomic,
    disabled,
    disabledReason: disabled
      ? runtimeDisabled
        ? "Execution is disabled by the runtime kill switch."
        : "Execution is disabled by configuration."
      : null,
  };
}

/** Remaining daily headroom, floored at zero. */
export function remainingDailyAtomic(limits: ExecutionLimits): bigint {
  const remaining = limits.maxDailyAtomic - limits.dailyUsedAtomic;
  return remaining > 0n ? remaining : 0n;
}
