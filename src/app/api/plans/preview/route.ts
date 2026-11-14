import { planRequestSchema, PlanError, previewPlan } from "@/lib/execution/plan/service";
import { planHandler, readJson } from "@/lib/execution/plan/http";

export const dynamic = "force-dynamic";

/** Live preview while the user types: real dry quote + guardrails, nothing persisted. */
export async function POST(request: Request) {
  return planHandler(request, { scope: "plans-preview", max: 90 }, async (viewer) => {
    const parsed = planRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new PlanError(parsed.error.issues[0]?.message ?? "Invalid plan request.");
    return previewPlan(viewer, parsed.data);
  });
}
