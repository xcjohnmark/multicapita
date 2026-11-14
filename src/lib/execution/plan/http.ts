import { NextResponse } from "next/server";
import { getViewer, type Viewer } from "@/lib/auth/viewer";
import { isSameOrigin } from "@/lib/http/origin";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";
import { OneClickError } from "@/lib/near/oneclick";
import { readPreview, type PlanPreview } from "./preview";
import { PlanError } from "./service";
import { parseStepStatus, parseStepType, type StepStatus, type StepType } from "./types";

/** Shared plumbing for the `/api/plans` routes: origin, rate limit, viewer and error mapping. */
export async function planHandler(
  request: Request,
  options: { scope: string; max?: number; mutation?: boolean },
  run: (viewer: Viewer) => Promise<unknown>,
) {
  if (options.mutation !== false && !isSameOrigin(request)) {
    return NextResponse.json({ error: { message: "Cross-origin request refused." } }, { status: 403 });
  }
  if (rateLimited(`${options.scope}:${clientKey(request)}`, { max: options.max ?? 60 })) {
    return NextResponse.json({ error: { message: "Too many requests. Try again in a minute." } }, { status: 429 });
  }
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: { message: "Sign in to continue." } }, { status: 401 });
  }
  try {
    const data = await run(viewer);
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof PlanError) {
      return NextResponse.json({ error: { message: error.message } }, { status: error.status });
    }
    if (error instanceof OneClickError) {
      return NextResponse.json({ error: { message: error.message } }, { status: 502 });
    }
    console.error("[plans]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: { message: "Something went wrong building this plan." } }, { status: 500 });
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new PlanError("Invalid JSON body.");
  }
}

export type PlanStepView = {
  index: number;
  type: StepType;
  chainId: number;
  title: string;
  status: StepStatus;
  simulated: boolean;
  amountAtomic: string | null;
  decimals: number | null;
  symbol: string | null;
  txHash: string | null;
  simulationRef: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type PlanView = {
  id: string;
  kind: string;
  title: string;
  status: string;
  simulated: boolean;
  dataMode: string;
  createdAt: string;
  approvedAt: string | null;
  completedAt: string | null;
  amountAtomic: string;
  amountDecimals: number;
  sourceSymbol: string;
  sourceChainId: number;
  amountUsd: number | null;
  positionId: string | null;
  opportunityId: string | null;
  /** The wallet that pays and signs (live). Null for an aggregate simulated plan. */
  walletAddress: string | null;
  preview: PlanPreview | null;
  steps: PlanStepView[];
};

type PlanRow = {
  id: string;
  kind: string;
  title: string;
  status: string;
  simulated: boolean;
  dataMode: string;
  createdAt: Date;
  approvedAt: Date | null;
  completedAt: Date | null;
  amountAtomic: string;
  amountDecimals: number;
  sourceSymbol: string;
  sourceChainId: number;
  amountUsd: number | null;
  positionId: string | null;
  opportunityId: string | null;
  previewJson: unknown;
  inputJson?: unknown;
  steps: {
    index: number;
    type: string;
    chainId: number;
    title: string;
    status: string;
    simulated: boolean;
    amountAtomic: string | null;
    decimals: number | null;
    symbol: string | null;
    txHash: string | null;
    simulationRef: string | null;
    error: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
  }[];
};

export function serializePlan(plan: PlanRow): PlanView {
  return {
    id: plan.id,
    kind: plan.kind,
    title: plan.title,
    status: plan.status,
    simulated: plan.simulated,
    dataMode: plan.dataMode,
    createdAt: plan.createdAt.toISOString(),
    approvedAt: plan.approvedAt?.toISOString() ?? null,
    completedAt: plan.completedAt?.toISOString() ?? null,
    amountAtomic: plan.amountAtomic,
    amountDecimals: plan.amountDecimals,
    sourceSymbol: plan.sourceSymbol,
    sourceChainId: plan.sourceChainId,
    amountUsd: plan.amountUsd,
    positionId: plan.positionId,
    opportunityId: plan.opportunityId,
    walletAddress: readWallet(plan.inputJson),
    preview: readPreview(plan.previewJson),
    steps: plan.steps.map((step) => ({
      index: step.index,
      type: parseStepType(step.type),
      chainId: step.chainId,
      title: step.title,
      status: parseStepStatus(step.status),
      simulated: step.simulated,
      amountAtomic: step.amountAtomic,
      decimals: step.decimals,
      symbol: step.symbol,
      txHash: step.txHash,
      simulationRef: step.simulationRef,
      error: step.error,
      startedAt: step.startedAt?.toISOString() ?? null,
      completedAt: step.completedAt?.toISOString() ?? null,
    })),
  };
}

function readWallet(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const wallet = (input as { wallet?: unknown }).wallet;
  return typeof wallet === "string" && /^0x[a-f0-9]{40}$/.test(wallet) ? wallet : null;
}
