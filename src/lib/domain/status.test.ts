import { describe, expect, it } from "vitest";
import {
  isTerminalQuoteStatus,
  parseQuoteStatus,
  providerStatusToQuoteStatus,
} from "./status";
import { minMoveAtomic, MIN_MOVE_ATOMIC, MIN_MOVE_UNITS } from "@/lib/policy/execution";

describe("status vocabulary", () => {
  it("keeps every documented provider state distinct", () => {
    expect(providerStatusToQuoteStatus("PENDING_DEPOSIT")).toBe("deposited");
    expect(providerStatusToQuoteStatus("KNOWN_DEPOSIT_TX")).toBe("deposited");
    expect(providerStatusToQuoteStatus("PROCESSING")).toBe("processing");
    expect(providerStatusToQuoteStatus("SUCCESS")).toBe("success");
    expect(providerStatusToQuoteStatus("FAILED")).toBe("failed");
    expect(providerStatusToQuoteStatus("REFUNDED")).toBe("refunded");
    expect(providerStatusToQuoteStatus("INCOMPLETE_DEPOSIT")).toBe("incomplete_deposit");
  });

  it("never guesses a happy state for an unknown provider status", () => {
    expect(providerStatusToQuoteStatus("SETTLED")).toBe("unknown");
    expect(providerStatusToQuoteStatus("")).toBe("unknown");
    expect(isTerminalQuoteStatus("unknown")).toBe(false);
  });

  it("treats only the four provider-terminal states as terminal", () => {
    for (const status of ["success", "failed", "refunded", "incomplete_deposit"] as const) {
      expect(isTerminalQuoteStatus(status)).toBe(true);
    }
    for (const status of ["quoted", "deposited", "processing", "expired"] as const) {
      expect(isTerminalQuoteStatus(status)).toBe(false);
    }
  });

  it("maps a stored status to unknown when the value is not in the vocabulary", () => {
    expect(parseQuoteStatus("quoted")).toBe("quoted");
    expect(parseQuoteStatus("SETTLED")).toBe("unknown");
    expect(parseQuoteStatus("")).toBe("unknown");
  });
});

describe("minimum move threshold", () => {
  it("derives the atomic threshold from the token's own decimals", () => {
    expect(minMoveAtomic(6)).toBe(10_000_000n);
    expect(minMoveAtomic(18)).toBe(10n * 10n ** 18n);
    expect(minMoveAtomic(0)).toBe(BigInt(MIN_MOVE_UNITS));
    expect(MIN_MOVE_ATOMIC).toBe(minMoveAtomic(6));
  });

  it("rejects impossible decimals instead of guessing", () => {
    for (const decimals of [-1, 1.5, 37]) {
      expect(() => minMoveAtomic(decimals)).toThrow(/decimals/);
    }
  });
});
