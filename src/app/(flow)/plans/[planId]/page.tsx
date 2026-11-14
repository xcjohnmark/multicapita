import { notFound } from "next/navigation";
import { FlowPage } from "@/components/shell/layout-chrome";
import { PlanTracker } from "@/components/execution/plan-tracker";
import { getPrisma } from "@/lib/db/client";
import { serializePlan } from "@/lib/execution/plan/http";
import { reconcileLivePlan } from "@/lib/execution/plan/live";
import { readSimulationScope } from "@/lib/execution/plan/scope";
import { settleSimulatedPlan } from "@/lib/execution/plan/settle";
import { getCurrentViewer } from "@/lib/platform-context";

export const dynamic = "force-dynamic";

export default async function PlanPage({ params }: PageProps<"/plans/[planId]">) {
  const { planId } = await params;
  const viewer = await getCurrentViewer();
  if (!viewer) notFound();
  const scope = viewer.demo ? await readSimulationScope(viewer) : null;
  const where = { id: planId, userId: viewer.userId, ...(viewer.demo ? { simulationKey: scope ?? "__none__" } : {}) };
  const found = await getPrisma().executionPlan.findFirst({ where, select: { id: true, simulated: true } });
  if (!found) notFound();
  if (found.simulated) await settleSimulatedPlan(found.id);
  else await reconcileLivePlan(found.id);
  const plan = await getPrisma().executionPlan.findFirst({ where, include: { steps: { orderBy: { index: "asc" } } } });
  if (!plan) notFound();

  return (
    <FlowPage title={plan.title} backHref="/activity">
      <PlanTracker initial={serializePlan(plan)} />
    </FlowPage>
  );
}
