import { describe, expect, it } from "vitest";
import { calculateUtilization, rayToApy } from "./aave";
import { calculateArbitrageNetProfit } from "./arbitrage";
import { calculatePoolFeeApy } from "./pools";
import { buildVaultOpportunity, TRACKED_VAULTS } from "./vaults";

describe("Aave V3 Ray to APY & Utilization", () => {
  it("converts on-chain ray liquidity rate to annual compounding percentage", () => {
    // 0.0475 APR in ray = ~4.754e25
    const sampleRay = 47_541_212_575_094_827_251_223_328n;
    const apy = rayToApy(sampleRay);
    expect(apy).toBeGreaterThanOrEqual(4.8);
    expect(apy).toBeLessThanOrEqual(5.0);
  });

  it("handles zero ray safely", () => {
    expect(rayToApy(0n)).toBe(0);
  });

  it("calculates utilization rate accurately", () => {
    const debt = 80_000_000n;
    const cash = 20_000_000n;
    const u = calculateUtilization(debt, cash);
    expect(u).toBe(80); // 80%
  });
});

describe("Pool Fee APY", () => {
  it("calculates fee APY from volume, TVL, and fee tier", () => {
    // Volume: $10M/day, TVL: $20M, fee: 1 bps (0.01%)
    // Daily fees: $1,000. Annual: $365,000. APY: 365k / 20M = 1.825%
    const apy = calculatePoolFeeApy(10_000_000, 20_000_000, 1);
    expect(apy).toBe(1.83);
  });

  it("returns zero for zero liquidity or volume", () => {
    expect(calculatePoolFeeApy(0, 10_000_000, 1)).toBe(0);
    expect(calculatePoolFeeApy(10_000_000, 0, 1)).toBe(0);
  });
});

describe("Cross-Chain Arbitrage Deterministic Formula", () => {
  it("marks opportunity as active when net profit exceeds minimum threshold ($5.00)", () => {
    // Buy $10,000, Sell $10,025 (gross $25)
    // DEX fees $5, Gas $3, Bridge fee $2.50 -> Total cost $10.50
    // Net profit = $14.50 >= $5.00
    const calc = calculateArbitrageNetProfit({
      buyInputUsd: 10_000,
      sellOutputUsd: 10_025,
      dexFeesUsd: 5.0,
      gasCostUsd: 3.0,
      bridgeFeeUsd: 2.5,
      minProfitUsd: 5.0,
    });

    expect(calc.netProfitUsd).toBe(14.5);
    expect(calc.isExecutable).toBe(true);
    expect(calc.status).toBe("active");
    expect(calc.reason).toBeUndefined();
  });

  it("rejects opportunity when net profit is below user threshold", () => {
    // Gross $6, Total cost $5.50 -> Net $0.50 < $5.00
    const calc = calculateArbitrageNetProfit({
      buyInputUsd: 10_000,
      sellOutputUsd: 10_006,
      dexFeesUsd: 2.0,
      gasCostUsd: 2.0,
      bridgeFeeUsd: 1.5,
      minProfitUsd: 5.0,
    });

    expect(calc.netProfitUsd).toBe(0.5);
    expect(calc.isExecutable).toBe(false);
    expect(calc.status).toBe("rejected");
    expect(calc.reason).toContain("below user minimum threshold");
  });
});

describe("1Click Earn & Morpho Vault Ingestion", () => {
  it("builds vault opportunity with live pool stats", () => {
    const vault = TRACKED_VAULTS[0];
    const llamaPool = {
      pool: "morpho-gtusdcp",
      chain: "Base",
      project: "morpho-blue",
      symbol: "GTUSDCP",
      tvlUsd: 400_000_000,
      apy: 4.52,
    };

    const opp = buildVaultOpportunity(vault, llamaPool);
    expect(opp.strategyType).toBe("yield_vault");
    expect(opp.estimatedApy).toBe(4.52);
    expect(opp.tvlUsd).toBe(400_000_000);
    expect(opp.dataMode).toBe("live");
    expect(opp.riskFlags).toContain("share_price_changes");
  });

  it("honestly labels vault fallback as dataMode=sample when DefiLlama pool is unavailable", () => {
    const vault = TRACKED_VAULTS[0];
    const opp = buildVaultOpportunity(vault, null);
    expect(opp.dataMode).toBe("sample");
    expect(opp.riskFlags).toContain("fallback_rate_unverified");
  });
});
