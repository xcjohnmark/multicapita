import { getPrisma } from "@/lib/db/client";
import { readPreview } from "./preview";
import { simulatedTimeline, simulationRef } from "./simulate";
import { parseStepStatus, parseStepType } from "./types";

/**
 * Advance simulated plans to where their timeline says they are, and finalize the ones that have
 * finished. Called on every read that shows plan state (tracker, portfolio, activity), so a plan
 * left running in another tab is still settled the next time anything looks at it.
 *
 * Finalizing is guarded by a conditional status update: two concurrent reads cannot both create
 * the resulting position.
 */

type PlanWithSteps = Awaited<ReturnType<typeof loadRunning>>[number];

async function loadRunning(where: { id?: string; userId?: string; simulationKey?: string }) {
  return getPrisma().executionPlan.findMany({
    where: { ...where, simulated: true, status: "running" },
    include: { steps: { orderBy: { index: "asc" } } },
  });
}

export async function settleSimulatedPlans(userId: string, simulationKey: string | null, now = new Date()) {
  if (!simulationKey) return;
  const plans = await loadRunning({ userId, simulationKey });
  for (const plan of plans) await settleOne(plan, now);
}

export async function settleSimulatedPlan(planId: string, now = new Date()) {
  const plans = await loadRunning({ id: planId });
  for (const plan of plans) await settleOne(plan, now);
}

async function settleOne(plan: PlanWithSteps, now: Date) {
  if (!plan.approvedAt) return;
  const prisma = getPrisma();
  const timeline = simulatedTimeline(
    plan.steps.map((step) => ({ type: parseStepType(step.type) })),
    plan.approvedAt,
    now,
  );

  const updates = plan.steps
    .map((step, index) => ({ step, next: timeline.steps[index] }))
    .filter(({ step, next }) => parseStepStatus(step.status) !== next.status);

  for (const { step, next } of updates) {
    await prisma.executionStep.update({
      where: { id: step.id },
      data: {
        status: next.status,
        startedAt: next.startedAt,
        completedAt: next.completedAt,
        simulationRef: step.simulationRef ?? simulationRef(plan.id, step.index),
      },
    });
  }

  if (!timeline.completed) return;

  const claimed = await prisma.executionPlan.updateMany({
    where: { id: plan.id, status: "running" },
    data: { status: "completed", completedAt: timeline.completedAt },
  });
  if (claimed.count !== 1) return;

  const preview = readPreview(plan.previewJson);
  const finalize = preview?.finalize;
  if (finalize?.kind === "position") {
    const position = await prisma.position.create({
      data: {
        userId: plan.userId,
        strategyType: finalize.strategyType,
        protocolId: finalize.protocolId,
        chainId: finalize.chainId,
        positionReference: finalize.positionReference,
        underlyingAssetIds: finalize.underlying,
        initialDepositUsd: finalize.valueUsd,
        currentValueUsd: finalize.valueUsd,
        accruedReturnUsd: 0,
        unrealisedPnlUsd: 0,
        status: "open",
        dataMode: "dry_run",
        simulationKey: plan.simulationKey,
        openedAt: timeline.completedAt ?? now,
        lastSyncedAt: timeline.completedAt ?? now,
      },
      select: { id: true },
    });
    await prisma.executionPlan.update({ where: { id: plan.id }, data: { positionId: position.id } });
  }

  await prisma.auditEvent.create({
    data: {
      userId: plan.userId,
      eventType: "plan.completed",
      actorType: "system",
      referenceId: plan.id,
      details: { simulated: true, kind: plan.kind, title: plan.title },
    },
  });
}
