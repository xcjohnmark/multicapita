import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getChain } from "@/lib/chains";
import { loadGuardrails, moveBodySchema } from "@/lib/execution/api";
import { parseMoveAmount, previewMove, balancesToJson, evaluationToJson } from "@/lib/execution/move";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Dry preview of a cross-chain USDC move.
 *
 * Always `dry: true`: it never creates a deposit address, never persists anything, and never
 * asks for a signature. It exists so the whole flow is inspectable without live mode, and so the
 * guardrails can be evaluated before a committed quote is ever requested.
 */
export async function POST(request: Request) {
  if (rateLimited(clientKey(request), { max: 30 })) {
    return NextResponse.json(
      { error: { message: "Too many preview requests. Try again in a minute." } },
      { status: 429 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body" } }, { status: 400 });
  }

  const parsed = moveBodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: "Invalid move request.",
          fields: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      { status: 400 },
    );
  }

  const amount = parseMoveAmount(
    parsed.data.amount,
    getChain(parsed.data.fromChainId)?.usdc.decimals ?? 6,
  );
  if (!amount) {
    return NextResponse.json(
      { error: { message: "Amount could not be converted exactly to atomic units." } },
      { status: 400 },
    );
  }

  try {
    const guardrails = await loadGuardrails();
    const preview = await previewMove({
      fromChainId: parsed.data.fromChainId,
      toChainId: parsed.data.toChainId,
      amountAtomic: amount.atomic,
      walletAddress: parsed.data.walletAddress,
      guardrails,
    });

    return NextResponse.json({
      data: {
        dry: true,
        amountAtomic: amount.atomic.toString(),
        expectedOutputAtomic: preview.expectedOutputAtomic.toString(),
        minimumOutputAtomic: preview.minimumOutputAtomic.toString(),
        impliedCostBps: preview.impliedCostBps,
        deadline: preview.deadline,
        evaluation: evaluationToJson(preview.evaluation),
        balances: balancesToJson(preview.balances),
        chainErrors: preview.balances.errors,
        guardrails,
        dataMode: env.APP_DATA_MODE,
        executionEnabled: env.APP_DATA_MODE === "live",
      },
      meta: {
        source: "1click dry quote + chain rpc",
        note: "Dry run. No deposit address was created and nothing was signed.",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          message: error instanceof Error ? error.message : "Preview failed",
        },
      },
      { status: error instanceof Error && /not supported|catalogue/.test(error.message) ? 422 : 502 },
    );
  }
}
