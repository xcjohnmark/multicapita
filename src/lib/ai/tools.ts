import { z } from "zod";
import { centsToUsd } from "@/lib/finance/allocation";
import type { OpportunityView, PortfolioExposure } from "@/lib/policy/engine";
import type { ToolDefinition } from "./client";

/**
 * Tools the model may call. All of them are read-only.
 *
 * There is deliberately no "execute" tool and no "approve" tool: the model can look, never act.
 * Arguments are validated with zod before execution, so a malformed or hallucinated call returns
 * a typed error instead of reaching the database or the network.
 */

export const portfolioSummaryArgs = z.object({});

export const listOpportunitiesArgs = z.object({
  strategyType: z
    .enum(["yield_vault", "lending", "stablecoin_lp", "arbitrage", "tokenized_equity", "copytrading"])
    .optional(),
  chainId: z.number().int().optional(),
});

export const routeCostArgs = z.object({
  fromChainId: z.number().int(),
  toChainId: z.number().int(),
  amountUsd: z.number().positive().max(1_000_000),
});

export type RouteCostResult = {
  ok: boolean;
  impliedCostBps?: number;
  quotedOutUsd?: number;
  minutes?: number | null;
  source?: string;
  error?: string;
};

export type ToolContext = {
  opportunities: OpportunityView[];
  portfolio: PortfolioExposure;
  /** Optional live probe. Absent in tests and when 1Click is unreachable. */
  routeCost?: (args: z.infer<typeof routeCostArgs>) => Promise<RouteCostResult>;
};

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_portfolio_summary",
      description:
        "Current portfolio totals: total value, liquid amount available to deploy, existing exposure by chain, protocol, strategy and asset. All values in USD.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "list_opportunities",
      description:
        "Candidate opportunities with their id, chain, protocol, asset, sourced rate, liquidity, data mode and whether they are still active. Use the returned id when proposing an allocation.",
      parameters: {
        type: "object",
        properties: {
          strategyType: {
            type: "string",
            enum: ["yield_vault", "lending", "stablecoin_lp", "arbitrage", "tokenized_equity", "copytrading"],
            description: "Optional filter.",
          },
          chainId: { type: "number", description: "Optional chain id filter (8453 Base, 42161 Arbitrum, 1 Ethereum)." },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_cross_chain_cost",
      description:
        "Live NEAR Intents dry quote for moving USDC between two supported chains at a given size. Returns the real implied cost in basis points. Never creates a deposit address.",
      parameters: {
        type: "object",
        properties: {
          fromChainId: { type: "number", description: "Origin chain id." },
          toChainId: { type: "number", description: "Destination chain id." },
          amountUsd: { type: "number", description: "Amount in USD to quote." },
        },
        required: ["fromChainId", "toChainId", "amountUsd"],
        additionalProperties: false,
      },
    },
  },
];

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

export async function executeTool(
  name: string,
  rawArguments: string,
  context: ToolContext,
): Promise<ToolResult> {
  let parsedArguments: unknown;
  try {
    parsedArguments = rawArguments.trim() === "" ? {} : JSON.parse(rawArguments);
  } catch {
    return { ok: false, error: "Arguments were not valid JSON." };
  }

  switch (name) {
    case "get_portfolio_summary": {
      const args = portfolioSummaryArgs.safeParse(parsedArguments);
      if (!args.success) return { ok: false, error: describe(args.error) };
      const { portfolio } = context;
      return {
        ok: true,
        data: {
          totalUsd: centsToUsd(portfolio.totalUsdCents),
          availableUsd: centsToUsd(portfolio.availableUsdCents),
          deployedUsd: centsToUsd(portfolio.totalUsdCents - portfolio.availableUsdCents),
          byChain: toUsd(portfolio.byChain),
          byProtocol: toUsd(portfolio.byProtocol),
          byStrategy: toUsd(portfolio.byStrategy),
          byAsset: toUsd(portfolio.byAsset),
          // A leg can only be funded by the asset it deposits (no swaps are planned).
          availableByAssetUsd: toUsd(portfolio.availableByAsset),
        },
      };
    }

    case "list_opportunities": {
      const args = listOpportunitiesArgs.safeParse(parsedArguments);
      if (!args.success) return { ok: false, error: describe(args.error) };
      const filtered = context.opportunities.filter((opportunity) => {
        if (args.data.strategyType && opportunity.strategyType !== args.data.strategyType) return false;
        if (args.data.chainId && opportunity.chainId !== args.data.chainId) return false;
        return true;
      });
      return {
        ok: true,
        data: filtered.map((opportunity) => ({
          id: opportunity.id,
          strategyType: opportunity.strategyType,
          chain: opportunity.chainName,
          chainId: opportunity.chainId,
          protocol: opportunity.protocolName,
          protocolSlug: opportunity.protocolSlug,
          asset: opportunity.assetLabel,
          ratePercent: opportunity.expectedRatePercent,
          rateType: opportunity.rateType,
          liquidityUsd: opportunity.liquidityUsd,
          dataMode: opportunity.dataMode,
          status: opportunity.status,
          expiresAt: opportunity.expiresAt?.toISOString() ?? null,
          riskFlags: opportunity.riskFlags ?? [],
        })),
      };
    }

    case "get_cross_chain_cost": {
      const args = routeCostArgs.safeParse(parsedArguments);
      if (!args.success) return { ok: false, error: describe(args.error) };
      if (!context.routeCost) {
        return { ok: false, error: "Live route pricing is unavailable in this environment." };
      }
      const result = await context.routeCost(args.data);
      return result.ok ? { ok: true, data: result } : { ok: false, error: result.error ?? "Quote failed" };
    }

    default:
      return { ok: false, error: `Unknown tool "${name}".` };
  }
}

function toUsd(record: Record<string, bigint>): Record<string, number> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, centsToUsd(value)]));
}

function describe(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "arguments"}: ${issue.message}`).join("; ");
}
