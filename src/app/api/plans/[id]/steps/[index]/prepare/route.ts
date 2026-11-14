import { planHandler } from "@/lib/execution/plan/http";
import { prepareLiveStep } from "@/lib/execution/plan/live";
import { PlanError } from "@/lib/execution/plan/service";

export const dynamic = "force-dynamic";

/** Live only: build the exact transaction for one step. Signing happens in the wallet. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; index: string }> }) {
  const { id, index } = await params;
  return planHandler(request, { scope: "plans-step-prepare", max: 20 }, async (viewer) => {
    const stepIndex = Number(index);
    if (!Number.isInteger(stepIndex) || stepIndex < 0) throw new PlanError("Invalid step.");
    return { instruction: await prepareLiveStep(viewer, id, stepIndex) };
  });
}
