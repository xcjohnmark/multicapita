import { z } from "zod";

/**
 * Status vocabularies and their conversions.
 *
 * SQLite has no enums, so every status is a string in the database. These schemas are the single
 * definition of what a string is allowed to mean. Reading a status always goes through
 * `parseQuoteStatus` and friends: an unrecognised value becomes `unknown`, never the nearest
 * happy-looking state. A provider that invents `SETTLED` must not be rendered as `processing`.
 */

export const quoteStatusSchema = z.enum([
  "quoted",
  "expired",
  "deposited",
  "processing",
  "success",
  "failed",
  "refunded",
  "incomplete_deposit",
  "unknown",
]);
export type QuoteStatus = z.infer<typeof quoteStatusSchema>;

export const transactionStatusSchema = z.enum([
  "pending",
  "confirmed",
  "failed",
  "dropped",
  "replaced",
]);
export type TransactionStatus = z.infer<typeof transactionStatusSchema>;

export const allocationStatusSchema = z.enum([
  "planned",
  "quoted",
  "approved",
  "submitted",
  "settled",
  "failed",
]);
export type AllocationStatus = z.infer<typeof allocationStatusSchema>;

export const positionStatusSchema = z.enum(["open", "closed", "pending", "partial"]);
export type PositionStatus = z.infer<typeof positionStatusSchema>;

export const executionPlanStatusSchema = z.enum([
  "draft",
  "approved",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);
export type ExecutionPlanStatus = z.infer<typeof executionPlanStatusSchema>;

export function parseQuoteStatus(value: string): QuoteStatus {
  const parsed = quoteStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : "unknown";
}

export function parseTransactionStatus(value: string): TransactionStatus {
  const parsed = transactionStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : "pending";
}

export function parseAllocationStatus(value: string): AllocationStatus {
  const parsed = allocationStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : "planned";
}

export function parsePositionStatus(value: string): PositionStatus {
  const parsed = positionStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : "open";
}

export function parseExecutionPlanStatus(value: string): ExecutionPlanStatus {
  const parsed = executionPlanStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : "draft";
}

/**
 * Map a 1Click provider status onto a local quote status.
 *
 * Unknown provider states map to `unknown` and are surfaced verbatim in the API response. They
 * are explicitly *not* treated as success and no longer guessed as `processing`.
 */
export function providerStatusToQuoteStatus(status: string): QuoteStatus {
  switch (status) {
    case "PENDING_DEPOSIT":
    case "KNOWN_DEPOSIT_TX":
      return "deposited";
    case "PROCESSING":
      return "processing";
    case "SUCCESS":
      return "success";
    case "FAILED":
      return "failed";
    case "REFUNDED":
      return "refunded";
    case "INCOMPLETE_DEPOSIT":
      return "incomplete_deposit";
    default:
      return "unknown";
  }
}

/** True only for states after which no further provider transition is expected. */
export function isTerminalQuoteStatus(status: QuoteStatus): boolean {
  return (
    status === "success" ||
    status === "failed" ||
    status === "refunded" ||
    status === "incomplete_deposit"
  );
}
