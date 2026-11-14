import type { StepStatus, StepType } from "./types";

/**
 * Simulated settlement for plans outside live mode.
 *
 * The quotes and calldata behind a simulated plan are real; only settlement is simulated. The
 * timeline is a pure function of the approval time and the clock, so it needs no background job:
 * every read recomputes where the plan is. Durations are rough orders of magnitude for each kind
 * of step (a 1Click leg takes longer than an approval), not promises.
 */

export const SIMULATED_DURATION_MS: Record<StepType, number> = {
  bridge: 14_000,
  swap: 12_000,
  approve: 4_000,
  supply: 6_000,
  withdraw: 6_000,
  vault_deposit: 6_000,
  vault_redeem: 6_000,
  lp_mint: 7_000,
  lp_collect: 5_000,
  lp_exit: 7_000,
  equity_buy: 7_000,
  equity_sell: 7_000,
  dex_swap: 6_000,
  transfer: 5_000,
  record: 1_500,
};

/** Share of a step's duration spent "submitted" before it shows as "settling". */
const SUBMITTED_SHARE = 0.35;

export type SimulatedStepState = {
  status: StepStatus;
  startedAt: Date | null;
  completedAt: Date | null;
};

export function simulatedTimeline(
  steps: { type: StepType }[],
  approvedAt: Date,
  now: Date,
): { steps: SimulatedStepState[]; completed: boolean; completedAt: Date | null } {
  let cursor = approvedAt.getTime();
  const clock = now.getTime();
  const states: SimulatedStepState[] = steps.map((step) => {
    const start = cursor;
    const end = start + SIMULATED_DURATION_MS[step.type];
    cursor = end;
    if (clock >= end) return { status: "done", startedAt: new Date(start), completedAt: new Date(end) };
    if (clock < start) return { status: "pending", startedAt: null, completedAt: null };
    const progress = (clock - start) / (end - start);
    return {
      status: progress < SUBMITTED_SHARE ? "submitted" : "settling",
      startedAt: new Date(start),
      completedAt: null,
    };
  });
  const completed = clock >= cursor;
  return { steps: states, completed, completedAt: completed ? new Date(cursor) : null };
}

/** Reference for a simulated step. Deliberately not shaped like a transaction hash. */
export function simulationRef(planId: string, index: number): string {
  return `sim-${planId.slice(-6)}-${index + 1}`;
}
