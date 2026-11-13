import { z } from "zod";

/**
 * The contract between the AI layer and the execution layer.
 *
 * Deliberately narrow: the model chooses *which* opportunities and *in what proportion*. It
 * never supplies a dollar amount, a token amount, a slippage tolerance or a recipient. Those are
 * derived from portfolio state by deterministic code, then enforced by the policy engine.
 */

export const strategyTypeSchema = z.enum([
  "yield_vault",
  "lending",
  "stablecoin_lp",
  "arbitrage",
  "tokenized_equity",
  "copytrading",
]);

export type StrategyType = z.infer<typeof strategyTypeSchema>;

export const strategyCategorySchema = z.enum([
  "yielding",
  "investing",
  "tokenized_stock",
  "arbitraging",
  "liquidity",
  "balanced",
]);

export type StrategyCategory = z.infer<typeof strategyCategorySchema>;

export const proposalLegSchema = z.object({
  /** Opportunity id from the tool results. */
  opportunityId: z.string().min(1).max(64),
  /** Share of the deployable amount. Weights are normalised to 10 000 by code. */
  weightBps: z.number().int().min(0).max(10_000),
  /** Why this leg exists, in the model's own words. Not a number. */
  rationale: z.string().min(1).max(600),
});

export type ProposalLeg = z.infer<typeof proposalLegSchema>;

export const aiProposalSchema = z.object({
  strategyName: z.string().min(1).max(120).default("Multi-Chain Strategy"),
  category: strategyCategorySchema.default("yielding"),
  summary: z.string().min(1).max(400).default("Balanced cross-chain allocation strategy."),
  howItWorks: z.array(z.string().min(1).max(300)).max(6).default([]),
  targetApy: z.number().min(0).max(10_000).default(0),
  decisionPoints: z.array(z.string().min(1).max(300)).max(6).default([]),
  objectiveSummary: z.string().min(1).max(400),
  legs: z.array(proposalLegSchema).min(1).max(8),
  /**
   * Share of the deployable amount this plan actually deploys, in bps. Defaults to all of it.
   * Present so a plan that is limited by concentration caps can say "deploy less" instead of
   * having its weights silently normalised back up to 100%.
   */
  deployBps: z.number().int().min(0).max(10_000).default(10_000),
  riskNotes: z.array(z.string().min(1).max(400)).max(8).default([]),
  requiresUserInput: z.array(z.string().min(1).max(300)).max(8).default([]),
});

export type AiProposal = z.infer<typeof aiProposalSchema>;

/** Guardrails as stored on `StrategyConstraint`, with nullable approvals normalised. */
export const guardrailsSchema = z.object({
  minLiquidPercent: z.number().min(0).max(100),
  maxProtocolExposurePercent: z.number().min(0).max(100),
  maxAssetExposurePercent: z.number().min(0).max(100),
  maxChainExposurePercent: z.number().min(0).max(100),
  maxStrategyExposurePercent: z.number().min(0).max(100),
  maxSlippageBps: z.number().int().min(0).max(10_000),
  maxGasUsd: z.number().min(0),
  minArbitrageProfitUsd: z.number().min(0),
  approvedChainIds: z.array(z.number().int()).nullable().default(null),
  approvedProtocols: z.array(z.string()).nullable().default(null),
  requiresUserApproval: z.boolean().default(true),
});

export type Guardrails = z.infer<typeof guardrailsSchema>;

export const DEFAULT_GUARDRAILS: Guardrails = {
  minLiquidPercent: 30,
  maxProtocolExposurePercent: 40,
  maxAssetExposurePercent: 70,
  maxChainExposurePercent: 80,
  maxStrategyExposurePercent: 60,
  maxSlippageBps: 100,
  maxGasUsd: 25,
  minArbitrageProfitUsd: 5,
  approvedChainIds: [8453, 42161],
  approvedProtocols: null,
  requiresUserApproval: true,
};

export const violationCodeSchema = z.enum([
  "no_legs",
  "weights_zero",
  "opportunity_not_found",
  "opportunity_not_active",
  "opportunity_expired",
  "opportunity_unpriced",
  "chain_not_approved",
  "protocol_not_approved",
  "liquid_reserve_below_minimum",
  "exposure_protocol_exceeded",
  "exposure_asset_exceeded",
  "exposure_chain_exceeded",
  "exposure_strategy_exceeded",
  "insufficient_available_balance",
  "slippage_above_maximum",
  "arbitrage_profit_below_minimum",
  "sample_data_in_plan",
  "weights_normalized",
  "user_approval_required",
  "memecoin_excluded_in_copytrading",
  "copy_price_drift_exceeded",
  "copy_trade_cap_exceeded",
  "copy_daily_budget_exceeded",
]);

export type ViolationCode = z.infer<typeof violationCodeSchema>;

export type Violation = {
  code: ViolationCode;
  severity: "error" | "warning" | "info";
  message: string;
  /** Machine-readable context so the UI never has to parse prose. */
  context?: Record<string, string | number | boolean | null>;
};

export type PlannedLeg = {
  opportunityId: string;
  strategyType: StrategyType;
  protocolSlug: string;
  protocolName: string;
  chainId: number;
  chainName: string;
  asset: string;
  weightBps: number;
  amountUsdCents: string;
  amountUsd: number;
  rationale: string;
  dataMode: string;
  expectedRatePercent: number | null;
  rateType: string | null;
};

export type PolicyEvaluation = {
  ok: boolean;
  legs: PlannedLeg[];
  violations: Violation[];
  totals: {
    totalUsd: number;
    deployableUsd: number;
    reserveUsd: number;
    reservePercent: number;
    allocatedUsd: number;
  };
};
