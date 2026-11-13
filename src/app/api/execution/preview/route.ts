import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getChain } from "@/lib/chains";
import { getPrisma } from "@/lib/db/client";
import { getViewer, viewerOwnsAddress } from "@/lib/auth/viewer";
import { loadGuardrails, moveBodySchema } from "@/lib/execution/api";
import { loadExecutionLimits } from "@/lib/execution/limits";
import { parseMoveAmount, previewMove, balancesToJson, evaluationToJson } from "@/lib/execution/move";
import { isSameOrigin } from "@/lib/http/origin";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Dry preview of a cross-chain USDC move.
 *
 * Always `dry: true`: it never creates a deposit address, never persists anything, and never
 * asks for a signature. It exists so the whole flow is inspectable without live mode, and so the
 * guardrails can be evaluated before a committed quote is ever requested.
 *
 * It still requires a viewer: the wallet being previewed must be the wallet the session signed in
 * with. Previewing someone else's address would leak their balances and teach the UI to trust an
 * address it does not own.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: { message: "Cross-origin request refused." } }, { status: 403 });
  }
  if (rateLimited(clientKey(request), { max: 30 })) {
    return NextResponse.json(
      { error: { message: "Too many preview requests. Try again in a minute." } },
      { status: 429 },
    );
  }

  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: { message: "Sign in to preview a move." } }, { status: 401 });
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

  // A preview is a dry quote plus public balances: nothing is signed or persisted. It may read any
  // wallet the viewer has linked (including watch-only imports); preparing a move still requires
  // the signed-in wallet itself.
  const linked =
    viewerOwnsAddress(viewer, parsed.data.walletAddress) ||
    (await getPrisma().wallet.findFirst({
      where: {
        userId: viewer.userId,
        chainFamily: "evm",
        address: parsed.data.walletAddress.toLowerCase(),
      },
      select: { id: true },
    })) !== null;
  if (!linked) {
    return NextResponse.json(
      {
        error: {
          message:
            "This address is not linked to your account. Sign in with it, or import it on the Overview page to preview moves from it.",
        },
      },
      { status: 403 },
    );
  }

  const decimals = getChain(parsed.data.fromChainId)?.usdc.decimals ?? 6;
  const amount = parseMoveAmount(parsed.data.amount, decimals);
  if (!amount) {
    return NextResponse.json(
      { error: { message: "Amount could not be converted exactly to atomic units." } },
      { status: 400 },
    );
  }

  try {
    const [guardrails, limits] = await Promise.all([
      loadGuardrails(viewer.userId),
      loadExecutionLimits({ userId: viewer.userId, decimals }),
    ]);
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
        limits: {
          maxMoveAtomic: limits.maxMoveAtomic.toString(),
          maxDailyAtomic: limits.maxDailyAtomic.toString(),
          dailyUsedAtomic: limits.dailyUsedAtomic.toString(),
          disabledReason: limits.disabledReason,
        },
        dataMode: env.APP_DATA_MODE,
        executionEnabled: env.APP_DATA_MODE === "live" && !limits.disabled,
        demoSession: viewer.demo,
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
