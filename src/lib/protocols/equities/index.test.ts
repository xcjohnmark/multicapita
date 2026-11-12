import { describe, expect, it } from "vitest";
import {
  evaluateEquityPriceProvenance,
  getMarketSessionStatus,
  getVerifiedEquityAsset,
  VERIFIED_TOKENIZED_ASSETS,
} from "./index";

describe("Tokenized Equities Protocol Adapter", () => {
  it("resolves verified assets strictly by chainId and contractAddress", () => {
    const nvda = getVerifiedEquityAsset(
      42161,
      "0x0660bbBFF171Bf28328114f08e705bC116e2566F",
    );
    expect(nvda).not.toBeNull();
    expect(nvda?.symbol).toBe("NVDA.d");
    expect(nvda?.underlyingTicker).toBe("NVDA");

    // Invalid chain returns null
    const wrongChain = getVerifiedEquityAsset(
      8453,
      "0x0660bbBFF171Bf28328114f08e705bC116e2566F",
    );
    expect(wrongChain).toBeNull();
  });

  it("evaluates price provenance and accepts prices within NAV spread bounds", () => {
    // 120.00 Reference NAV, 120.50 DEX price -> 42 bps spread
    const result = evaluateEquityPriceProvenance({
      dexPriceUsd: 120.5,
      referenceNavUsd: 120.0,
      maxNavDeviationBps: 100,
      allowOffHoursExecution: true,
    });

    expect(result.allowed).toBe(true);
    expect(result.provenance.navDeviationBps).toBe(42);
    expect(result.provenance.isWithinSpreadBound).toBe(true);
  });

  it("refuses trades when DEX spread exceeds maxNavDeviationBps guardrail", () => {
    // 120.00 Reference NAV, 123.00 DEX price -> 250 bps spread
    const result = evaluateEquityPriceProvenance({
      dexPriceUsd: 123.0,
      referenceNavUsd: 120.0,
      maxNavDeviationBps: 100,
      allowOffHoursExecution: true,
    });

    expect(result.allowed).toBe(false);
    expect(result.provenance.navDeviationBps).toBe(250);
    expect(result.refusalReason).toContain("deviates by 250 bps");
  });

  it("blocks off-hours trades when allowOffHoursExecution is false and market is closed", () => {
    // Saturday at 2:00 PM UTC
    const weekendDate = new Date("2026-11-14T14:00:00Z");
    expect(getMarketSessionStatus(weekendDate)).toBe("CLOSED");

    const result = evaluateEquityPriceProvenance({
      dexPriceUsd: 120.0,
      referenceNavUsd: 120.0,
      maxNavDeviationBps: 100,
      allowOffHoursExecution: false,
      now: weekendDate,
    });

    expect(result.allowed).toBe(false);
    expect(result.refusalReason).toContain("market is currently CLOSED");
  });
});
