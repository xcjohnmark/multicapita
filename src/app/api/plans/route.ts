import { createPlan, planRequestSchema, PlanError } from "@/lib/execution/plan/service";
import { planHandler, readJson } from "@/lib/execution/plan/http";

export const dynamic = "force-dynamic";

/** Create a draft plan with a fresh preview. It runs only after `/approve`. */
export async function POST(request: Request) {
  return planHandler(request, { scope: "plans-create", max: 30 }, async (viewer) => {
    const parsed = planRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new PlanError(parsed.error.issues[0]?.message ?? "Invalid plan request.");
    return createPlan(viewer, parsed.data);
  });
}
