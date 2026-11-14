import { z } from "zod";
import { planHandler, readJson } from "@/lib/execution/plan/http";
import { submitLiveStep } from "@/lib/execution/plan/live";
import { PlanError } from "@/lib/execution/plan/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({ txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/) });

/** Live only: record the wallet's transaction and wait for its receipt. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; index: string }> }) {
  const { id, index } = await params;
  return planHandler(request, { scope: "plans-step-submit", max: 20 }, async (viewer) => {
    const stepIndex = Number(index);
    if (!Number.isInteger(stepIndex) || stepIndex < 0) throw new PlanError("Invalid step.");
    const parsed = bodySchema.safeParse(await readJson(request));
    if (!parsed.success) throw new PlanError("A transaction hash is required.");
    await submitLiveStep(viewer, id, stepIndex, parsed.data.txHash);
    return { submitted: true };
  });
}
