import { z } from "zod";
import { DEFAULT_GUARDRAILS, type Guardrails } from "@/lib/domain/strategy";
import { loadStrategyContext } from "@/lib/portfolio/strategy-context";

/**
 * Shared input contract for the execution endpoints.
 *
 * The amount is a display decimal string because the UI is a USDC amount; it is converted to
 * atomic units exactly once, server-side, and never used to build a transaction before that.
 * The approval echoes the amount back so the server can prove the user approved the same number
 * that is being executed.
 */

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const USDC_AMOUNT = /^\d+(\.\d{1,6})?$/;

export const moveBodySchema = z.object({
  fromChainId: z.number().int(),
  toChainId: z.number().int(),
  amount: z.string().regex(USDC_AMOUNT, "Amount must be a positive USDC decimal (max 6 places)"),
  walletAddress: z
    .string()
    .regex(EVM_ADDRESS, "A connected 0x wallet address is required")
    .transform((value) => value as `0x${string}`),
  approval: z
    .object({
      accepted: z.boolean(),
      amount: z.string().regex(USDC_AMOUNT, "Approval amount is invalid"),
    })
    .optional(),
});

export type MoveBody = z.infer<typeof moveBodySchema>;

/** Guardrails from the active strategy profile, falling back to the documented defaults. */
export async function loadGuardrails(): Promise<Guardrails> {
  const context = await loadStrategyContext();
  return context?.guardrails ?? { ...DEFAULT_GUARDRAILS };
}
