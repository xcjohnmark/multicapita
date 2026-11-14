import { amountAfterLeg } from "@/lib/finance/plan-sizing";
import type { ExitAction, PlannedStep, StepType, TargetAction } from "./types";

/**
 * Turn one user intent into ordered steps.
 *
 * Pure and deterministic: the caller supplies the dry-quote numbers and allowance facts. The
 * builder decides the shape of the plan — which legs exist and how each is sized — and nothing
 * else. Policy is evaluated separately (`src/lib/policy/plan.ts`).
 */

const CHAIN_NAMES: Record<number, string> = { 8453: "Base", 42161: "Arbitrum", 1: "Ethereum" };

export function chainName(chainId: number): string {
  return CHAIN_NAMES[chainId] ?? `Chain ${chainId}`;
}

const ACTION_STEP: Record<Exclude<TargetAction, "arbitrage">, StepType> = {
  supply: "supply",
  vault_deposit: "vault_deposit",
  lp_mint: "lp_mint",
  equity_buy: "equity_buy",
};

export type EntryBuildInput = {
  action: TargetAction;
  targetChainId: number;
  targetName: string;
  /** Asset the target accepts (USDC for lending, vaults, LP and stock purchases). */
  asset: { symbol: string; decimals: number };
  sourceChainId: number;
  amountAtomic: bigint;
  /** Guaranteed minimum of the preceding 1Click leg; required when chains differ. */
  legMinOutAtomic: bigint | null;
  /** False when the wallet already allows the target's spender this amount. */
  needsApproval: boolean;
  /** Arbitrage only: the traded asset (e.g. WETH). */
  tradedAsset?: { symbol: string; decimals: number } | null;
  /** Steps that have no live builder and can only be simulated. */
  simulationOnly?: string | null;
  label?: string;
};

export function buildEntrySteps(input: EntryBuildInput): PlannedStep[] {
  if (input.amountAtomic <= 0n) throw new Error("Amount must be greater than zero.");
  const prefix = input.label ? `${input.label}: ` : "";
  const steps: PlannedStep[] = [];
  const crossChain = input.sourceChainId !== input.targetChainId;

  if (input.action === "arbitrage") {
    const traded = input.tradedAsset;
    if (!traded) throw new Error("Arbitrage needs the traded asset.");
    steps.push({
      type: "swap",
      chainId: input.sourceChainId,
      title: `${prefix}Buy ${traded.symbol} on ${chainName(input.sourceChainId)}, deliver to ${chainName(input.targetChainId)}`,
      amountAtomic: input.amountAtomic,
      symbol: input.asset.symbol,
      decimals: input.asset.decimals,
      simulationOnly: input.simulationOnly ?? "Arbitrage runs as a simulation until a live two-leg path ships.",
    });
    steps.push({
      type: "dex_swap",
      chainId: input.targetChainId,
      title: `${prefix}Sell ${traded.symbol} for ${input.asset.symbol} on ${chainName(input.targetChainId)}`,
      amountAtomic: null,
      symbol: traded.symbol,
      decimals: traded.decimals,
      simulationOnly: input.simulationOnly ?? "Arbitrage runs as a simulation until a live two-leg path ships.",
    });
    steps.push(recordStep(input.targetChainId, `${prefix}Record trade result`));
    return steps;
  }

  if (crossChain && input.legMinOutAtomic === null) {
    throw new Error("A cross-chain entry needs the route's minimum output to size the next step.");
  }

  if (crossChain) {
    steps.push({
      type: "bridge",
      chainId: input.sourceChainId,
      title: `${prefix}Move ${input.asset.symbol} ${chainName(input.sourceChainId)} → ${chainName(input.targetChainId)}`,
      amountAtomic: input.amountAtomic,
      symbol: input.asset.symbol,
      decimals: input.asset.decimals,
    });
  }

  const actionAmount = amountAfterLeg({
    amountAtomic: input.amountAtomic,
    legMinOutAtomic: crossChain ? input.legMinOutAtomic : null,
  });

  if (input.needsApproval) {
    steps.push({
      type: "approve",
      chainId: input.targetChainId,
      title: `${prefix}Allow ${input.targetName} to use ${input.asset.symbol}`,
      amountAtomic: actionAmount,
      symbol: input.asset.symbol,
      decimals: input.asset.decimals,
    });
  }

  const actionVerb: Record<Exclude<TargetAction, "arbitrage">, string> = {
    supply: "Supply to",
    vault_deposit: "Deposit to",
    lp_mint: "Add liquidity to",
    equity_buy: "Buy",
  };

  steps.push({
    type: ACTION_STEP[input.action],
    chainId: input.targetChainId,
    title: `${prefix}${actionVerb[input.action]} ${input.targetName}`,
    amountAtomic: actionAmount,
    symbol: input.asset.symbol,
    decimals: input.asset.decimals,
    simulationOnly: input.simulationOnly ?? undefined,
  });

  steps.push(recordStep(input.targetChainId, `${prefix}Record position`));
  return steps;
}

export type ExitBuildInput = {
  action: ExitAction;
  chainId: number;
  positionName: string;
  /** Amount withdrawn, in the position's underlying asset. */
  amountAtomic: bigint;
  asset: { symbol: string; decimals: number };
  /** Deliver the proceeds to another chain via 1Click. */
  deliverChainId: number | null;
  needsApproval: boolean;
  simulationOnly?: string | null;
};

export function buildExitSteps(input: ExitBuildInput): PlannedStep[] {
  if (input.action !== "lp_collect" && input.amountAtomic <= 0n) {
    throw new Error("Amount must be greater than zero.");
  }
  const steps: PlannedStep[] = [];
  const verb: Record<ExitAction, string> = {
    withdraw: "Withdraw from",
    vault_redeem: "Redeem from",
    lp_exit: "Remove liquidity from",
    lp_collect: "Collect fees from",
    equity_sell: "Sell",
  };

  if (input.needsApproval) {
    steps.push({
      type: "approve",
      chainId: input.chainId,
      title: `Allow the router to use ${input.asset.symbol}`,
      amountAtomic: input.amountAtomic,
      symbol: input.asset.symbol,
      decimals: input.asset.decimals,
    });
  }

  steps.push({
    type: input.action,
    chainId: input.chainId,
    title: `${verb[input.action]} ${input.positionName}`,
    amountAtomic: input.action === "lp_collect" ? null : input.amountAtomic,
    symbol: input.asset.symbol,
    decimals: input.asset.decimals,
    simulationOnly: input.simulationOnly ?? undefined,
  });

  if (input.deliverChainId !== null && input.deliverChainId !== input.chainId && input.action !== "lp_collect") {
    steps.push({
      type: "bridge",
      chainId: input.chainId,
      title: `Move USDC ${chainName(input.chainId)} → ${chainName(input.deliverChainId)}`,
      amountAtomic: null, // sized from the withdrawal's actual output at run time
      symbol: "USDC",
      decimals: 6,
    });
  }

  steps.push(recordStep(input.chainId, "Update position"));
  return steps;
}

export type SwapBuildInput = {
  fromChainId: number;
  toChainId: number;
  from: { symbol: string; decimals: number };
  to: { symbol: string; decimals: number };
  amountAtomic: bigint;
  label?: string;
};

export function buildSwapSteps(input: SwapBuildInput): PlannedStep[] {
  if (input.amountAtomic <= 0n) throw new Error("Amount must be greater than zero.");
  const sameAsset = input.from.symbol === input.to.symbol;
  return [
    {
      type: sameAsset && input.fromChainId !== input.toChainId ? "bridge" : "swap",
      chainId: input.fromChainId,
      title:
        input.label ??
        (sameAsset
          ? `Move ${input.from.symbol} ${chainName(input.fromChainId)} → ${chainName(input.toChainId)}`
          : `Swap ${input.from.symbol} → ${input.to.symbol}${input.fromChainId !== input.toChainId ? ` on ${chainName(input.toChainId)}` : ""}`),
      amountAtomic: input.amountAtomic,
      symbol: input.from.symbol,
      decimals: input.from.decimals,
    },
  ];
}

export type SendBuildInput = {
  chainId: number;
  toChainId: number;
  asset: { symbol: string; decimals: number };
  amountAtomic: bigint;
  recipientLabel: string;
};

export function buildSendSteps(input: SendBuildInput): PlannedStep[] {
  if (input.amountAtomic <= 0n) throw new Error("Amount must be greater than zero.");
  if (input.chainId === input.toChainId) {
    return [
      {
        type: "transfer",
        chainId: input.chainId,
        title: `Send ${input.asset.symbol} to ${input.recipientLabel}`,
        amountAtomic: input.amountAtomic,
        symbol: input.asset.symbol,
        decimals: input.asset.decimals,
      },
    ];
  }
  return [
    {
      type: "bridge",
      chainId: input.chainId,
      title: `Send ${input.asset.symbol} to ${input.recipientLabel} on ${chainName(input.toChainId)}`,
      amountAtomic: input.amountAtomic,
      symbol: input.asset.symbol,
      decimals: input.asset.decimals,
    },
  ];
}

function recordStep(chainId: number, title: string): PlannedStep {
  return { type: "record", chainId, title, amountAtomic: null, symbol: null, decimals: null };
}
