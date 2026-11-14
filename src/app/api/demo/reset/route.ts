import { getPrisma } from "@/lib/db/client";
import { planHandler } from "@/lib/execution/plan/http";
import { readSimulationScope } from "@/lib/execution/plan/scope";
import { resetSimulationKey } from "@/lib/execution/plan/sim-session";

export const dynamic = "force-dynamic";

/** Forget this session's simulated plans and positions. Live data is never touched. */
export async function POST(request: Request) {
  return planHandler(request, { scope: "demo-reset", max: 10 }, async (viewer) => {
    const scope = await readSimulationScope(viewer);
    if (scope) {
      const prisma = getPrisma();
      await prisma.executionPlan.deleteMany({ where: { userId: viewer.userId, simulationKey: scope, simulated: true } });
      await prisma.position.deleteMany({ where: { userId: viewer.userId, simulationKey: scope, dataMode: "dry_run" } });
    }
    if (viewer.demo) await resetSimulationKey();
    return { reset: true };
  });
}
