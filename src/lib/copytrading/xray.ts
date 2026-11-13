import { z } from "zod";
import { NearAiClient } from "@/lib/ai/client";
import type { TraderInspectionResult } from "./indexer";

/**
 * AI Wallet X-Ray Service (NEAR AI Cloud + Deterministic Fallback).
 *
 * Reads verified wallet holdings, Aave collateral/debt flags, and non-memecoin filter results
 * and produces a plain-English briefing for the user before they copy or mirror a trader.
 * Never invents numbers or approves trades.
 */

export const xrayBriefingSchema = z.object({
  headline: z.string().min(1).max(160),
  summary: z.string().min(1).max(600),
  suggestedCopyMode: z.enum(["approval_required", "agent_auto_copy"]),
  copyableHighlights: z.array(z.string().min(1).max(200)).max(5),
  riskCaveats: z.array(z.string().min(1).max(220)).max(5),
});

export type TraderXrayBriefing = z.infer<typeof xrayBriefingSchema> & {
  source: "near_ai_cloud" | "deterministic_fallback";
  modelId: string | null;
};

function deterministicFallbackBriefing(result: TraderInspectionResult): TraderXrayBriefing {
  const topHoldings = result.positions
    .filter((p) => p.assetClass !== "memecoin" && p.assetClass !== "deprecated")
    .slice(0, 3)
    .map((p) => `${p.symbol} on ${p.chainName} (${p.protocolName})`);

  const hasFastSpot = result.positions.some((p) => p.actionKind === "spot_1click");
  const hasYieldOrLending = result.positions.some(
    (p) => p.actionKind === "yield_vault" || p.actionKind === "aave_lending",
  );

  const headline =
    result.positions.length === 0
      ? `No active verified non-memecoin holdings detected on Base/Arbitrum for ${result.resolvedHandle ?? result.address}.`
      : `${result.score.styleLabel}: ${topHoldings.join(", ") || "Verified cross-chain assets"}`;

  const summary =
    result.positions.length === 0
      ? "The scanned chains show zero copyable spot, vault, or Aave supply balances above dust thresholds. Verify you selected the right network address or configure Zerion/Dune keys for additional chains."
      : `Wallet holds $${result.score.copyableUsdTotal.toLocaleString()} in copyable non-memecoin exposure across ${[...new Set(result.positions.map((p) => p.chainName))].join(", ")}. ${
          hasYieldOrLending
            ? "Includes yield vault or Aave lending legs well suited for low-slippage NEAR setup mirroring."
            : "Primarily spot rotations copyable directly via NEAR Intents 1Click."
        }`;

  return {
    source: "deterministic_fallback",
    modelId: null,
    headline,
    summary,
    suggestedCopyMode: hasFastSpot && !hasYieldOrLending ? "agent_auto_copy" : "approval_required",
    copyableHighlights:
      topHoldings.length > 0
        ? topHoldings.map((h) => `Verified non-memecoin allocation: ${h}`)
        : ["Verified address identity ready for snapshot or forward monitoring."],
    riskCaveats: result.score.warnings,
  };
}

export async function generateTraderXrayBriefing(
  result: TraderInspectionResult,
  client: NearAiClient = new NearAiClient(),
): Promise<TraderXrayBriefing> {
  if (!client.isConfigured || result.positions.length === 0) {
    return deterministicFallbackBriefing(result);
  }

  try {
    const completion = await client.complete({
      messages: [
        {
          role: "system",
          content: `You are Capita's Wallet X-Ray analyst. Summarize the verified on-chain trader profile below using ONLY the numbers provided. Never invent PnL, win rates, or holdings. Never recommend memecoins. Mention off-chain hedge blind spots. Return strict JSON:
{"headline": string, "summary": string, "suggestedCopyMode": "approval_required"|"agent_auto_copy", "copyableHighlights": string[], "riskCaveats": string[]}`,
        },
        {
          role: "user",
          content: JSON.stringify({
            address: result.address,
            handle: result.resolvedHandle,
            ecosystem: result.ecosystem,
            style: result.score.styleLabel,
            copyableUsdTotal: result.score.copyableUsdTotal,
            aaveDebtUsd: result.aaveDebtUsd,
            realisedPnl90dUsd: result.realisedPnl90dUsd,
            winRatePercent: result.winRatePercent,
            positions: result.positions.slice(0, 12),
            warnings: result.score.warnings,
          }),
        },
      ],
      temperature: 0.2,
    });

    const rawText = completion.message.content ?? "";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return deterministicFallbackBriefing(result);

    const parsed = xrayBriefingSchema.safeParse(JSON.parse(jsonMatch[0]));
    if (!parsed.success) return deterministicFallbackBriefing(result);

    return {
      ...parsed.data,
      source: "near_ai_cloud",
      modelId: completion.model,
    };
  } catch {
    return deterministicFallbackBriefing(result);
  }
}
