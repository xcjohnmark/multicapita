import { getChain } from "@/lib/chains";
import { DEFAULT_GUARDRAILS, type Guardrails } from "@/lib/domain/strategy";
import { applySlippageDown, parseDecimalToAtomic } from "@/lib/finance/amounts";
import { env } from "@/lib/env";
import { getClient } from "@/lib/near/registry";
import { type OneClickQuote, type OneClickToken } from "@/lib/near/oneclick";
import { buildDepositInstruction, prepareCrossChainMove } from "@/lib/near/execution";
import {
  assertExecutionAllowed,
  evaluateCrossChainMove,
  MAX_CROSS_CHAIN_SLIPPAGE_BPS,
  minMoveAtomic,
  type ExecutionViolation,
  type MoveEvaluation,
} from "@/lib/policy/execution";
import { readWalletBalances, type WalletBalances } from "@/lib/wallet/balances";

/**
 * Application service for a single cross-chain move.
 *
 * Ordering is the whole point of this module:
 *
 *   1. convert the display amount to atomic units (exact, no price involved);
 *   2. read live balances from RPC;
 *   3. take a **dry** quote and run the execution guardrails against it;
 *   4. only if the guardrails pass, request a **committed** quote;
 *   5. re-run the guardrails against the committed quote's own numbers;
 *   6. only then hand back a deposit instruction.
 *
 * Step 4 is the only moment a real deposit address exists, and it happens after a policy pass.
 * Step 5 exists because a committed quote can be slightly worse than the preview; if it is worse
 * than the guardrail allows, the quote is abandoned unspent and the user is told why.
 */

export type MoveAmount = { display: string; atomic: bigint };

export function parseMoveAmount(display: string, decimals = 6): MoveAmount | null {
  try {
    const atomic = parseDecimalToAtomic(display, decimals);
    return { display, atomic };
  } catch {
    return null;
  }
}

export type ChainUsdc = {
  chainId: number;
  balanceAtomic: bigint;
};

export type MoveBalances = {
  origin: ChainUsdc | null;
  destination: ChainUsdc | null;
  totals: Record<number, bigint>;
  errors: string[];
};

export async function loadMoveBalances(walletAddress: `0x${string}`): Promise<MoveBalances> {
  const balances: WalletBalances = await readWalletBalances(walletAddress);
  const errors: string[] = [];
  const totals: Record<number, bigint> = {};
  const byChain = new Map<number, ChainUsdc>();

  for (const chain of balances.chains) {
    if (chain.error) {
      errors.push(`${chain.chainName}: ${chain.error}`);
      continue;
    }
    const usdc = chain.tokens.find((token) => token.symbol === "USDC") ?? null;
    if (!usdc) continue;
    const atomic = BigInt(usdc.amountAtomic);
    byChain.set(chain.chainId, { chainId: chain.chainId, balanceAtomic: atomic });
    totals[chain.chainId] = atomic;
  }

  return {
    origin: byChain.get(8453) ?? null,
    destination: byChain.get(42161) ?? null,
    totals,
    errors,
  };
}

export function evaluateMove(input: {
  fromChainId: number;
  toChainId: number;
  amountAtomic: bigint;
  balances: MoveBalances;
  guardrails: Guardrails;
  expectedOutputAtomic: bigint;
  decimals: number;
}): MoveEvaluation {
  const { balances, guardrails } = input;
  const origin = balances.totals[input.fromChainId] ?? 0n;
  const destination = balances.totals[input.toChainId] ?? 0n;
  const originBalance = balances.origin?.chainId === input.fromChainId
    ? balances.origin.balanceAtomic
    : origin;

  return evaluateCrossChainMove({
    fromChainId: input.fromChainId,
    toChainId: input.toChainId,
    amountAtomic: input.amountAtomic,
    originBalanceAtomic: originBalance,
    originChainTotalAtomic: origin,
    destinationChainTotalAtomic: destination,
    expectedOutputAtomic: input.expectedOutputAtomic,
    slippageBps: Math.min(guardrails.maxSlippageBps, MAX_CROSS_CHAIN_SLIPPAGE_BPS),
    maxSlippageBps: guardrails.maxSlippageBps,
    maxChainExposurePercent: guardrails.maxChainExposurePercent,
    minAmountAtomic: minMoveAtomic(input.decimals),
  });
}

export type DryMovePreview = {
  evaluation: MoveEvaluation;
  violations: ExecutionViolation[];
  expectedOutputAtomic: bigint;
  minimumOutputAtomic: bigint;
  impliedCostBps: number;
  deadline: string;
  balances: MoveBalances;
};

/** Preview only: a dry quote, no deposit address, nothing persisted. */
export async function previewMove(input: {
  fromChainId: number;
  toChainId: number;
  amountAtomic: bigint;
  walletAddress: `0x${string}`;
  guardrails: Guardrails;
}): Promise<DryMovePreview> {
  const client = getClient();
  const balances = await loadMoveBalances(input.walletAddress);
  const tokens = await client.getTokens();

  const origin = getChain(input.fromChainId);
  const destination = getChain(input.toChainId);
  const originToken = tokens.tokens.find(
    (token) =>
      origin &&
      token.blockchain === origin.oneClickBlockchain &&
      token.symbol === "USDC" &&
      token.contractAddress?.toLowerCase() === origin.usdc.address.toLowerCase(),
  );
  const destinationToken = tokens.tokens.find(
    (token) =>
      destination &&
      token.blockchain === destination.oneClickBlockchain &&
      token.symbol === "USDC" &&
      token.contractAddress?.toLowerCase() === destination.usdc.address.toLowerCase(),
  );

  if (!originToken || !destinationToken) {
    throw new Error("USDC is not listed for one of these chains in the 1Click catalogue.");
  }

  const quote = await client.createQuote({
    dry: true,
    swapType: "EXACT_INPUT",
    slippageTolerance: Math.min(input.guardrails.maxSlippageBps, MAX_CROSS_CHAIN_SLIPPAGE_BPS),
    originAsset: originToken.assetId,
    destinationAsset: destinationToken.assetId,
    amount: input.amountAtomic.toString(),
    depositType: "ORIGIN_CHAIN",
    recipient: input.walletAddress,
    recipientType: "DESTINATION_CHAIN",
    refundTo: input.walletAddress,
    refundType: "ORIGIN_CHAIN",
    deadline: new Date(Date.now() + 5 * 60_000).toISOString(),
  });

  const expectedOutputAtomic = BigInt(quote.quote.amountOut);
  const evaluation = evaluateMove({
    fromChainId: input.fromChainId,
    toChainId: input.toChainId,
    amountAtomic: input.amountAtomic,
    balances,
    guardrails: input.guardrails,
    expectedOutputAtomic,
    decimals: originToken.decimals,
  });

  const amountIn = BigInt(quote.quote.amountIn);
  const loss = amountIn > expectedOutputAtomic ? amountIn - expectedOutputAtomic : 0n;
  const impliedCostBps = amountIn > 0n ? Number((loss * 1_000_000n) / amountIn) / 100 : 0;

  return {
    evaluation,
    violations: evaluation.violations,
    expectedOutputAtomic,
    minimumOutputAtomic: applySlippageDown(
      expectedOutputAtomic,
      Math.min(input.guardrails.maxSlippageBps, MAX_CROSS_CHAIN_SLIPPAGE_BPS),
    ),
    impliedCostBps,
    deadline: quote.quote.deadline ?? "",
    balances,
  };
}

export type PreparedMoveResult =
  | {
      ok: true;
      quote: OneClickQuote;
      origin: OneClickToken;
      destination: OneClickToken;
      instruction: ReturnType<typeof buildDepositInstruction>;
      evaluation: MoveEvaluation;
      previewEvaluation: MoveEvaluation;
      balances: MoveBalances;
    }
  | {
      ok: false;
      refusal: string;
      evaluation: MoveEvaluation;
      balances: MoveBalances;
    };

/**
 * Prepare an executable move. Requires live mode and explicit approval; returns a refusal
 * (instead of throwing) when the guardrails fail, so the route can record it as an audit event.
 */
export async function prepareMove(input: {
  fromChainId: number;
  toChainId: number;
  amountAtomic: bigint;
  approvedAmountAtomic: bigint;
  walletAddress: `0x${string}`;
  guardrails: Guardrails;
  explicitApproval: boolean;
  /** Origin token decimals from the 1Click catalogue, used for the minimum move threshold. */
  decimals: number;
  dataMode?: string;
  now?: Date;
}): Promise<PreparedMoveResult> {
  const dataMode = input.dataMode ?? env.APP_DATA_MODE;
  const balances = await loadMoveBalances(input.walletAddress);

  const preview = await previewMove({
    fromChainId: input.fromChainId,
    toChainId: input.toChainId,
    amountAtomic: input.amountAtomic,
    walletAddress: input.walletAddress,
    guardrails: input.guardrails,
  });

  const refusal = assertExecutionAllowed({
    dataMode,
    explicitApproval: input.explicitApproval,
    requestedAmountAtomic: input.amountAtomic,
    approvedAmountAtomic: input.approvedAmountAtomic,
    evaluationOk: preview.evaluation.ok,
  });

  if (refusal !== null) {
    return {
      ok: false,
      refusal,
      evaluation: preview.evaluation,
      balances,
    };
  }

  const prepared = await prepareCrossChainMove({
    fromChainId: input.fromChainId,
    toChainId: input.toChainId,
    amountAtomic: input.amountAtomic,
    walletAddress: input.walletAddress,
    slippageBps: Math.min(input.guardrails.maxSlippageBps, MAX_CROSS_CHAIN_SLIPPAGE_BPS),
    now: input.now,
  });

  // Re-check the committed quote on its own numbers. If it is worse than the guardrail allows,
  // the quote is abandoned unspent; no deposit address is handed out.
  const committedEvaluation = evaluateMove({
    fromChainId: input.fromChainId,
    toChainId: input.toChainId,
    amountAtomic: input.amountAtomic,
    balances,
    guardrails: input.guardrails,
    expectedOutputAtomic: BigInt(prepared.quote.quote.amountOut),
    decimals: input.decimals,
  });

  if (!committedEvaluation.ok) {
    return {
      ok: false,
      refusal:
        "The committed quote was worse than the guardrail allows. It was abandoned unspent; no funds moved.",
      evaluation: committedEvaluation,
      balances,
    };
  }

  return {
    ok: true,
    quote: prepared.quote,
    origin: prepared.origin,
    destination: prepared.destination,
    instruction: prepared.instruction,
    evaluation: committedEvaluation,
    previewEvaluation: preview.evaluation,
    balances,
  };
}

export function defaultGuardrails(): Guardrails {
  return { ...DEFAULT_GUARDRAILS };
}

/** JSON-safe balances: bigint totals become decimal strings, never floats. */
export function balancesToJson(balances: MoveBalances): Record<string, string> {
  return Object.fromEntries(
    Object.entries(balances.totals).map(([chainId, value]) => [chainId, value.toString()]),
  );
}

/** JSON-safe evaluation: the minimum output is an exact bigint, not a float. */
export function evaluationToJson(evaluation: MoveEvaluation) {
  return {
    ...evaluation,
    minimumOutputAtomic: evaluation.minimumOutputAtomic.toString(),
  };
}
