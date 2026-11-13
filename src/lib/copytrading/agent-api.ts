import { z } from "zod";
import { env } from "@/lib/env";

/**
 * NEAR Intents Agent API & NEAR Chain Signatures Adapter (Stage S7).
 *
 * Enables users to configure and fund cross-chain copytrading once from NEAR:
 *  - Spot swaps & 1Click Earn vaults settle via owner-signed NEAR Intents Agent API grants
 *    (https://api.agentsonintents.com) backed by the user's single NEAR balance.
 *  - Destination-contract DeFi actions (Aave V3 supply, Uniswap V3 LP mint) produce explicit
 *    NEAR Chain Signatures MPC payload descriptors (`sign` via `v1.signer`) using derived paths.
 */

export type AgentApiStatus = {
  configured: boolean;
  reachable: boolean;
  baseUrl: string;
  tenantStatus?: unknown;
  error?: string;
};

export type OwnerSignedCopyPolicyPayload = {
  protocol: "near_intents_agent_api";
  endpoint: string;
  fundingNearAccountId: string;
  executionMode: "approval_required" | "agent_auto_copy";
  grantScope: {
    allowedActions: Array<"1click_swap" | "1click_earn_deposit" | "chain_sig_protocol_call">;
    noMemecoinsOnly: true;
    maxUsdPerTrade: number;
    maxDailyBudgetUsd: number;
    maxPriceDriftBps: number;
    maxSlippageBps: number;
    timelockWithdrawSeconds: number;
    emergencyFreezeEnabled: true;
  };
  chainSignatureDerivations: Array<{
    chainId: number;
    chainName: string;
    curve: "secp256k1" | "ed25519";
    derivationPath: string;
    signerContract: string;
  }>;
  humanSummary: string[];
};

const statusSchema = z.record(z.string(), z.unknown());

export class NearIntentsAgentClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: { apiKey?: string; baseUrl?: string; fetchImpl?: typeof fetch } = {}) {
    this.apiKey = options.apiKey ?? env.NEAR_INTENTS_AGENT_API_KEY;
    this.baseUrl = (options.baseUrl ?? env.NEAR_INTENTS_AGENT_API_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async checkStatus(): Promise<AgentApiStatus> {
    if (!this.isConfigured) {
      return {
        configured: false,
        reachable: false,
        baseUrl: this.baseUrl,
        error: "NEAR_INTENTS_AGENT_API_KEY is not configured; Mode A (Copy-with-Approval) active.",
      };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      const res = await this.fetchImpl(`${this.baseUrl}/v1/status`, {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-api-key": this.apiKey!,
        },
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (!res.ok) {
        return {
          configured: true,
          reachable: false,
          baseUrl: this.baseUrl,
          error: `Agent API status returned HTTP ${res.status}`,
        };
      }

      const parsed = statusSchema.safeParse(await res.json());
      return {
        configured: true,
        reachable: true,
        baseUrl: this.baseUrl,
        tenantStatus: parsed.success ? parsed.data : null,
      };
    } catch (err) {
      return {
        configured: true,
        reachable: false,
        baseUrl: this.baseUrl,
        error: err instanceof Error ? err.message : "Agent API check failed",
      };
    }
  }

  async submitAgentCopyOrder(order: {
    fundingNearAccountId: string;
    destinationAsset: string;
    amountAtomic: string;
    recipientAddress: string;
    slippageBps: number;
    maxUsdPerTrade: number;
  }): Promise<{ ok: boolean; orderId?: string; raw?: unknown; error?: string }> {
    if (!this.isConfigured) {
      return {
        ok: false,
        error:
          "NEAR_INTENTS_AGENT_API_KEY is not configured. Configure it for automated Mode B or use Mode A (1Click signature).",
      };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      const res = await this.fetchImpl(`${this.baseUrl}/v1/copy/execute`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "x-api-key": this.apiKey!,
        },
        body: JSON.stringify(order),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) {
        return {
          ok: false,
          error:
            (data && typeof data.message === "string" ? data.message : null) ??
            `Agent API returned HTTP ${res.status}`,
        };
      }
      return {
        ok: true,
        orderId: typeof data?.orderId === "string" ? data.orderId : undefined,
        raw: data,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Agent API copy execution failed",
      };
    }
  }
}

/**
 * Deterministic owner-signed NEAR Agent API + Chain Signatures policy configuration descriptor.
 * Lets the user inspect every bounded rule and derived cross-chain execution path before opting in.
 */
export function buildNearCopySetupDescriptor(input: {
  fundingNearAccountId: string;
  executionMode: "approval_required" | "agent_auto_copy";
  maxUsdPerTrade: number;
  maxDailyBudgetUsd: number;
  maxPriceDriftBps: number;
  copyLending: boolean;
  copyLp: boolean;
}): OwnerSignedCopyPolicyPayload {
  const allowedActions: OwnerSignedCopyPolicyPayload["grantScope"]["allowedActions"] = [
    "1click_swap",
    "1click_earn_deposit",
  ];
  if (input.copyLending || input.copyLp) {
    allowedActions.push("chain_sig_protocol_call");
  }

  const derivations: OwnerSignedCopyPolicyPayload["chainSignatureDerivations"] = [
    {
      chainId: 8453,
      chainName: "Base",
      curve: "secp256k1",
      derivationPath: "capita-base-1",
      signerContract: "v1.signer",
    },
    {
      chainId: 42161,
      chainName: "Arbitrum One",
      curve: "secp256k1",
      derivationPath: "capita-arbitrum-1",
      signerContract: "v1.signer",
    },
    {
      chainId: 1,
      chainName: "Ethereum",
      curve: "secp256k1",
      derivationPath: "capita-ethereum-1",
      signerContract: "v1.signer",
    },
  ];

  return {
    protocol: "near_intents_agent_api",
    endpoint: env.NEAR_INTENTS_AGENT_API_URL,
    fundingNearAccountId: input.fundingNearAccountId,
    executionMode: input.executionMode,
    grantScope: {
      allowedActions,
      noMemecoinsOnly: true,
      maxUsdPerTrade: input.maxUsdPerTrade,
      maxDailyBudgetUsd: input.maxDailyBudgetUsd,
      maxPriceDriftBps: input.maxPriceDriftBps,
      maxSlippageBps: 100,
      timelockWithdrawSeconds: 0,
      emergencyFreezeEnabled: true,
    },
    chainSignatureDerivations: derivations,
    humanSummary: [
      `Single NEAR funding hub: ${input.fundingNearAccountId} funds mirrored swaps & Earn vaults via 1Click.`,
      `Hard limits: $${input.maxUsdPerTrade}/trade, $${input.maxDailyBudgetUsd}/day, max ${(input.maxPriceDriftBps / 100).toFixed(2)}% price drift from leader block.`,
      "Verified non-memecoin assets only; high-risk borrow loops blocked.",
      input.copyLending || input.copyLp
        ? "Lending/LP mirrors use NEAR Chain Signatures (v1.signer) after 1Click stages funds to Base/Arbitrum."
        : "DeFi lending/LP auto-execution disabled; mirroring verified Spot & Earn vaults only.",
    ],
  };
}
