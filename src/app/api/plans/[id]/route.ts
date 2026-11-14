import { planHandler, serializePlan } from "@/lib/execution/plan/http";
import { reconcileLivePlan } from "@/lib/execution/plan/live";
import { findOwnedPlan, PlanError } from "@/lib/execution/plan/service";
import { settleSimulatedPlan } from "@/lib/execution/plan/settle";

export const dynamic = "force-dynamic";

/** Current plan state. Each read advances a simulated plan or reconciles a live one. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return planHandler(request, { scope: "plans-read", max: 240, mutation: false }, async (viewer) => {
    const owned = await findOwnedPlan(viewer, id);
    if (!owned) throw new PlanError("Plan not found.", 404);
    if (owned.simulated) await settleSimulatedPlan(owned.id);
    else await reconcileLivePlan(owned.id);
    const fresh = await findOwnedPlan(viewer, id);
    if (!fresh) throw new PlanError("Plan not found.", 404);
    return serializePlan(fresh);
  });
}
