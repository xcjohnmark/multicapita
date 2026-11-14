import { z } from "zod";

/** What a plan is for. One Execute click creates one plan. */
export const planKindSchema = z.enum([
  "opportunity_entry",
  "position_exit",
  "swap",
  "send",
  "strategy",
  "copy",
]);
export type PlanKind = z.infer<typeof planKindSchema>;

/** One independently settling action. Steps never share a transaction. */
export const stepTypeSchema = z.enum([
  "bridge", // 1Click, same asset across chains
  "swap", // 1Click, different assets (same or different chain)
  "approve", // ERC-20 allowance for the next step's spender
  "supply", // Aave supply
  "withdraw", // Aave withdraw
  "vault_deposit", // ERC-4626 deposit
  "vault_redeem", // ERC-4626 withdraw
  "lp_mint", // Uniswap v3 mint
  "lp_collect", // Uniswap v3 collect fees
  "lp_exit", // remove liquidity (simulated only for now)
  "equity_buy", // SwapRouter02 USDC → tokenized stock
  "equity_sell", // SwapRouter02 tokenized stock → USDC
  "dex_swap", // arbitrage sell leg (simulated only)
  "transfer", // plain ERC-20/native transfer
  "record", // reconcile and record the resulting position
]);
export type StepType = z.infer<typeof stepTypeSchema>;

export const stepStatusSchema = z.enum([
  "pending",
  "ready",
  "awaiting_signature",
  "submitted",
  "settling",
  "done",
  "failed",
  "refunded",
  "skipped",
]);
export type StepStatus = z.infer<typeof stepStatusSchema>;

export function parseStepStatus(value: string): StepStatus {
  const parsed = stepStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : "pending";
}

export function parseStepType(value: string): StepType {
  const parsed = stepTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : "record";
}

/** The action a target needs once capital is on the right chain. */
export type TargetAction =
  | "supply"
  | "vault_deposit"
  | "lp_mint"
  | "equity_buy"
  | "arbitrage";

export type ExitAction = "withdraw" | "vault_redeem" | "lp_exit" | "lp_collect" | "equity_sell";

/** A step as the builder emits it, before it is persisted. */
export type PlannedStep = {
  type: StepType;
  chainId: number;
  title: string;
  /** Exact input amount for this step, or null when the step has no amount (record). */
  amountAtomic: bigint | null;
  symbol: string | null;
  decimals: number | null;
  /** Reason the step can only be simulated (no live builder yet). */
  simulationOnly?: string;
  meta?: Record<string, string | number | boolean | null>;
};

export const STEP_ACTION_NEEDS_APPROVAL: Partial<Record<StepType, true>> = {
  supply: true,
  vault_deposit: true,
  lp_mint: true,
  equity_buy: true,
  equity_sell: true,
};
