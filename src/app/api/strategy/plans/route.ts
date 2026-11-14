import { z } from "zod";
import { planHandler, readJson } from "@/lib/execution/plan/http";
import { createStrategyPlans, PlanError } from "@/lib/execution/plan/service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ proposalId: z.string().min(1).max(64) });

/** Build one draft entry plan per leg of a validated strategy. Each still needs approval. */
export async function POST(request: Request) {
  return planHandler(request, { scope: "strategy-plans", max: 10 }, async (viewer) => {
    const parsed = bodySchema.safeParse(await readJson(request));
    if (!parsed.success) throw new PlanError("A strategy id is required.");
    return createStrategyPlans(viewer, parsed.data.proposalId);
  });
}
