import { applySlippageDown } from "@/lib/finance/amounts";
import { getChain } from "@/lib/chains";

/**
 * Execution-layer guardrails for a single cross-chain move.
 *
 * This is deliberately narrower than the portfolio policy engine: it only guards the asset being
 * moved, and it measures exposure in token units rather than USD. That is not a loophole — it is
 * the only check that can be computed exactly without a verified price source. The portfolio
 * engine remains the authority for the plan; this engine is the authority for the transaction.
 *
 * Pure: no I/O, no clock. Every number here is exact integer arithmetic.
 */

export type ExecutionViolationCode =
  | "unsupported_chain"
  | "same_chain"
  | "amount_below_minimum"
  | "insufficient_balance"
  | "chain_exposure_exceeded"
  | "slippage_above_maximum"
  | "output_below_minimum";

export type ExecutionViolation = {
  code: ExecutionViolationCode;
  severity: "error" | "warning";
  message: string;
  context?: Record<string, string | number | boolean | null>;
};

export type MoveEvaluationInput = {
  fromChainId: number;
  toChainId: number;
  amountAtomic: bigint;
  /** Live balance of the exact token on the origin chain. */
  originBalanceAtomic: bigint;
  /** Total USDC held on the origin chain after the move is excluded. */
  originChainTotalAtomic: bigint;
  /** Total USDC already held on the destination chain. */
  destinationChainTotalAtomic: bigint;
  /** From the fresh committed quote. */
  expectedOutputAtomic: bigint;
  slippageBps: number;
  maxSlippageBps: number;
  maxChainExposurePercent: number;
  minAmountAtomic: bigint;
};

export type MoveEvaluation = {
  ok: boolean;
  violations: ExecutionViolation[];
  destinationSharePercent: number;
  minimumOutputAtomic: bigint;
};

/**
 * Below this many whole tokens, fixed per-quote costs dominate: 10 USDC Earn quotes returned
 * "no liquidity". Expressed in whole tokens so the atomic threshold is derived from the token's
 * own decimals rather than assuming six.
 */
export const MIN_MOVE_UNITS = 10;

export function minMoveAtomic(decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error(`Invalid token decimals: ${decimals}`);
  }
  return BigInt(MIN_MOVE_UNITS) * 10n ** BigInt(decimals);
}

/** USDC convenience constant. New code should call `minMoveAtomic(token.decimals)`. */
export const MIN_MOVE_ATOMIC = minMoveAtomic(6);

/**
 * Hard ceiling on slippage for a stablecoin cross-chain move, independent of the user's guardrail.
 * A stablecoin route should never need more than 1%; if it does, the move is not worth making.
 * The effective tolerance is `min(guardrail, this)`.
 */
export const MAX_CROSS_CHAIN_SLIPPAGE_BPS = 100;

export function evaluateCrossChainMove(input: MoveEvaluationInput): MoveEvaluation {
  const violations: ExecutionViolation[] = [];
  const error = (v: Omit<ExecutionViolation, "severity">) =>
    violations.push({ ...v, severity: "error" });

  const origin = getChain(input.fromChainId);
  const destination = getChain(input.toChainId);

  if (!origin) {
    error({ code: "unsupported_chain", message: `Chain ${input.fromChainId} is not supported.` });
  }
  if (!destination) {
    error({ code: "unsupported_chain", message: `Chain ${input.toChainId} is not supported.` });
  }
  if (origin && destination && origin.id === destination.id) {
    error({
      code: "same_chain",
      message: "A cross-chain move must have different origin and destination chains.",
    });
  }

  if (input.amountAtomic < input.minAmountAtomic) {
    error({
      code: "amount_below_minimum",
      message: `The move is below the minimum of ${input.minAmountAtomic} atomic units.`,
      context: { amountAtomic: input.amountAtomic.toString(), minimum: input.minAmountAtomic.toString() },
    });
  }

  if (input.amountAtomic > input.originBalanceAtomic) {
    error({
      code: "insufficient_balance",
      message: "The move exceeds the live balance on the origin chain.",
      context: {
        amountAtomic: input.amountAtomic.toString(),
        balanceAtomic: input.originBalanceAtomic.toString(),
      },
    });
  }

  const totalAtomic = input.originChainTotalAtomic + input.destinationChainTotalAtomic;
  const destinationAfter = input.destinationChainTotalAtomic + input.amountAtomic;
  const destinationSharePercent =
    totalAtomic > 0n ? (Number(destinationAfter) / Number(totalAtomic)) * 100 : 0;

  if (destinationSharePercent > input.maxChainExposurePercent) {
    error({
      code: "chain_exposure_exceeded",
      message: `After the move, ${destination?.name ?? input.toChainId} would hold ${destinationSharePercent.toFixed(1)}% of the USDC, above the ${input.maxChainExposurePercent}% cap.`,
      context: {
        destinationChainId: input.toChainId,
        actual: destinationSharePercent,
        limit: input.maxChainExposurePercent,
      },
    });
  }

  if (input.slippageBps > input.maxSlippageBps) {
    error({
      code: "slippage_above_maximum",
      message: `Requested slippage ${input.slippageBps} bps exceeds the guardrail of ${input.maxSlippageBps} bps.`,
      context: { actual: input.slippageBps, limit: input.maxSlippageBps },
    });
  }

  const minimumOutputAtomic = applySlippageDown(input.expectedOutputAtomic, input.slippageBps);
  if (minimumOutputAtomic <= 0n) {
    error({
      code: "output_below_minimum",
      message: "The guaranteed minimum output is zero; the quote is not worth accepting.",
      context: {
        expectedOutputAtomic: input.expectedOutputAtomic.toString(),
        slippageBps: input.slippageBps,
      },
    });
  }

  return {
    ok: !violations.some((v) => v.severity === "error"),
    violations,
    destinationSharePercent,
    minimumOutputAtomic,
  };
}

/**
 * The final gate before a committed quote is requested.
 *
 * Returns a human-readable refusal, or null when execution is permitted. Every condition is
 * explicit because each one is a way a demo could accidentally move real funds.
 */
export function assertExecutionAllowed(input: {
  dataMode: string;
  explicitApproval: boolean;
  requestedAmountAtomic: bigint;
  approvedAmountAtomic: bigint;
  evaluationOk: boolean;
}): string | null {
  if (input.dataMode !== "live") {
    return `Execution is disabled while APP_DATA_MODE is "${input.dataMode}". Live deposits are only possible in live mode.`;
  }
  if (!input.explicitApproval) {
    return "Execution requires explicit human approval. A proposal that passes the policy engine is not an approval.";
  }
  if (!input.evaluationOk) {
    return "The move did not pass the execution guardrails.";
  }
  if (input.requestedAmountAtomic !== input.approvedAmountAtomic) {
    return "The amount being executed does not match the amount that was approved.";
  }
  return null;
}
