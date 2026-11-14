import { planHandler } from "@/lib/execution/plan/http";
import { cancelPlan } from "@/lib/execution/plan/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return planHandler(request, { scope: "plans-cancel", max: 20 }, async (viewer) => {
    await cancelPlan(viewer, id);
    return { cancelled: true };
  });
}
