import { classifyCopyAsset } from "./catalog";

/**
 * Pure deterministic policy & trader-scoring engine for Stage S7 Copytrading.
 *
 * Invariants:
 *  - No network, no Prisma, no clock (`Date.now()`) calls.
 *  - Memecoins are unconditionally blocked when `noMemecoinsOnly` is true.
 *  - Price drift vs leader's execution price (`maxPriceDriftBps`) is checked deterministically
 *    so the follower never chases an already-pumped entry.
 *  - Spot-only visibility / off-chain hedge risk is surfaced on every trader profile.
 */

export type CopyActionKind = "spot_1click" | "yield_vault" | "aave_lending" | "uniswap_lp";

export type CopyTradePolicyInput = {
  subscriptionStatus: "active" | "paused" | "frozen" | string;
  noMemecoinsOnly: boolean;
  allowedActions: {
    spot1Click: boolean;
    vaults: boolean;
    lending: boolean;
    lp: boolean;
  };
  actionKind: CopyActionKind;
  targetSymbol: string;
  targetAssetId?: string | null;
  targetContractAddress?: string | null;
  /** Whether the leader action includes an open debt/borrow leg rather than pure collateral/LP/spot. */
  hasBorrowOrLeverageDebt?: boolean;
  leaderTradeUsd: number;
  copyScaleBps: number;
  maxUsdPerTrade: number;
  maxDailyBudgetUsd: number;
  dailyUsedUsd: number;
  /** Price observed at the leader's tx block; null when mirroring current portfolio snapshot. */
  leaderPriceUsd: number | null;
  /** Current live quoted execution price. */
  currentQuotePriceUsd: number | null;
  maxPriceDriftBps: number;
  poolLiquidityUsd?: number | null;
};

export type CopyPolicyViolation = {
  code:
    | "subscription_inactive"
    | "memecoin_excluded_in_copytrading"
    | "unverified_token_identity"
    | "action_type_disabled"
    | "borrow_leverage_blocked"
    | "copy_trade_cap_exceeded"
    | "copy_daily_budget_exceeded"
    | "copy_price_drift_exceeded"
    | "insufficient_pool_liquidity"
    | "invalid_copy_amount";
  severity: "error" | "warning";
  message: string;
};

export type CopyTradeEvaluation = {
  allowed: boolean;
  targetCopyUsd: number;
  priceDriftBps: number | null;
  assetClass: ReturnType<typeof classifyCopyAsset>;
  violations: CopyPolicyViolation[];
};

const MIN_COPY_USD = 5;
const MAX_POOL_SHARE = 0.1;

export function computeScaledCopyUsd(input: {
  leaderTradeUsd: number;
  copyScaleBps: number;
  maxUsdPerTrade: number;
}): number {
  if (!Number.isFinite(input.leaderTradeUsd) || input.leaderTradeUsd <= 0) return 0;
  const scaled = (input.leaderTradeUsd * input.copyScaleBps) / 10_000;
  const capped = Math.min(scaled, input.maxUsdPerTrade);
  return Math.round(capped * 100) / 100;
}

export function computePriceDriftBps(
  leaderPriceUsd: number | null,
  currentQuotePriceUsd: number | null,
): number | null {
  if (
    leaderPriceUsd === null ||
    currentQuotePriceUsd === null ||
    !Number.isFinite(leaderPriceUsd) ||
    !Number.isFinite(currentQuotePriceUsd) ||
    leaderPriceUsd <= 0
  ) {
    return null;
  }
  return Math.round((Math.abs(currentQuotePriceUsd - leaderPriceUsd) / leaderPriceUsd) * 10_000);
}

export function evaluateCopyTrade(input: CopyTradePolicyInput): CopyTradeEvaluation {
  const violations: CopyPolicyViolation[] = [];
  const assetClass = classifyCopyAsset({
    symbol: input.targetSymbol,
    assetId: input.targetAssetId,
  });

  if (input.subscriptionStatus !== "active") {
    violations.push({
      code: "subscription_inactive",
      severity: "error",
      message: `Copy subscription is ${input.subscriptionStatus}; resume it before mirroring trades.`,
    });
  }

  if (input.noMemecoinsOnly && (assetClass === "memecoin" || assetClass === "deprecated")) {
    violations.push({
      code: "memecoin_excluded_in_copytrading",
      severity: "error",
      message: `${input.targetSymbol} is classified as ${assetClass} and is blocked by Capita's No-Memecoin copytrading rule.`,
    });
  }

  if (!input.targetAssetId && !input.targetContractAddress) {
    violations.push({
      code: "unverified_token_identity",
      severity: "error",
      message: `${input.targetSymbol} lacks a verified 1Click assetId or contractAddress.`,
    });
  }

  const actionPermitted =
    (input.actionKind === "spot_1click" && input.allowedActions.spot1Click) ||
    (input.actionKind === "yield_vault" && input.allowedActions.vaults) ||
    (input.actionKind === "aave_lending" && input.allowedActions.lending) ||
    (input.actionKind === "uniswap_lp" && input.allowedActions.lp);

  if (!actionPermitted) {
    violations.push({
      code: "action_type_disabled",
      severity: "error",
      message: `Action kind ${input.actionKind} is disabled in this subscription's settings.`,
    });
  }

  if (input.hasBorrowOrLeverageDebt) {
    violations.push({
      code: "borrow_leverage_blocked",
      severity: "error",
      message:
        "Leader leg involves leveraged debt borrowing. Copytrading mirrors unleveraged spot, vault, collateral supply, and LP only.",
    });
  }

  const targetCopyUsd = computeScaledCopyUsd({
    leaderTradeUsd: input.leaderTradeUsd,
    copyScaleBps: input.copyScaleBps,
    maxUsdPerTrade: input.maxUsdPerTrade,
  });

  if (targetCopyUsd < MIN_COPY_USD) {
    violations.push({
      code: "invalid_copy_amount",
      severity: "error",
      message: `Scaled copy size $${targetCopyUsd.toFixed(2)} is below the $${MIN_COPY_USD} minimum route threshold.`,
    });
  }

  if (targetCopyUsd > input.maxUsdPerTrade) {
    violations.push({
      code: "copy_trade_cap_exceeded",
      severity: "error",
      message: `Copy amount $${targetCopyUsd.toFixed(2)} exceeds per-trade cap $${input.maxUsdPerTrade}.`,
    });
  }

  const remainingDaily = Math.max(0, input.maxDailyBudgetUsd - input.dailyUsedUsd);
  if (targetCopyUsd > remainingDaily + 1e-6) {
    violations.push({
      code: "copy_daily_budget_exceeded",
      severity: "error",
      message: `Daily copy budget exhausted ($${remainingDaily.toFixed(2)} remaining of $${input.maxDailyBudgetUsd}).`,
    });
  }

  const priceDriftBps = computePriceDriftBps(input.leaderPriceUsd, input.currentQuotePriceUsd);
  if (priceDriftBps !== null && priceDriftBps > input.maxPriceDriftBps) {
    violations.push({
      code: "copy_price_drift_exceeded",
      severity: "error",
      message: `Price moved ${priceDriftBps} bps since leader's execution block, exceeding max ${input.maxPriceDriftBps} bps drift.`,
    });
  }

  if (
    typeof input.poolLiquidityUsd === "number" &&
    input.poolLiquidityUsd > 0 &&
    targetCopyUsd > input.poolLiquidityUsd * MAX_POOL_SHARE
  ) {
    violations.push({
      code: "insufficient_pool_liquidity",
      severity: "error",
      message: `Copy size $${targetCopyUsd.toFixed(2)} exceeds 10% of available pool liquidity ($${input.poolLiquidityUsd.toFixed(0)}).`,
    });
  }

  return {
    allowed: violations.every((v) => v.severity !== "error"),
    targetCopyUsd,
    priceDriftBps,
    assetClass,
    violations,
  };
}

export type TraderPositionItem = {
  chainId: number;
  chainName: string;
  symbol: string;
  name: string;
  contractAddress: string;
  assetClass: ReturnType<typeof classifyCopyAsset>;
  actionKind: CopyActionKind;
  protocolName: string;
  balanceDisplay: string;
  valueUsd: number | null;
  weightPercent: number | null;
  copyableVia: "1click_direct" | "1click_then_protocol" | "blocked_memecoin";
  oneClickAssetId?: string | null;
};

export type TraderDeterministicScore = {
  styleLabel: "Spot Blue-Chips" | "DeFi Yield & Lending" | "LP Providers" | "Mixed DeFi & Spot" | "Excluded (Memecoins)";
  isMemecoinFree: boolean;
  blockedMemecoinSymbols: string[];
  copyableUsdTotal: number;
  hasDebtOrLeverage: boolean;
  disciplineScore: number; // 0..100
  warnings: string[];
};

/**
 * Pure trader verification & style scoring.
 * Never fabricates historical PnL or win-rate figures — only scores observable verified state.
 */
export function scoreTraderDeterministically(input: {
  positions: TraderPositionItem[];
  hasAaveDebt: boolean;
  winRatePercent?: number | null;
  maxDrawdownPercent?: number | null;
}): TraderDeterministicScore {
  const blockedMemecoinSymbols = input.positions
    .filter((p) => p.assetClass === "memecoin")
    .map((p) => p.symbol);

  const isMemecoinFree = blockedMemecoinSymbols.length === 0;
  const eligible = input.positions.filter((p) => p.assetClass !== "memecoin" && p.assetClass !== "deprecated");
  const copyableUsdTotal = Math.round(
    eligible.reduce((sum, item) => sum + (item.valueUsd ?? 0), 0) * 100,
  ) / 100;

  const warnings: string[] = [
    "Spot/on-chain visibility only: external CEX positions or off-chain hedges are not observable.",
  ];
  if (!isMemecoinFree) {
    warnings.push(
      `Memecoin holdings detected (${blockedMemecoinSymbols.join(", ")}) and automatically excluded from copyable assets.`,
    );
  }
  if (input.hasAaveDebt) {
    warnings.push(
      "Active lending borrow debt detected; collateral/yield legs may reflect net leveraged loops that will not be borrowed automatically.",
    );
  }

  let vaultOrLendingUsd = 0;
  let spotUsd = 0;
  let lpUsd = 0;
  for (const p of eligible) {
    const val = p.valueUsd ?? 0;
    if (p.actionKind === "yield_vault" || p.actionKind === "aave_lending") vaultOrLendingUsd += val;
    else if (p.actionKind === "uniswap_lp") lpUsd += val;
    else spotUsd += val;
  }

  let styleLabel: TraderDeterministicScore["styleLabel"] = "Mixed DeFi & Spot";
  if (!isMemecoinFree && eligible.length === 0) {
    styleLabel = "Excluded (Memecoins)";
  } else if (lpUsd > spotUsd && lpUsd > vaultOrLendingUsd && lpUsd > 0) {
    styleLabel = "LP Providers";
  } else if (vaultOrLendingUsd >= spotUsd && vaultOrLendingUsd > 0) {
    styleLabel = "DeFi Yield & Lending";
  } else if (spotUsd > 0 && vaultOrLendingUsd === 0 && lpUsd === 0) {
    styleLabel = "Spot Blue-Chips";
  }

  let score = 50;
  if (isMemecoinFree) score += 20;
  else score -= 35;
  if (eligible.length >= 2) score += 10;
  if (typeof input.winRatePercent === "number") {
    score += Math.min(15, Math.max(-15, Math.round((input.winRatePercent - 50) * 0.5)));
  }
  if (typeof input.maxDrawdownPercent === "number" && input.maxDrawdownPercent > 25) {
    score -= Math.min(20, Math.round((input.maxDrawdownPercent - 25) * 0.5));
  }
  if (input.hasAaveDebt) score -= 5;

  return {
    styleLabel,
    isMemecoinFree,
    blockedMemecoinSymbols,
    copyableUsdTotal,
    hasDebtOrLeverage: input.hasAaveDebt,
    disciplineScore: Math.max(0, Math.min(100, score)),
    warnings,
  };
}
