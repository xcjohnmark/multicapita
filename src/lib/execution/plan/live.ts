import { encodeFunctionData, erc20Abi, type Address, type Hash } from "viem";
import type { Viewer } from "@/lib/auth/viewer";
import { getPublicClient } from "@/lib/chain/rpc";
import { getPrisma } from "@/lib/db/client";
import { env } from "@/lib/env";
import { loadExecutionSwitch } from "@/lib/execution/limits";
import { signingGate } from "@/lib/execution/signing-gate";
import { applySlippageDown } from "@/lib/finance/amounts";
import { equityMinOutputAtomic } from "@/lib/finance/equity-sizing";
import { amountAfterLeg } from "@/lib/finance/plan-sizing";
import { prepareCommittedSwap } from "@/lib/near/execution";
import { getClient } from "@/lib/near/registry";
import { prepareAaveSupply, prepareAaveWithdraw } from "@/lib/protocols/aave";
import {
  evaluateEquityPriceProvenance,
  fetchLiveEquityDualQuote,
  getVerifiedEquityAsset,
  prepareEquitySwap,
} from "@/lib/protocols/equities";
import { prepareUniswapCollect } from "@/lib/protocols/uniswap";
import { prepareVaultDeposit, prepareVaultWithdraw } from "@/lib/protocols/vaults/erc4626";
import { findTrackedToken, isNative, usdcOn } from "./assets";
import { readPreview } from "./preview";
import { resolveCatalogueToken } from "./quote";
import { PlanError } from "./service";
import { ownedAddresses } from "@/lib/wallet/accounts";
import { parseStepType, type StepType } from "./types";

/**
 * Live step runner. One step at a time:
 *
 *   prepare → the server builds the exact transaction (a committed 1Click quote for a leg, or
 *             protocol calldata) and returns it; the step is `awaiting_signature`.
 *   submit  → the wallet's tx hash comes back; the server waits for the receipt before marking
 *             the step done (a 1Click leg then settles until 1Click reports SUCCESS).
 *
 * A step after a 1Click leg is re-sized from that leg's *committed* minimum output. Steps settle
 * independently; nothing here is atomic across steps.
 */

export type WalletInstruction = { chainId: number; to: Address; data: `0x${string}`; value: string };

type PlanInput = {
  request?: { slippageBps?: number };
  target?: {
    action?: string;
    chainId?: number;
    asset?: { address: Address; symbol: string; decimals: number };
    spender?: Address | null;
    vaultAddress?: Address | null;
    contract?: Address | null;
    equity?: { chainId: number; contractAddress: Address } | null;
    positionReference?: string;
  };
  from?: { chainId: number; address: Address };
  to?: { chainId: number; address: Address };
  token?: { chainId: number; address: Address };
  destination?: { chainId: number; address: Address };
  recipient?: string | null;
  /** The verified wallet this plan pays from and signs with. */
  wallet?: string | null;
  deliverChainId?: number | null;
};

const LEG_TYPES: ReadonlySet<StepType> = new Set(["bridge", "swap"]);

async function loadLivePlan(viewer: Viewer, planId: string) {
  const plan = await getPrisma().executionPlan.findFirst({
    where: { id: planId, userId: viewer.userId, simulated: false },
    include: { steps: { orderBy: { index: "asc" } } },
  });
  if (!plan) throw new PlanError("Plan not found.", 404);
  if (plan.status !== "running") throw new PlanError(`This plan is ${plan.status}.`, 409);
  return plan;
}

/** The plan's paying wallet, re-checked as still verified on this account. */
async function planWallet(viewer: Viewer, input: PlanInput): Promise<Address> {
  const wallet = (input.wallet ?? viewer.address)?.toLowerCase();
  if (!wallet || !(await ownedAddresses(viewer.userId)).has(wallet)) {
    throw new PlanError("This plan's wallet isn't verified on your account anymore.", 403);
  }
  return wallet as Address;
}

async function assertCanSign(viewer: Viewer): Promise<Address> {
  const killSwitch = await loadExecutionSwitch();
  const gate = signingGate({ dataMode: env.APP_DATA_MODE, demo: viewer.demo, killSwitch });
  if (!gate.signable) throw new PlanError(gate.signingBlockedReason ?? "Signing is off.", 423);
  if (!viewer.address) throw new PlanError("Sign in with your wallet to execute.", 401);
  return viewer.address.toLowerCase() as Address;
}

function erc20Transfer(token: Address, to: Address, amount: bigint, chainId: number): WalletInstruction {
  return {
    chainId,
    to: token,
    data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] }),
    value: "0",
  };
}

function erc20Approve(token: Address, spender: Address, amount: bigint, chainId: number): WalletInstruction {
  return {
    chainId,
    to: token,
    data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }),
    value: "0",
  };
}

/** Legs: origin and destination tokens for the 1Click step of each plan kind. */
function legTokens(plan: { kind: string; sourceChainId: number; sourceTokenAddress: string }, input: PlanInput, step: { chainId: number }) {
  if (plan.kind === "swap" && input.from && input.to) return { from: input.from, to: input.to, recipientOverride: null };
  if (plan.kind === "send" && input.token && input.destination) {
    return { from: input.token, to: input.destination, recipientOverride: (input.recipient ?? null) as Address | null };
  }
  if (plan.kind === "position_exit" && input.deliverChainId) {
    const from = usdcOn(step.chainId);
    const to = usdcOn(input.deliverChainId);
    return from && to ? { from: { chainId: from.chainId, address: from.address }, to: { chainId: to.chainId, address: to.address }, recipientOverride: null } : null;
  }
  if (plan.kind === "opportunity_entry" && input.target?.asset && input.target.chainId) {
    return {
      from: { chainId: plan.sourceChainId, address: plan.sourceTokenAddress as Address },
      to: { chainId: input.target.chainId, address: input.target.asset.address },
      recipientOverride: null,
    };
  }
  return null;
}

export async function prepareLiveStep(viewer: Viewer, planId: string, index: number): Promise<WalletInstruction> {
  await assertCanSign(viewer);
  const plan = await loadLivePlan(viewer, planId);
  const wallet = await planWallet(viewer, plan.inputJson as PlanInput);
  const step = plan.steps.find((s) => s.index === index);
  if (!step) throw new PlanError("Step not found.", 404);
  if (!["ready", "awaiting_signature"].includes(step.status)) throw new PlanError(`This step is ${step.status}.`, 409);
  if (step.simulated) throw new PlanError("This step only runs as a simulation.", 409);

  const input = plan.inputJson as PlanInput;
  const type = parseStepType(step.type);
  const amount = step.amountAtomic ? BigInt(step.amountAtomic) : null;
  const slippageBps = input.request?.slippageBps ?? 50;
  const target = input.target;
  let instruction: WalletInstruction;
  let result: Record<string, unknown> = {};

  if (LEG_TYPES.has(type)) {
    const legs = legTokens(plan, input, step);
    if (!legs) throw new PlanError("This leg has no route.", 409);
    // An exit's delivery leg moves what the withdrawal actually produced, recorded on its step.
    const previous = plan.steps.find((s) => s.index === index - 1);
    const produced = previous?.resultJson && typeof previous.resultJson === "object" ? (previous.resultJson as { outputAtomic?: string }).outputAtomic : null;
    const legAmount = amount ?? (produced ? BigInt(produced) : null);
    if (!legAmount || legAmount <= 0n) throw new PlanError("Leg amount is unknown.", 409);
    const fromToken = findTrackedToken(legs.from.chainId, legs.from.address);
    const toToken = findTrackedToken(legs.to.chainId, legs.to.address) ?? (legs.to.chainId === 1 ? null : null);
    const [origin, destination] = await Promise.all([
      fromToken ? resolveCatalogueToken({ ...legs.from, decimals: fromToken.decimals, symbol: fromToken.symbol }) : null,
      toToken ? resolveCatalogueToken({ ...legs.to, decimals: toToken.decimals, symbol: toToken.symbol }) : null,
    ]);
    if (!origin || !destination) throw new PlanError("This pair isn't in the 1Click catalogue.", 409);
    const prepared = await prepareCommittedSwap({
      origin,
      destination,
      originChainId: legs.from.chainId,
      amountAtomic: legAmount,
      walletAddress: wallet,
      recipient: legs.recipientOverride ?? wallet,
      slippageBps,
    });
    const minOut = applySlippageDown(BigInt(prepared.quote.quote.amountOut), slippageBps);
    instruction = {
      chainId: prepared.instruction.chainId,
      to: prepared.instruction.to,
      data: prepared.instruction.data,
      value: prepared.instruction.value.toString(),
    };
    result = {
      depositAddress: prepared.quote.quote.depositAddress,
      amountIn: prepared.quote.quote.amountIn,
      amountOut: prepared.quote.quote.amountOut,
      minAmountOut: minOut.toString(),
      correlationId: prepared.quote.correlationId,
      deadline: prepared.deadline,
    };
    // Re-size what follows from the committed minimum, never from the typed amount.
    const resized = amountAfterLeg({ amountAtomic: legAmount, legMinOutAtomic: minOut });
    for (const later of plan.steps.filter((s) => s.index > index && s.amountAtomic !== null)) {
      await getPrisma().executionStep.update({ where: { id: later.id }, data: { amountAtomic: resized.toString() } });
    }
  } else if (type === "approve") {
    if (!amount || !target?.asset) throw new PlanError("Approval amount unknown.", 409);
    if (plan.kind === "position_exit" && target.equity) {
      const equity = getVerifiedEquityAsset(target.equity.chainId, target.equity.contractAddress);
      if (!equity) throw new PlanError("Unverified stock.", 409);
      instruction = erc20Approve(equity.contractAddress, equity.swapRouterAddress, amount, step.chainId);
    } else {
      if (!target.spender) throw new PlanError("No verified spender for this step.", 409);
      instruction = erc20Approve(target.asset.address, target.spender, amount, step.chainId);
    }
  } else if (type === "supply") {
    if (!amount || !target?.asset) throw new PlanError("Supply amount unknown.", 409);
    const ix = prepareAaveSupply({ chainId: step.chainId, assetAddress: target.asset.address, amountAtomic: amount, onBehalfOf: wallet });
    instruction = { chainId: ix.chainId, to: ix.to, data: ix.data, value: "0" };
  } else if (type === "withdraw") {
    if (!amount || !target?.asset) throw new PlanError("Withdraw amount unknown.", 409);
    const ix = prepareAaveWithdraw({ chainId: step.chainId, assetAddress: target.asset.address, amountAtomic: amount, to: wallet });
    instruction = { chainId: ix.chainId, to: ix.to, data: ix.data, value: "0" };
    result = { outputAtomic: amount.toString() };
  } else if (type === "vault_deposit") {
    if (!amount || !target?.vaultAddress) throw new PlanError("Vault or amount unknown.", 409);
    const ix = prepareVaultDeposit({ chainId: step.chainId, vaultAddress: target.vaultAddress, amountAtomic: amount, receiver: wallet });
    instruction = { chainId: ix.chainId, to: ix.to, data: ix.data, value: "0" };
  } else if (type === "vault_redeem") {
    if (!amount || !target?.contract) throw new PlanError("Vault or amount unknown.", 409);
    const ix = prepareVaultWithdraw({ chainId: step.chainId, vaultAddress: target.contract, amountAtomic: amount, receiver: wallet, owner: wallet });
    instruction = { chainId: ix.chainId, to: ix.to, data: ix.data, value: "0" };
    result = { outputAtomic: amount.toString() };
  } else if (type === "equity_buy" || type === "equity_sell") {
    if (!amount || !target?.equity) throw new PlanError("Stock or amount unknown.", 409);
    const equity = getVerifiedEquityAsset(target.equity.chainId, target.equity.contractAddress);
    if (!equity) throw new PlanError("Unverified stock.", 409);
    const isCommodity = equity.wrapperType === "physical_commodity";
    const quote = await fetchLiveEquityDualQuote(equity);
    const check = evaluateEquityPriceProvenance({
      dexPriceUsd: quote.dexPriceUsd,
      referenceNavUsd: quote.referenceNavUsd,
      maxNavDeviationBps: 150,
      allowOffHoursExecution: isCommodity,
      isCommodity,
    });
    if (!check.allowed) throw new PlanError(check.refusalReason ?? "Price check failed.", 409);
    const direction = type === "equity_buy" ? "buy" : "sell";
    const minOut = equityMinOutputAtomic({
      direction,
      amountInAtomic: amount,
      priceUsd: check.provenance.dexExecutionPriceUsd,
      equityDecimals: equity.decimals,
      slippageBps,
    });
    const ix = prepareEquitySwap({ direction, amountAtomic: amount, minOutputAtomic: minOut, recipient: wallet, equityAsset: equity, provenance: check.provenance });
    instruction = { chainId: ix.chainId, to: ix.to, data: ix.data, value: "0" };
    result = { minOutputAtomic: minOut.toString(), provenance: check.provenance, ...(direction === "sell" ? { outputAtomic: minOut.toString() } : {}) };
  } else if (type === "transfer") {
    if (!amount || !input.token || !input.recipient) throw new PlanError("Transfer details missing.", 409);
    const recipient = input.recipient as Address;
    instruction = isNative(input.token.address)
      ? { chainId: step.chainId, to: recipient, data: "0x", value: amount.toString() }
      : erc20Transfer(input.token.address, recipient, amount, step.chainId);
  } else if (type === "lp_collect") {
    const ref = target?.positionReference ?? "";
    if (!/^\d+$/.test(ref)) throw new PlanError("No Uniswap token id for this position.", 409);
    const ix = prepareUniswapCollect({ chainId: step.chainId, tokenId: BigInt(ref), recipient: wallet });
    instruction = { chainId: ix.chainId, to: ix.to, data: ix.data, value: "0" };
  } else {
    throw new PlanError("This step has no live builder.", 409);
  }

  await getPrisma().executionStep.update({
    where: { id: step.id },
    data: {
      status: "awaiting_signature",
      instructionJson: instruction,
      resultJson: result as object,
      quoteId: typeof result.correlationId === "string" ? result.correlationId : null,
      startedAt: step.startedAt ?? new Date(),
      error: null,
    },
  });
  return instruction;
}

const RECEIPT_WAIT_MS = 45_000;

export async function submitLiveStep(viewer: Viewer, planId: string, index: number, txHash: string) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) throw new PlanError("Not a transaction hash.");
  await assertCanSign(viewer);
  const plan = await loadLivePlan(viewer, planId);
  const step = plan.steps.find((s) => s.index === index);
  if (!step) throw new PlanError("Step not found.", 404);
  if (step.status !== "awaiting_signature") throw new PlanError(`This step is ${step.status}.`, 409);

  await getPrisma().executionStep.update({ where: { id: step.id }, data: { status: "submitted", txHash: txHash.toLowerCase() } });

  const type = parseStepType(step.type);
  const result = (step.resultJson ?? {}) as { depositAddress?: string };
  if (LEG_TYPES.has(type) && result.depositAddress) {
    // Speeds up 1Click's detection; settlement is still confirmed by status polling.
    await getClient().submitDeposit(result.depositAddress, txHash).catch(() => undefined);
  }
  const wallet = await planWallet(viewer, plan.inputJson as PlanInput);
  await confirmStep(plan.id, step.id, step.chainId, type, txHash as Hash, RECEIPT_WAIT_MS, wallet);
}

async function confirmStep(
  planId: string,
  stepId: string,
  chainId: number,
  type: StepType,
  hash: Hash,
  waitMs: number,
  expectedFrom: string | null,
) {
  const prisma = getPrisma();
  try {
    const receipt = await getPublicClient(chainId).waitForTransactionReceipt({ hash, timeout: waitMs });
    if (expectedFrom && receipt.from.toLowerCase() !== expectedFrom.toLowerCase()) {
      // Sent from a different account than the plan's wallet: the plan's later steps would act on
      // the wrong balance, so stop here and say so.
      await prisma.executionStep.update({ where: { id: stepId }, data: { status: "failed", error: "Sent from a different wallet than this plan's." } });
      await prisma.executionPlan.update({ where: { id: planId }, data: { status: "failed" } });
      return;
    }
    if (receipt.status !== "success") {
      await prisma.executionStep.update({ where: { id: stepId }, data: { status: "failed", error: "The transaction reverted." } });
      await prisma.executionPlan.update({ where: { id: planId }, data: { status: "failed" } });
      return;
    }
    if (LEG_TYPES.has(type)) {
      await prisma.executionStep.update({ where: { id: stepId }, data: { status: "settling" } });
      return;
    }
    await completeStep(planId, stepId);
  } catch {
    // Not mined within the wait: stays `submitted`; the next read checks the receipt again.
  }
}

async function completeStep(planId: string, stepId: string, outputAtomic?: string) {
  const prisma = getPrisma();
  const step = await prisma.executionStep.update({
    where: { id: stepId },
    data: {
      status: "done",
      completedAt: new Date(),
      ...(outputAtomic ? { resultJson: { outputAtomic } } : {}),
    },
  });
  const next = await prisma.executionStep.findFirst({ where: { planId, index: step.index + 1 } });
  if (!next) return;
  if (parseStepType(next.type) === "record") {
    await finalizeLivePlan(planId, next.id);
    return;
  }
  await prisma.executionStep.update({ where: { id: next.id }, data: { status: "ready" } });
}

async function finalizeLivePlan(planId: string, recordStepId: string) {
  const prisma = getPrisma();
  const claimed = await prisma.executionPlan.updateMany({ where: { id: planId, status: "running" }, data: { status: "completed", completedAt: new Date() } });
  await prisma.executionStep.update({ where: { id: recordStepId }, data: { status: "done", completedAt: new Date() } });
  if (claimed.count !== 1) return;
  const plan = await prisma.executionPlan.findUnique({ where: { id: planId } });
  const preview = readPreview(plan?.previewJson);
  if (plan && preview?.finalize?.kind === "position") {
    const f = preview.finalize;
    const position = await prisma.position.create({
      data: {
        userId: plan.userId,
        strategyType: f.strategyType,
        protocolId: f.protocolId,
        chainId: f.chainId,
        positionReference: f.positionReference,
        underlyingAssetIds: f.underlying,
        initialDepositUsd: f.valueUsd,
        currentValueUsd: f.valueUsd,
        status: "open",
        dataMode: "live",
        lastSyncedAt: new Date(),
      },
      select: { id: true },
    });
    await prisma.executionPlan.update({ where: { id: planId }, data: { positionId: position.id } });
  }
  if (plan && preview?.finalize?.kind === "exit" && preview.finalize.closes) {
    await prisma.position.update({ where: { id: preview.finalize.positionId }, data: { status: "closed", currentValueUsd: 0 } });
  }
  await prisma.auditEvent.create({
    data: { userId: plan?.userId, eventType: "plan.completed", actorType: "system", referenceId: planId, details: { simulated: false } },
  });
}

/** Called on every tracker read: confirms mined steps and settled 1Click legs. */
export async function reconcileLivePlan(planId: string) {
  const prisma = getPrisma();
  const plan = await prisma.executionPlan.findUnique({ where: { id: planId }, include: { steps: { orderBy: { index: "asc" } } } });
  if (!plan || plan.simulated || plan.status !== "running") return;

  // A plan whose remaining steps are all record/skipped finishes on its own (e.g. a swap).
  for (const step of plan.steps) {
    const type = parseStepType(step.type);
    if (step.status === "submitted" && step.txHash) {
      const input = plan.inputJson as PlanInput;
      await confirmStep(plan.id, step.id, step.chainId, type, step.txHash as Hash, 4_000, input.wallet ?? null);
    } else if (step.status === "settling" && LEG_TYPES.has(type)) {
      const result = (step.resultJson ?? {}) as { depositAddress?: string; amountOut?: string };
      if (!result.depositAddress) continue;
      const status = await getClient().getStatus(result.depositAddress).catch(() => null);
      if (!status) continue;
      if (status.status === "SUCCESS") {
        await completeStep(plan.id, step.id, result.amountOut);
      } else if (status.status === "REFUNDED" || status.status === "FAILED" || status.status === "INCOMPLETE_DEPOSIT") {
        await prisma.executionStep.update({
          where: { id: step.id },
          data: { status: status.status === "REFUNDED" ? "refunded" : "failed", error: `1Click: ${status.status}` },
        });
        await prisma.executionPlan.update({ where: { id: plan.id }, data: { status: "failed" } });
      }
    }
  }

  const fresh = await prisma.executionStep.findMany({ where: { planId: plan.id } });
  if (fresh.every((s) => s.status === "done" || s.status === "skipped")) {
    await prisma.executionPlan.updateMany({ where: { id: plan.id, status: "running" }, data: { status: "completed", completedAt: new Date() } });
  }
}
