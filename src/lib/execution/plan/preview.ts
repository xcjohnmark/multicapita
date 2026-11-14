import type { PlanCheck } from "@/lib/policy/plan";
import type { LedgerEffect } from "./ledger";
import type { LegQuote } from "./quote";
import type { PlanKind, PlannedStep, StepType } from "./types";

/**
 * The JSON a plan stores in `previewJson`, and what the Execute panel and tracker render.
 * Amounts are atomic strings; floats appear only as USD valuations.
 */

export type AmountView = {
  atomic: string;
  decimals: number;
  symbol: string;
  chainId: number;
  usd: number | null;
};

export type SerializedStep = {
  type: StepType;
  chainId: number;
  title: string;
  amountAtomic: string | null;
  symbol: string | null;
  decimals: number | null;
  simulationOnly: string | null;
};

/** What a completed simulated entry turns into. */
export type FinalizeEntry = {
  kind: "position";
  strategyType: string;
  protocolId: string;
  chainId: number;
  positionReference: string;
  valueUsd: number | null;
  underlying: { symbol: string; amountAtomic: string; decimals: number };
};

/** What a completed exit does to its position (applied on read, see `applyPositionExits`). */
export type FinalizeExit = { kind: "exit"; positionId: string; amountUsd: number | null; closes: boolean };

export type PlanPreview = {
  version: 1;
  ok: boolean;
  simulated: boolean;
  kind: PlanKind;
  title: string;
  targetLabel: string | null;
  amount: AmountView;
  receive: (AmountView & { label: string }) | null;
  route: LegQuote | null;
  routeError: string | null;
  ratePercent: number | null;
  rateLabel: string | null;
  estYearlyUsd: number | null;
  checks: PlanCheck[];
  steps: SerializedStep[];
  ledger: { debit: LedgerEffect | null; credit: LedgerEffect | null };
  finalize: FinalizeEntry | FinalizeExit | null;
  quotedAt: string;
  expiresAt: string;
};

export function serializeSteps(steps: PlannedStep[]): SerializedStep[] {
  return steps.map((step) => ({
    type: step.type,
    chainId: step.chainId,
    title: step.title,
    amountAtomic: step.amountAtomic === null ? null : step.amountAtomic.toString(),
    symbol: step.symbol,
    decimals: step.decimals,
    simulationOnly: step.simulationOnly ?? null,
  }));
}

/** A draft must be approved while its dry quote is still representative. */
export const PLAN_FRESH_MS = 10 * 60_000;

export function readPreview(value: unknown): PlanPreview | null {
  if (!value || typeof value !== "object") return null;
  const preview = value as PlanPreview;
  return preview.version === 1 ? preview : null;
}
