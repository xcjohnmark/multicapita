import { z } from "zod";
import { planHandler, readJson } from "@/lib/execution/plan/http";
import { approvePlan, PlanError } from "@/lib/execution/plan/service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ accepted: z.literal(true), amountAtomic: z.string().regex(/^\d+$/) });

/** Explicit human approval of the exact amount shown. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return planHandler(request, { scope: "plans-approve", max: 20 }, async (viewer) => {
    const parsed = bodySchema.safeParse(await readJson(request));
    if (!parsed.success) throw new PlanError("Approval must confirm the exact amount.");
    return approvePlan(viewer, id, parsed.data);
  });
}
