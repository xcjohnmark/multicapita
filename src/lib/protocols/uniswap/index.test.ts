import { describe, expect, it } from "vitest";
import {
  computeStablecoinTickRange,
  getTickSpacing,
  prepareUniswapCollect,
  prepareUniswapMint,
  UNISWAP_V3_CONFIG,
} from "./index";

describe("Uniswap V3 Protocol Adapter", () => {
  const chainId = 8453;
  const config = UNISWAP_V3_CONFIG[chainId];
  const token0 = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"; // USDC Base
  const token1 = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2"; // USDT Base
  const recipient = "0x1111111111111111111111111111111111111111";

  it("calculates tick spacing and stablecoin bounds correctly", () => {
    expect(getTickSpacing(100)).toBe(1);
    expect(getTickSpacing(500)).toBe(10);
    expect(getTickSpacing(3000)).toBe(60);

    const range100 = computeStablecoinTickRange(100, 20);
    expect(range100.tickLower).toBe(-20);
    expect(range100.tickUpper).toBe(20);

    const range500 = computeStablecoinTickRange(500, 25);
    expect(range500.tickLower).toBe(-20);
    expect(range500.tickUpper).toBe(20);
  });

  it("prepares valid mint liquidity calldata", () => {
    const range = computeStablecoinTickRange(100, 10);
    const instruction = prepareUniswapMint({
      chainId,
      token0,
      token1,
      feeTier: 100,
      tickLower: range.tickLower,
      tickUpper: range.tickUpper,
      amount0DesiredAtomic: 5_000_000n,
      amount1DesiredAtomic: 5_000_000n,
      recipient,
    });

    expect(instruction.chainId).toBe(8453);
    expect(instruction.to).toBe(config.positionManager);
    expect(instruction.operation).toBe("mint_lp");
    // mint(MintParams) selector: 0x88316456
    expect(instruction.data.startsWith("0x88316456")).toBe(true);
  });

  it("prepares valid collect fees calldata", () => {
    const instruction = prepareUniswapCollect({
      chainId,
      tokenId: 12345n,
      recipient,
    });

    expect(instruction.chainId).toBe(8453);
    expect(instruction.to).toBe(config.positionManager);
    expect(instruction.operation).toBe("collect_fees");
    // collect(CollectParams) selector: 0xfc6f7865
    expect(instruction.data.startsWith("0xfc6f7865")).toBe(true);
  });
});
