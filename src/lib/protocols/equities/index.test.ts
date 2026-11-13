import { describe, expect, it } from "vitest";
import {
  evaluateEquityPriceProvenance,
  getMarketSessionStatus,
  getVerifiedEquityAsset,
  prepareEquitySwap,
} from "./index";

describe("Tokenized Equities Protocol Adapter", () => {
  it("resolves RPC-verified Arbitrum Dinari assets & Ethereum Ondo/XAUT strictly by (chainId, address)", () => {
    const arbNvda = getVerifiedEquityAsset(
      42161,
      "0x4DaFFfDDEa93DdF1e0e7B61E844331455053Ce5c",
    );
    expect(arbNvda).not.toBeNull();
    expect(arbNvda?.symbol).toBe("NVDA.d");
    expect(arbNvda?.issuer).toBe("Dinari");

    const ethNvdaOn = getVerifiedEquityAsset(
      1,
      "0x2D1F7226Bd1F780AF6B9A49DCC0aE00E8Df4bDEE",
    );
    expect(ethNvdaOn).not.toBeNull();
    expect(ethNvdaOn?.symbol).toBe("NVDAon");

    // Wrong chain returns null (XAUT is on Ethereum 1, not Arbitrum 42161)
    expect(
      getVerifiedEquityAsset(42161, "0x68749665FF8D2d112Fa859AA293F07A622782F38"),
    ).toBeNull();
    expect(
      getVerifiedEquityAsset(1, "0x68749665FF8D2d112Fa859AA293F07A622782F38")?.symbol,
    ).toBe("XAUT");
  });

  it("evaluates dual price provenance and accepts prices within NAV spread bounds", () => {
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

  it("refuses trades when DEX spread exceeds maxNavDeviationBps or price is missing", () => {
    const spreadBlock = evaluateEquityPriceProvenance({
      dexPriceUsd: 123.0,
      referenceNavUsd: 120.0,
      maxNavDeviationBps: 100,
      allowOffHoursExecution: true,
    });

    expect(spreadBlock.allowed).toBe(false);
    expect(spreadBlock.provenance.navDeviationBps).toBe(250);
    expect(spreadBlock.refusalReason).toContain("deviates by 250 bps");

    const missingDex = evaluateEquityPriceProvenance({
      dexPriceUsd: null,
      referenceNavUsd: 120.0,
      maxNavDeviationBps: 100,
      allowOffHoursExecution: true,
    });
    expect(missingDex.allowed).toBe(false);
    expect(missingDex.refusalReason).toContain("No active on-chain DEX liquidity pool");
  });

  it("blocks off-hours trades when allowOffHoursExecution is false and market is closed", () => {
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

  it("encodes Step 2 SwapRouter02 exactInputSingle buy calldata cleanly", () => {
    const asset = getVerifiedEquityAsset(1, "0x2D1F7226Bd1F780AF6B9A49DCC0aE00E8Df4bDEE")!;
    const inst = prepareEquitySwap({
      direction: "buy",
      amountAtomic: 10_000_000n,
      minOutputAtomic: 1n,
      recipient: "0x000000000000000000000000000000000000dead",
      equityAsset: asset,
      provenance: {
        dexExecutionPriceUsd: 173.73,
        referenceNavUsd: 173.73,
        navDeviationBps: 0,
        sessionStatus: "OPEN",
        isWithinSpreadBound: true,
        navObservedAt: "2026-11-12T15:00:00.000Z",
      },
    });
    expect(inst.operation).toBe("swap_buy");
    expect(inst.data.startsWith("0x")).toBe(true);
    expect(inst.to).toBe(asset.swapRouterAddress);
  });
});
