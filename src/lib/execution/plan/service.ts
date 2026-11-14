import { isAddress, type Address } from "viem";
import { z } from "zod";
import type { Viewer } from "@/lib/auth/viewer";
import { getPrisma } from "@/lib/db/client";
import { env } from "@/lib/env";
import { loadGuardrails } from "@/lib/execution/api";
import { loadExecutionSwitch } from "@/lib/execution/limits";
import { AmountError, formatAtomic, parseDecimalToAtomic } from "@/lib/finance/amounts";
import { equityMinOutputAtomic } from "@/lib/finance/equity-sizing";
import { amountAfterLeg, estimatedYearlyUsd, fundLegs } from "@/lib/finance/plan-sizing";
import { evaluatePlanPolicy, type PlanCheck } from "@/lib/policy/plan";
import { getPlatformPortfolio, type PlatformPortfolio } from "@/lib/portfolio/platform";
import { getAaveAllowance, getAaveSuppliedBalance } from "@/lib/protocols/aave";
import { erc4626Abi } from "@/lib/protocols/vaults/erc4626";
import { getPublicClient } from "@/lib/chain/rpc";
import { getEquityAllowance } from "@/lib/protocols/equities";
import { getVaultAllowance } from "@/lib/protocols/vaults/erc4626";
import { findTrackedToken, findTrackedTokenBySymbol, scopeTokens, usdcOn } from "./assets";
import { buildEntrySteps, buildExitSteps, buildSendSteps, buildSwapSteps, chainName } from "./build";
import type { LedgerEffect } from "./ledger";
import { PLAN_FRESH_MS, serializeSteps, type AmountView, type PlanPreview } from "./preview";
import { dryLegQuote, type LegQuote } from "./quote";
import { ensureSimulationScope, isSimulatedFor } from "./scope";
import { ownedAddresses } from "@/lib/wallet/accounts";
import { resolveEntryTarget, resolveExitTarget, type EntryTarget } from "./targets";
import type { PlanKind, PlannedStep } from "./types";

/**
 * Plan service: one Execute click → a previewed, policy-checked draft → explicit approval.
 *
 * The preview is computed fresh on every request: a real dry 1Click quote for any cross-chain leg,
 * exact atomic sizing from `src/lib/finance`, and the deterministic guardrails from
 * `src/lib/policy/plan`. Nothing here is decided by a model.
 */

const DECIMAL = /^\d+(\.\d+)?$/;
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const tokenRef = z.object({ chainId: z.number().int(), address: z.string().regex(ADDRESS) });

export const planRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("opportunity_entry"),
    opportunityId: z.string().min(1).max(64),
    amount: z.string().regex(DECIMAL),
    sourceChainId: z.number().int(),
    slippageBps: z.number().int().min(0).max(1_000).default(50),
    walletAddress: z.string().regex(ADDRESS).optional(),
  }),
  z.object({
    kind: z.literal("position_exit"),
    positionId: z.string().min(1).max(64),
    mode: z.enum(["withdraw", "collect"]).default("withdraw"),
    amount: z.string().regex(DECIMAL).optional(),
    deliverChainId: z.number().int().nullable().default(null),
    slippageBps: z.number().int().min(0).max(1_000).default(50),
  }),
  z.object({
    kind: z.literal("swap"),
    from: tokenRef,
    to: tokenRef,
    amount: z.string().regex(DECIMAL),
    slippageBps: z.number().int().min(0).max(1_000).default(50),
    walletAddress: z.string().regex(ADDRESS).optional(),
  }),
  z.object({
    kind: z.literal("send"),
    token: tokenRef,
    toChainId: z.number().int(),
    recipient: z.string().max(64),
    amount: z.string().regex(DECIMAL),
    slippageBps: z.number().int().min(0).max(1_000).default(50),
    walletAddress: z.string().regex(ADDRESS).optional(),
  }),
]);

export type PlanRequest = z.infer<typeof planRequestSchema>;

export class PlanError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "PlanError";
  }
}

type Built = {
  kind: PlanKind;
  preview: PlanPreview;
  source: { chainId: number; address: string; symbol: string; decimals: number; amountAtomic: bigint };
  steps: PlannedStep[];
  opportunityId?: string;
  positionId?: string;
  input: Record<string, unknown>;
};

// ---------------------------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------------------------

function toAtomic(amount: string, decimals: number): bigint {
  try {
    return parseDecimalToAtomic(amount, decimals);
  } catch (error) {
    throw new PlanError(error instanceof AmountError ? error.message : "Invalid amount.");
  }
}

function holdingOf(portfolio: PlatformPortfolio, chainId: number, address: string) {
  const norm = address.toLowerCase();
  return portfolio.holdings.find((line) => line.chainId === chainId && line.tokenAddress === norm) ?? null;
}

function usdOf(atomic: bigint, decimals: number, price: number | null): number | null {
  if (price === null) return null;
  return (Number(atomic) / 10 ** decimals) * price;
}

function view(atomic: bigint, token: { decimals: number; symbol: string }, chainId: number, price: number | null): AmountView {
  return { atomic: atomic.toString(), decimals: token.decimals, symbol: token.symbol, chainId, usd: usdOf(atomic, token.decimals, price) };
}

function effect(token: { address: string; symbol: string; decimals: number }, chainId: number, atomic: bigint, price: number | null): LedgerEffect {
  return { chainId, tokenAddress: token.address.toLowerCase(), symbol: token.symbol, decimals: token.decimals, amountAtomic: atomic.toString(), priceUsd: price };
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([promise.catch(() => fallback), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Allowance read for the approve step. No wallet, or any read failure, means "approve first". */
async function needsApproval(target: EntryTarget, owner: string | null, amount: bigint): Promise<boolean> {
  if (!target.spender || !owner || ![8453, 42161].includes(target.chainId)) return Boolean(target.spender);
  const ownerAddress = owner as Address;
  const read = async (): Promise<bigint> => {
    if (target.action === "supply") {
      return getAaveAllowance({ chainId: target.chainId, assetAddress: target.asset.address, ownerAddress });
    }
    if (target.action === "vault_deposit" && target.vaultAddress) {
      return getVaultAllowance({ chainId: target.chainId, assetAddress: target.asset.address, owner: ownerAddress, vaultAddress: target.vaultAddress });
    }
    if (target.action === "equity_buy" && target.spender) {
      return getEquityAllowance({ chainId: target.chainId, tokenAddress: target.asset.address, ownerAddress, spenderAddress: target.spender });
    }
    return 0n;
  };
  const allowance = await withTimeout(read(), 3_000, 0n);
  return allowance < amount;
}

/**
 * The wallet a plan pays from. Simulated plans use the aggregate balance across every wallet (the
 * address is only a label). A live plan pays from one verified wallet, and its balance check uses
 * that wallet's balance alone, because only that wallet can sign the transfer.
 */
function payerWallet(ctx: Ctx, requested: string | undefined): string | null {
  const wallet = (requested ?? ctx.viewer.address)?.toLowerCase() ?? null;
  if (ctx.simulated) return wallet;
  if (!wallet || !ctx.owned.has(wallet)) {
    throw new PlanError("Pay from a wallet you've verified. Add it in Settings → Wallets.", 403);
  }
  return wallet;
}

function balanceFor(ctx: Ctx, holding: PlatformPortfolio["holdings"][number] | null, wallet: string | null): bigint {
  if (!holding) return 0n;
  if (ctx.simulated) return holding.amountAtomic;
  return holding.wallets.find((w) => w.address === wallet)?.amountAtomic ?? 0n;
}

function nowIso() {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------------------------
// Builders per kind
// ---------------------------------------------------------------------------------------------

async function buildEntry(
  request: Extract<PlanRequest, { kind: "opportunity_entry" }>,
  ctx: Ctx,
): Promise<Built> {
  const row = await getPrisma().opportunity.findUnique({
    where: { id: request.opportunityId },
    include: { protocol: { select: { id: true, slug: true, name: true } } },
  });
  if (!row) throw new PlanError("Opportunity not found.", 404);
  const target = resolveEntryTarget(row);
  if ("error" in target) throw new PlanError(target.error, 409);
  if (!target.sourceChainIds.includes(request.sourceChainId)) {
    throw new PlanError(`Fund this from ${target.sourceChainIds.map(chainName).join(" or ")}.`);
  }

  const sourceToken =
    target.action === "arbitrage"
      ? usdcOn(request.sourceChainId)
      : findTrackedTokenBySymbol(request.sourceChainId, target.asset.symbol);
  if (!sourceToken) throw new PlanError(`${target.asset.symbol} isn't available on ${chainName(request.sourceChainId)}.`);

  const amountAtomic = toAtomic(request.amount, sourceToken.decimals);
  const holding = holdingOf(ctx.portfolio, request.sourceChainId, sourceToken.address);
  const wallet = payerWallet(ctx, request.walletAddress);
  const price = holding?.priceUsd ?? (sourceToken.isStablecoin ? 1 : null);
  const amountUsd = usdOf(amountAtomic, sourceToken.decimals, price);

  const crossChain = request.sourceChainId !== target.chainId;
  let route: LegQuote | null = null;
  let routeError: string | null = null;
  if (crossChain && amountAtomic > 0n) {
    const legTarget =
      target.action === "arbitrage" && target.tradedAsset
        ? findTrackedTokenBySymbol(target.chainId, target.tradedAsset.symbol)
        : null;
    const to = legTarget
      ? { chainId: target.chainId, address: legTarget.address, decimals: legTarget.decimals, symbol: legTarget.symbol }
      : { chainId: target.chainId, address: target.asset.address, decimals: target.asset.decimals, symbol: target.asset.symbol };
    const result = await dryLegQuote({
      from: { chainId: request.sourceChainId, address: sourceToken.address, decimals: sourceToken.decimals, symbol: sourceToken.symbol },
      to,
      amountAtomic,
      slippageBps: request.slippageBps,
      recipient: wallet,
    });
    if (result.ok) route = result.quote;
    else routeError = result.error;
  }

  const legMinOut = route ? BigInt(route.minAmountOutAtomic) : crossChain ? 0n : null;
  const actionAmount =
    amountAtomic > 0n ? amountAfterLeg({ amountAtomic, legMinOutAtomic: crossChain ? legMinOut : null }) : 0n;
  const approval = amountAtomic > 0n && target.action !== "arbitrage" ? await needsApproval(target, ctx.viewer.address, actionAmount) : false;

  const steps =
    amountAtomic > 0n && (!crossChain || route || target.action === "arbitrage")
      ? buildEntrySteps({
          action: target.action,
          targetChainId: target.chainId,
          targetName: target.name,
          asset: target.asset,
          sourceChainId: request.sourceChainId,
          amountAtomic,
          legMinOutAtomic: crossChain ? (legMinOut ?? 0n) : null,
          needsApproval: approval,
          tradedAsset: target.tradedAsset,
          simulationOnly: target.simulationOnly,
        })
      : [];

  const receiveUsd = usdOf(actionAmount, target.asset.decimals, target.asset.symbol === "USDC" ? 1 : price);
  const policy = evaluatePlanPolicy({
    amountAtomic,
    balanceAtomic: balanceFor(ctx, holding, wallet),
    decimals: sourceToken.decimals,
    symbol: sourceToken.symbol,
    hasCrossChainLeg: crossChain,
    isStablecoin: Boolean(sourceToken.isStablecoin),
    slippageBps: request.slippageBps,
    guardrails: ctx.guardrails,
    targetChainId: target.chainId,
    protocolSlug: target.protocolSlug,
    strategyType: target.strategyType,
    amountUsd,
    portfolio: ctx.portfolio.exposure,
    deploysCapital: true,
    opportunity: { status: row.status, dataMode: row.dataMode },
    marketSession: target.marketSession,
    isCommodity: target.isCommodity,
    liveUnsupportedReason: ctx.simulated ? null : (target.liveUnsupportedReason ?? target.simulationOnly),
  });
  const checks = withRouteCheck(policy.checks, crossChain, route, routeError, {
    // Arbitrage only ever runs as a simulation; a missing quote is reported, not a blocker.
    optional: target.action === "arbitrage",
  });

  const finalizeReference =
    target.action === "vault_deposit"
      ? (target.vaultAddress ?? target.name)
      : target.action === "equity_buy" && target.equity
        ? target.equity.contractAddress.toLowerCase()
        : target.action === "lp_mint"
          ? `${target.name} (simulated)`
          : `${target.asset.symbol} supplied`;

  const underlyingAtomic =
    target.action === "equity_buy" && target.equity && row.sourcePayload && typeof row.sourcePayload === "object"
      ? equityUnits(actionAmount, row.sourcePayload as Record<string, unknown>, target.equity.decimals)
      : actionAmount;

  const preview: PlanPreview = {
    version: 1,
    ok: !checks.some((check) => check.level === "block") && steps.length > 0,
    simulated: ctx.simulated,
    kind: "opportunity_entry",
    title: entryTitle(target),
    targetLabel: target.name,
    amount: view(amountAtomic, sourceToken, request.sourceChainId, price),
    receive:
      target.action === "arbitrage"
        ? null
        : {
            ...view(actionAmount, target.asset, target.chainId, target.asset.symbol === "USDC" ? 1 : price),
            label: target.action === "equity_buy" ? `USDC into ${target.name}` : `Deposited on ${chainName(target.chainId)}`,
          },
    route,
    routeError,
    ratePercent: target.ratePercent,
    rateLabel: row.rateType === "APR" ? "APR" : target.ratePercent !== null ? "APY" : null,
    estYearlyUsd: estimatedYearlyUsd(receiveUsd, target.ratePercent),
    checks,
    steps: serializeSteps(steps),
    ledger: { debit: amountAtomic > 0n ? effect(sourceToken, request.sourceChainId, amountAtomic, price) : null, credit: null },
    finalize:
      target.action === "arbitrage"
        ? null
        : {
            kind: "position",
            strategyType: target.strategyType,
            protocolId: target.protocolId,
            chainId: target.chainId,
            positionReference: finalizeReference,
            valueUsd: receiveUsd,
            underlying: {
              symbol: target.action === "equity_buy" ? target.name : target.asset.symbol,
              amountAtomic: underlyingAtomic.toString(),
              decimals: target.action === "equity_buy" && target.equity ? target.equity.decimals : target.asset.decimals,
            },
          },
    quotedAt: nowIso(),
    expiresAt: new Date(Date.now() + PLAN_FRESH_MS).toISOString(),
  };

  return {
    kind: "opportunity_entry",
    preview,
    source: { chainId: request.sourceChainId, address: sourceToken.address, symbol: sourceToken.symbol, decimals: sourceToken.decimals, amountAtomic },
    steps,
    opportunityId: row.id,
    input: {
      request,
      target: {
        action: target.action,
        chainId: target.chainId,
        asset: target.asset,
        spender: target.spender,
        vaultAddress: target.vaultAddress,
        equity: target.equity ? { chainId: target.equity.chainId, contractAddress: target.equity.contractAddress } : null,
        protocolSlug: target.protocolSlug,
      },
      recipient: wallet,
      wallet,
    },
  };
}

function equityUnits(usdcAtomic: bigint, payload: Record<string, unknown>, decimals: number): bigint {
  const price = typeof payload.dexPriceUsd === "number" ? payload.dexPriceUsd : typeof payload.referenceNavUsd === "number" ? payload.referenceNavUsd : null;
  if (!price || usdcAtomic <= 0n) return 0n;
  try {
    return equityMinOutputAtomic({ direction: "buy", amountInAtomic: usdcAtomic, priceUsd: price, equityDecimals: decimals, slippageBps: 0 });
  } catch {
    return 0n;
  }
}

function entryTitle(target: EntryTarget): string {
  switch (target.action) {
    case "supply":
      return `Lend ${target.asset.symbol} on ${target.name}`;
    case "vault_deposit":
      return `Deposit into ${target.name}`;
    case "lp_mint":
      return `Add liquidity to ${target.name}`;
    case "equity_buy":
      return `Buy ${target.name}`;
    case "arbitrage":
      return `Run ${target.tradedAsset?.symbol ?? ""} arbitrage`;
  }
}

function withRouteCheck(
  checks: PlanCheck[],
  crossChain: boolean,
  route: LegQuote | null,
  error: string | null,
  options: { optional?: boolean } = {},
): PlanCheck[] {
  if (!crossChain) return checks;
  const routeCheck: PlanCheck = route
    ? { code: "route", level: "pass", label: "Route", detail: `1Click quote, ${route.costBps !== null ? `${route.costBps.toFixed(2)} bps` : "priced"}` }
    : { code: "route", level: options.optional ? "warn" : "block", label: "Route", detail: error ?? "No route" };
  return [routeCheck, ...checks];
}

async function buildExit(request: Extract<PlanRequest, { kind: "position_exit" }>, ctx: Ctx): Promise<Built> {
  const position = ctx.portfolio.positions.find((p) => p.id === request.positionId);
  if (!position) throw new PlanError("Position not found.", 404);
  if (position.status === "closed") throw new PlanError("This position is closed.", 409);
  const target = resolveExitTarget(position, request.mode);
  if ("error" in target) throw new PlanError(target.error, 409);

  const underlying = readUnderlying(position.underlyingAssetIds);
  const value = position.currentValueUsd ?? 0;
  const isEquity = target.action === "equity_sell";
  const decimals = target.asset.decimals;

  // What the position holds, in the asset being withdrawn. A live position is read from chain;
  // a simulated or sample one uses the amount recorded when it was opened (USDC positions without
  // one fall back to their USD value, 1:1, for the simulation only).
  const recorded = underlying && underlying.decimals === decimals ? BigInt(underlying.amountAtomic) : null;
  const onChain = !ctx.simulated && ctx.viewer.address ? await readPositionBalance(target, position.chainId, ctx.viewer.address) : null;
  const maxAtomic =
    onChain ?? recorded ?? (isEquity || !ctx.simulated ? 0n : toAtomic(value.toFixed(Math.min(decimals, 6)), decimals));

  const amountAtomic = target.action === "lp_collect" ? 0n : request.amount ? toAtomic(request.amount, decimals) : maxAtomic;
  const pricePerUnit = isEquity && maxAtomic > 0n ? value / (Number(maxAtomic) / 10 ** decimals) : 1;
  const amountUsd = target.action === "lp_collect" ? 0 : usdOf(amountAtomic, decimals, pricePerUnit);

  const deliver = request.deliverChainId && request.deliverChainId !== position.chainId ? request.deliverChainId : null;
  const usdc = usdcOn(position.chainId);
  let route: LegQuote | null = null;
  let routeError: string | null = null;
  const proceedsAtomic = isEquity
    ? amountAtomic > 0n && pricePerUnit > 0
      ? equityMinOutputAtomic({ direction: "sell", amountInAtomic: amountAtomic, priceUsd: pricePerUnit, equityDecimals: decimals, slippageBps: request.slippageBps })
      : 0n
    : amountAtomic;
  if (deliver && usdc && proceedsAtomic > 0n) {
    const deliverUsdc = usdcOn(deliver);
    if (deliverUsdc) {
      const result = await dryLegQuote({
        from: { chainId: position.chainId, address: usdc.address, decimals: 6, symbol: "USDC" },
        to: { chainId: deliver, address: deliverUsdc.address, decimals: 6, symbol: "USDC" },
        amountAtomic: proceedsAtomic,
        slippageBps: request.slippageBps,
        recipient: ctx.viewer.address,
      });
      if (result.ok) route = result.quote;
      else routeError = result.error;
    }
  }

  const steps = buildExitSteps({
    action: target.action,
    chainId: position.chainId,
    positionName: target.name,
    amountAtomic,
    asset: target.asset,
    deliverChainId: deliver,
    needsApproval: isEquity,
    simulationOnly: target.simulationOnly,
  });

  const policy = evaluatePlanPolicy({
    amountAtomic: target.action === "lp_collect" ? 1n : amountAtomic,
    balanceAtomic: target.action === "lp_collect" ? 1n : maxAtomic,
    decimals,
    symbol: target.asset.symbol,
    hasCrossChainLeg: Boolean(deliver),
    slippageBps: request.slippageBps,
    guardrails: ctx.guardrails,
    targetChainId: deliver ?? position.chainId,
    protocolSlug: null,
    strategyType: null,
    amountUsd,
    portfolio: null,
    deploysCapital: false,
    liveUnsupportedReason: ctx.simulated ? null : (target.liveUnsupportedReason ?? (position.dataMode !== "live" ? "This position isn't on-chain." : null)),
  });
  const checks = withRouteCheck(policy.checks, Boolean(deliver), route, routeError).map((check) =>
    check.code === "balance" ? { ...check, detail: check.level === "pass" ? "Within the position" : "More than the position holds" } : check,
  );

  const creditChain = deliver ?? position.chainId;
  const creditToken = usdcOn(creditChain);
  const creditAtomic = route ? BigInt(route.amountOutAtomic) : proceedsAtomic;
  const closes = target.action !== "lp_collect" && maxAtomic > 0n && amountAtomic >= maxAtomic;

  const preview: PlanPreview = {
    version: 1,
    ok: !checks.some((check) => check.level === "block"),
    simulated: ctx.simulated,
    kind: "position_exit",
    title: target.action === "lp_collect" ? `Collect fees from ${target.name}` : isEquity ? `Sell ${target.name}` : `Withdraw from ${target.name}`,
    targetLabel: target.name,
    amount: view(amountAtomic, target.asset, position.chainId, pricePerUnit),
    receive:
      creditToken && creditAtomic > 0n
        ? { ...view(creditAtomic, creditToken, creditChain, 1), label: `USDC on ${chainName(creditChain)}` }
        : null,
    route,
    routeError,
    ratePercent: null,
    rateLabel: null,
    estYearlyUsd: null,
    checks,
    steps: serializeSteps(steps),
    ledger: {
      debit: null,
      credit: creditToken && creditAtomic > 0n ? effect(creditToken, creditChain, creditAtomic, 1) : null,
    },
    finalize: target.action === "lp_collect" ? null : { kind: "exit", positionId: position.id, amountUsd, closes },
    quotedAt: nowIso(),
    expiresAt: new Date(Date.now() + PLAN_FRESH_MS).toISOString(),
  };

  return {
    kind: "position_exit",
    preview,
    source: { chainId: position.chainId, address: target.asset.address, symbol: target.asset.symbol, decimals, amountAtomic },
    steps,
    positionId: position.id,
    input: {
      request,
      target: {
        action: target.action,
        chainId: position.chainId,
        asset: target.asset,
        contract: target.contract,
        equity: target.equity ? { chainId: target.equity.chainId, contractAddress: target.equity.contractAddress } : null,
        positionReference: position.positionReference,
      },
      recipient: ctx.viewer.address,
      wallet: ctx.viewer.address?.toLowerCase() ?? null,
      deliverChainId: deliver,
    },
  };
}

async function readPositionBalance(
  target: { action: string; contract: Address | null },
  chainId: number,
  owner: string,
): Promise<bigint | null> {
  const ownerAddress = owner as Address;
  if (target.action === "withdraw") {
    return withTimeout(getAaveSuppliedBalance({ chainId, ownerAddress }), 4_000, null);
  }
  if (target.action === "vault_redeem" && target.contract) {
    const vault = target.contract;
    return withTimeout(
      getPublicClient(chainId).readContract({ address: vault, abi: erc4626Abi, functionName: "maxWithdraw", args: [ownerAddress] }),
      4_000,
      null,
    );
  }
  return null;
}

function readUnderlying(value: unknown): { symbol: string; amountAtomic: string; decimals: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  return typeof v.amountAtomic === "string" && typeof v.decimals === "number" && typeof v.symbol === "string"
    ? { symbol: v.symbol, amountAtomic: v.amountAtomic, decimals: v.decimals }
    : null;
}

async function buildSwap(request: Extract<PlanRequest, { kind: "swap" }>, ctx: Ctx): Promise<Built> {
  const from = findTrackedToken(request.from.chainId, request.from.address);
  const to = findTrackedToken(request.to.chainId, request.to.address);
  if (!from || !to || from.chainId === 1 || to.chainId === 1) throw new PlanError("Swaps support tracked tokens on Base and Arbitrum.");
  if (from.chainId === to.chainId && from.address.toLowerCase() === to.address.toLowerCase()) {
    throw new PlanError("Pick two different assets or networks.");
  }
  const amountAtomic = toAtomic(request.amount, from.decimals);
  const holding = holdingOf(ctx.portfolio, from.chainId, from.address);
  const wallet = payerWallet(ctx, request.walletAddress);
  const price = holding?.priceUsd ?? (from.isStablecoin ? 1 : null);
  const amountUsd = usdOf(amountAtomic, from.decimals, price);

  let route: LegQuote | null = null;
  let routeError: string | null = null;
  if (amountAtomic > 0n) {
    const result = await dryLegQuote({
      from: { chainId: from.chainId, address: from.address, decimals: from.decimals, symbol: from.symbol },
      to: { chainId: to.chainId, address: to.address, decimals: to.decimals, symbol: to.symbol },
      amountAtomic,
      slippageBps: request.slippageBps,
      recipient: wallet,
    });
    if (result.ok) route = result.quote;
    else routeError = result.error;
  }
  const steps = amountAtomic > 0n ? buildSwapSteps({ fromChainId: from.chainId, toChainId: to.chainId, from, to, amountAtomic }) : [];
  const outAtomic = route ? BigInt(route.amountOutAtomic) : 0n;
  const toHolding = holdingOf(ctx.portfolio, to.chainId, to.address);
  const toPrice = toHolding?.priceUsd ?? (to.isStablecoin ? 1 : price !== null && route && outAtomic > 0n && amountUsd !== null ? amountUsd / (Number(outAtomic) / 10 ** to.decimals) : null);

  const policy = evaluatePlanPolicy({
    amountAtomic,
    balanceAtomic: balanceFor(ctx, holding, wallet),
    decimals: from.decimals,
    symbol: from.symbol,
    hasCrossChainLeg: true,
    isStablecoin: Boolean(from.isStablecoin),
    slippageBps: request.slippageBps,
    guardrails: ctx.guardrails,
    targetChainId: to.chainId,
    protocolSlug: null,
    strategyType: null,
    amountUsd,
    portfolio: null,
    deploysCapital: false,
  });
  const checks = withRouteCheck(policy.checks, true, route, routeError);

  const preview: PlanPreview = {
    version: 1,
    ok: !checks.some((check) => check.level === "block") && steps.length > 0,
    simulated: ctx.simulated,
    kind: "swap",
    title: steps[0]?.title ?? `Swap ${from.symbol} → ${to.symbol}`,
    targetLabel: null,
    amount: view(amountAtomic, from, from.chainId, price),
    receive: route ? { ...view(outAtomic, to, to.chainId, toPrice), label: `${to.symbol} on ${chainName(to.chainId)}` } : null,
    route,
    routeError,
    ratePercent: null,
    rateLabel: null,
    estYearlyUsd: null,
    checks,
    steps: serializeSteps(steps),
    ledger: {
      debit: amountAtomic > 0n ? effect(from, from.chainId, amountAtomic, price) : null,
      credit: route ? effect(to, to.chainId, outAtomic, toPrice) : null,
    },
    finalize: null,
    quotedAt: nowIso(),
    expiresAt: new Date(Date.now() + PLAN_FRESH_MS).toISOString(),
  };
  return {
    kind: "swap",
    preview,
    source: { chainId: from.chainId, address: from.address, symbol: from.symbol, decimals: from.decimals, amountAtomic },
    steps,
    input: { request, from, to, recipient: wallet, wallet },
  };
}

async function buildSend(request: Extract<PlanRequest, { kind: "send" }>, ctx: Ctx): Promise<Built> {
  const token = findTrackedToken(request.token.chainId, request.token.address);
  if (!token || token.chainId === 1) throw new PlanError("Send supports tracked tokens on Base and Arbitrum.");
  const destination = request.toChainId === token.chainId ? token : findTrackedTokenBySymbol(request.toChainId, token.symbol);
  if (!destination) throw new PlanError(`${token.symbol} isn't available on ${chainName(request.toChainId)}.`);
  const recipientValid = isAddress(request.recipient, { strict: false });
  const amountAtomic = toAtomic(request.amount, token.decimals);
  const holding = holdingOf(ctx.portfolio, token.chainId, token.address);
  const wallet = payerWallet(ctx, request.walletAddress);
  const price = holding?.priceUsd ?? (token.isStablecoin ? 1 : null);
  const amountUsd = usdOf(amountAtomic, token.decimals, price);
  const crossChain = request.toChainId !== token.chainId;

  let route: LegQuote | null = null;
  let routeError: string | null = null;
  if (crossChain && amountAtomic > 0n && recipientValid) {
    const result = await dryLegQuote({
      from: { chainId: token.chainId, address: token.address, decimals: token.decimals, symbol: token.symbol },
      to: { chainId: destination.chainId, address: destination.address, decimals: destination.decimals, symbol: destination.symbol },
      amountAtomic,
      slippageBps: request.slippageBps,
      recipient: request.recipient,
    });
    if (result.ok) route = result.quote;
    else routeError = result.error;
  }

  const label = recipientValid ? `${request.recipient.slice(0, 6)}…${request.recipient.slice(-4)}` : "recipient";
  const steps =
    amountAtomic > 0n
      ? buildSendSteps({ chainId: token.chainId, toChainId: request.toChainId, asset: token, amountAtomic, recipientLabel: label })
      : [];
  const policy = evaluatePlanPolicy({
    amountAtomic,
    balanceAtomic: balanceFor(ctx, holding, wallet),
    decimals: token.decimals,
    symbol: token.symbol,
    hasCrossChainLeg: crossChain,
    isStablecoin: Boolean(token.isStablecoin),
    slippageBps: request.slippageBps,
    guardrails: ctx.guardrails,
    targetChainId: null,
    protocolSlug: null,
    strategyType: null,
    amountUsd,
    portfolio: null,
    deploysCapital: false,
    recipientValid,
  });
  const checks = withRouteCheck(policy.checks, crossChain, route, routeError);
  const receiveAtomic = crossChain ? (route ? BigInt(route.amountOutAtomic) : 0n) : amountAtomic;

  const preview: PlanPreview = {
    version: 1,
    ok: !checks.some((check) => check.level === "block") && steps.length > 0 && recipientValid,
    simulated: ctx.simulated,
    kind: "send",
    title: `Send ${token.symbol}`,
    targetLabel: recipientValid ? request.recipient : null,
    amount: view(amountAtomic, token, token.chainId, price),
    receive: receiveAtomic > 0n ? { ...view(receiveAtomic, destination, destination.chainId, price), label: `Arrives on ${chainName(destination.chainId)}` } : null,
    route,
    routeError,
    ratePercent: null,
    rateLabel: null,
    estYearlyUsd: null,
    checks,
    steps: serializeSteps(steps),
    // A send leaves the portfolio: there is a debit and no credit.
    ledger: { debit: amountAtomic > 0n ? effect(token, token.chainId, amountAtomic, price) : null, credit: null },
    finalize: null,
    quotedAt: nowIso(),
    expiresAt: new Date(Date.now() + PLAN_FRESH_MS).toISOString(),
  };
  return {
    kind: "send",
    preview,
    source: { chainId: token.chainId, address: token.address, symbol: token.symbol, decimals: token.decimals, amountAtomic },
    steps,
    input: { request, token, destination, recipient: recipientValid ? request.recipient.toLowerCase() : null, wallet },
  };
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

type Ctx = {
  viewer: Viewer;
  /** Wallets this account proved it controls; a live plan must pay from one of them. */
  owned: Set<string>;
  simulated: boolean;
  portfolio: PlatformPortfolio;
  guardrails: Awaited<ReturnType<typeof loadGuardrails>>;
};

async function context(viewer: Viewer): Promise<Ctx> {
  const [portfolio, guardrails] = await Promise.all([getPlatformPortfolio(viewer), loadGuardrails(viewer.userId)]);
  if (!portfolio) throw new PlanError("No portfolio for this account.", 404);
  const owned = viewer.demo ? new Set<string>() : await ownedAddresses(viewer.userId);
  return { viewer, simulated: isSimulatedFor(viewer), portfolio, guardrails, owned };
}

async function build(viewer: Viewer, request: PlanRequest): Promise<Built> {
  const ctx = await context(viewer);
  switch (request.kind) {
    case "opportunity_entry":
      return buildEntry(request, ctx);
    case "position_exit":
      return buildExit(request, ctx);
    case "swap":
      return buildSwap(request, ctx);
    case "send":
      return buildSend(request, ctx);
  }
}

/** Preview only: nothing persisted. Used while the user types. */
export async function previewPlan(viewer: Viewer, request: PlanRequest): Promise<PlanPreview> {
  return (await build(viewer, request)).preview;
}

/** Persist a draft plan. It still needs explicit approval before anything runs. */
export async function createPlan(viewer: Viewer, request: PlanRequest) {
  const built = await build(viewer, request);
  if (built.steps.length === 0) throw new PlanError(built.preview.routeError ?? "Enter an amount to build a plan.");
  const simulationKey = built.preview.simulated ? await ensureSimulationScope(viewer) : null;
  const plan = await getPrisma().executionPlan.create({
    data: {
      userId: viewer.userId,
      simulationKey,
      kind: built.kind,
      title: built.preview.title,
      opportunityId: built.opportunityId ?? null,
      positionId: built.positionId ?? null,
      inputJson: JSON.parse(JSON.stringify(built.input)),
      previewJson: JSON.parse(JSON.stringify(built.preview)),
      dataMode: env.APP_DATA_MODE,
      simulated: built.preview.simulated,
      status: "draft",
      sourceChainId: built.source.chainId,
      sourceTokenAddress: built.source.address.toLowerCase(),
      sourceSymbol: built.source.symbol,
      amountAtomic: built.source.amountAtomic.toString(),
      amountDecimals: built.source.decimals,
      amountUsd: built.preview.amount.usd,
      steps: {
        create: built.steps.map((step, index) => ({
          index,
          type: step.type,
          chainId: step.chainId,
          title: step.title,
          simulated: built.preview.simulated || Boolean(step.simulationOnly),
          amountAtomic: step.amountAtomic === null ? null : step.amountAtomic.toString(),
          decimals: step.decimals,
          symbol: step.symbol,
        })),
      },
    },
    select: { id: true },
  });
  await getPrisma().auditEvent.create({
    data: {
      userId: viewer.userId,
      eventType: "plan.created",
      actorType: "user",
      referenceId: plan.id,
      details: { kind: built.kind, simulated: built.preview.simulated, ok: built.preview.ok },
    },
  });
  return { planId: plan.id, preview: built.preview };
}

/** Plans the viewer may read: their own, and for the demo account only this browser's. */
export async function findOwnedPlan(viewer: Viewer, planId: string) {
  const scope = viewer.demo ? await ensureSimulationScope(viewer) : null;
  return getPrisma().executionPlan.findFirst({
    where: { id: planId, userId: viewer.userId, ...(viewer.demo ? { simulationKey: scope } : {}) },
    include: { steps: { orderBy: { index: "asc" } } },
  });
}

/**
 * Explicit approval. The user echoes the exact atomic amount they saw; it must equal the plan's.
 * Approval is refused for a stale draft, a blocked preview, or (live) a kill switch / limit.
 */
export async function approvePlan(viewer: Viewer, planId: string, body: { accepted: boolean; amountAtomic: string }) {
  const plan = await findOwnedPlan(viewer, planId);
  if (!plan) throw new PlanError("Plan not found.", 404);
  if (plan.status !== "draft") throw new PlanError(`This plan is already ${plan.status}.`, 409);
  if (!body.accepted) throw new PlanError("Approval was not given.");
  if (body.amountAtomic !== plan.amountAtomic) throw new PlanError("The approved amount doesn't match the plan.", 409);
  if (Date.now() - plan.createdAt.getTime() > PLAN_FRESH_MS) {
    throw new PlanError("This quote expired. Review the plan again.", 409);
  }
  const preview = plan.previewJson as PlanPreview | null;
  if (!preview?.ok) throw new PlanError("Guardrails block this plan.", 409);

  if (!plan.simulated) {
    if (viewer.demo || !viewer.address) throw new PlanError("Sign in with your wallet to execute.", 401);
    const killSwitch = await loadExecutionSwitch();
    if (killSwitch.disabled) throw new PlanError(killSwitch.reason ?? "Execution is disabled.", 423);
    if (plan.amountUsd === null) throw new PlanError("No price for this asset; live limits can't be checked.", 409);
    if (plan.amountUsd > env.EXECUTION_MAX_MOVE_USDC) {
      throw new PlanError(`Live plans are capped at $${env.EXECUTION_MAX_MOVE_USDC}.`, 409);
    }
    const dayStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    const used = await getPrisma().executionPlan.aggregate({
      where: { userId: viewer.userId, simulated: false, approvedAt: { gte: dayStart }, status: { in: ["running", "completed"] } },
      _sum: { amountUsd: true },
    });
    if ((used._sum.amountUsd ?? 0) + plan.amountUsd > env.EXECUTION_MAX_DAILY_USDC) {
      throw new PlanError(`This would pass the $${env.EXECUTION_MAX_DAILY_USDC} daily limit.`, 409);
    }
  }

  const now = new Date();
  const claimed = await getPrisma().executionPlan.updateMany({
    where: { id: plan.id, status: "draft" },
    data: { status: "running", approvedAt: now, approvedAmountAtomic: body.amountAtomic },
  });
  if (claimed.count !== 1) throw new PlanError("This plan was already approved.", 409);
  if (!plan.simulated && plan.steps[0]) {
    await getPrisma().executionStep.update({ where: { id: plan.steps[0].id }, data: { status: "ready" } });
  }
  await getPrisma().auditEvent.create({
    data: {
      userId: viewer.userId,
      eventType: "plan.approved",
      actorType: "user",
      referenceId: plan.id,
      details: { amountAtomic: body.amountAtomic, simulated: plan.simulated, kind: plan.kind },
    },
  });
  return { planId: plan.id };
}

export async function cancelPlan(viewer: Viewer, planId: string) {
  const plan = await findOwnedPlan(viewer, planId);
  if (!plan) throw new PlanError("Plan not found.", 404);
  // A running plan can only be cancelled before its first step has gone out.
  const started = plan.steps.some((step) => !["pending", "ready"].includes(step.status));
  if (plan.status === "running" && started) throw new PlanError("A step has already been sent; it can't be undone.", 409);
  if (!["draft", "running"].includes(plan.status)) throw new PlanError(`This plan is ${plan.status}.`, 409);
  await getPrisma().executionPlan.update({ where: { id: plan.id }, data: { status: "cancelled" } });
  await getPrisma().auditEvent.create({
    data: { userId: viewer.userId, eventType: "plan.cancelled", actorType: "user", referenceId: plan.id },
  });
}

export function planSourceTokens() {
  return scopeTokens();
}

/**
 * A validated strategy → one entry plan per allocation leg. Legs are separate plans on purpose:
 * each settles on its own, and the user approves the exact amounts of all of them together.
 * Funding chains come from `fundLegs`, which never lets two legs spend the same units.
 */
export async function createStrategyPlans(viewer: Viewer, proposalId: string) {
  const prisma = getPrisma();
  const proposal = await prisma.strategyProposal.findFirst({
    where: { id: proposalId, userId: viewer.userId },
    include: {
      allocations: {
        include: { opportunity: { include: { protocol: { select: { id: true, slug: true, name: true } } } } },
        orderBy: { amountUsdEstimate: "desc" },
      },
    },
  });
  if (!proposal) throw new PlanError("Strategy not found.", 404);
  if (proposal.validationStatus !== "validated") throw new PlanError("Only a strategy that passed the guardrails can run.", 409);

  const portfolio = await getPlatformPortfolio(viewer);
  if (!portfolio) throw new PlanError("No portfolio for this account.", 404);

  // The planner sizes legs in whole USD cents (`centsToUsd` in the policy engine), stored as
  // `amountUsdEstimate`. A USDC-funded leg converts exactly: cents × 10⁴ = USDC atomic units at the
  // $1 peg. Legs funded in a volatile asset would need a price, so they are left out here (the user
  // can still open them from the strategy card). The approval dialog shows each exact amount.
  const legs = proposal.allocations.flatMap((allocation) => {
    if (!allocation.opportunity) return [];
    const target = resolveEntryTarget(allocation.opportunity);
    if ("error" in target) return [];
    const fundedInUsdc = target.action === "arbitrage" || target.asset.symbol === "USDC";
    const stored = /^\d+$/.test(allocation.amountAtomic) ? BigInt(allocation.amountAtomic) : 0n;
    const cents = allocation.amountUsdEstimate !== null ? BigInt(Math.round(allocation.amountUsdEstimate * 100)) : 0n;
    const amountAtomic = stored > 0n ? stored : fundedInUsdc ? cents * 10_000n : 0n;
    if (amountAtomic <= 0n) return [];
    return [{ allocation, target, amountAtomic }];
  });
  if (legs.length === 0) throw new PlanError("This strategy has no USDC legs to run. Open each leg from its market instead.", 409);

  // Balances per (asset symbol, chain) for the funding assignment.
  const balancesFor = (symbol: string) =>
    Object.fromEntries(
      [8453, 42161].map((chainId) => {
        const token = findTrackedTokenBySymbol(chainId, symbol);
        const line = token ? holdingOf(portfolio, chainId, token.address) : null;
        return [chainId, line?.amountAtomic ?? 0n];
      }),
    ) as Record<number, bigint>;

  const bySymbol = new Map<string, typeof legs>();
  for (const leg of legs) {
    const symbol = leg.target.action === "arbitrage" ? "USDC" : leg.target.asset.symbol;
    bySymbol.set(symbol, [...(bySymbol.get(symbol) ?? []), leg]);
  }

  const slippageBps = Math.min(50, (await loadGuardrails(viewer.userId)).maxSlippageBps);
  const created: { planId: string; preview: PlanPreview }[] = [];
  for (const [symbol, group] of bySymbol) {
    const funding = fundLegs({
      legs: group.map((leg) => ({ chainId: leg.target.chainId, amountAtomic: leg.amountAtomic })),
      balances: balancesFor(symbol),
    });
    for (const [index, leg] of group.entries()) {
      const source = funding[index];
      const allowed = leg.target.sourceChainIds;
      const sourceChainId = source && allowed.includes(source.fromChainId) ? source.fromChainId : allowed[0];
      const decimals = leg.target.action === "arbitrage" ? 6 : leg.target.asset.decimals;
      const result = await createPlan(viewer, {
        kind: "opportunity_entry",
        opportunityId: leg.allocation.opportunity!.id,
        amount: formatAtomic(leg.amountAtomic, decimals),
        sourceChainId,
        slippageBps,
      });
      await prisma.executionPlan.update({ where: { id: result.planId }, data: { proposalId: proposal.id } });
      created.push(result);
    }
  }
  return { proposalId: proposal.id, plans: created };
}
