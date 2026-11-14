import { describe, expect, it } from "vitest";
import { applyPositionExits, applySimulatedLedger, lineValueUsd, type LedgerLine } from "./ledger";

const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const WETH_BASE = "0x4200000000000000000000000000000000000006";

const lines: LedgerLine[] = [
  { chainId: 8453, tokenAddress: USDC_BASE, symbol: "USDC", decimals: 6, amountAtomic: 1_000_000_000n, priceUsd: 1 },
];

describe("applySimulatedLedger", () => {
  it("debits from approval and credits only on completion", () => {
    const running = applySimulatedLedger(lines, [
      {
        status: "running",
        debit: { chainId: 8453, tokenAddress: USDC_BASE, symbol: "USDC", decimals: 6, amountAtomic: "100000000" },
        credit: { chainId: 8453, tokenAddress: WETH_BASE, symbol: "WETH", decimals: 18, amountAtomic: "30000000000000000" },
      },
    ]);
    expect(running.find((l) => l.symbol === "USDC")?.amountAtomic).toBe(900_000_000n);
    expect(running.find((l) => l.symbol === "WETH")).toBeUndefined();

    const done = applySimulatedLedger(lines, [
      {
        status: "completed",
        debit: { chainId: 8453, tokenAddress: USDC_BASE, symbol: "USDC", decimals: 6, amountAtomic: "100000000" },
        credit: { chainId: 8453, tokenAddress: WETH_BASE, symbol: "WETH", decimals: 18, amountAtomic: "30000000000000000" },
      },
    ]);
    expect(done.find((l) => l.symbol === "WETH")?.amountAtomic).toBe(30_000_000_000_000_000n);
  });

  it("ignores cancelled and failed plans", () => {
    const result = applySimulatedLedger(lines, [
      { status: "cancelled", debit: { chainId: 8453, tokenAddress: USDC_BASE, symbol: "USDC", decimals: 6, amountAtomic: "1" }, credit: null },
      { status: "failed", debit: { chainId: 8453, tokenAddress: USDC_BASE, symbol: "USDC", decimals: 6, amountAtomic: "1" }, credit: null },
    ]);
    expect(result[0].amountAtomic).toBe(1_000_000_000n);
  });

  it("never goes below zero", () => {
    const result = applySimulatedLedger(lines, [
      { status: "running", debit: { chainId: 8453, tokenAddress: USDC_BASE, symbol: "USDC", decimals: 6, amountAtomic: "9000000000" }, credit: null },
    ]);
    expect(result[0].amountAtomic).toBe(0n);
  });

  it("values a line from its own price", () => {
    expect(lineValueUsd(lines[0])).toBe(1_000);
  });
});

describe("applyPositionExits", () => {
  const positions = [
    { id: "a", currentValueUsd: 1000, status: "open" },
    { id: "b", currentValueUsd: 500, status: "open" },
  ];

  it("reduces a position only after the exit completes", () => {
    const running = applyPositionExits(positions, [{ positionId: "a", status: "running", amountUsd: 400, closes: false }]);
    expect(running[0].currentValueUsd).toBe(1000);
    const done = applyPositionExits(positions, [{ positionId: "a", status: "completed", amountUsd: 400, closes: false }]);
    expect(done[0].currentValueUsd).toBe(600);
    expect(done[0].status).toBe("open");
    expect(done[1]).toBe(positions[1]);
  });

  it("closes a position drawn to zero or marked as a full exit", () => {
    const full = applyPositionExits(positions, [{ positionId: "b", status: "completed", amountUsd: 500, closes: false }]);
    expect(full[1].status).toBe("closed");
    const marked = applyPositionExits(positions, [{ positionId: "a", status: "completed", amountUsd: 10, closes: true }]);
    expect(marked[0]).toMatchObject({ status: "closed", currentValueUsd: 0 });
  });
});
