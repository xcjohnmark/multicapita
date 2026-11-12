import { describe, expect, it } from "vitest";
import {
  AAVE_V3_CONFIG,
  prepareAaveApprove,
  prepareAaveSupply,
  prepareAaveWithdraw,
} from "./index";

describe("Aave V3 Protocol Adapter", () => {
  const chainId = 8453;
  const config = AAVE_V3_CONFIG[chainId];
  const userAddress = "0x1111111111111111111111111111111111111111";
  const amount = 10_000_000n; // 10 USDC (6 decimals)

  it("prepares valid ERC-20 approval for Aave Pool", () => {
    const instruction = prepareAaveApprove({
      chainId,
      assetAddress: config.usdcAddress,
      amountAtomic: amount,
    });

    expect(instruction.chainId).toBe(8453);
    expect(instruction.to).toBe(config.usdcAddress);
    expect(instruction.operation).toBe("approve");
    expect(instruction.amountAtomic).toBe("10000000");
    // approve selector: 0x095ea7b3
    expect(instruction.data.startsWith("0x095ea7b3")).toBe(true);
    expect(instruction.data.toLowerCase()).toContain(config.poolAddress.slice(2).toLowerCase());
  });

  it("prepares valid supply calldata for Aave Pool", () => {
    const instruction = prepareAaveSupply({
      chainId,
      assetAddress: config.usdcAddress,
      amountAtomic: amount,
      onBehalfOf: userAddress,
    });

    expect(instruction.chainId).toBe(8453);
    expect(instruction.to).toBe(config.poolAddress);
    expect(instruction.operation).toBe("supply");
    expect(instruction.value).toBe(0n);
    // supply(address,uint256,address,uint16) selector: 0x617ba037
    expect(instruction.data.startsWith("0x617ba037")).toBe(true);
    expect(instruction.data.toLowerCase()).toContain(config.usdcAddress.slice(2).toLowerCase());
    expect(instruction.data.toLowerCase()).toContain(userAddress.slice(2).toLowerCase());
  });

  it("prepares valid withdraw calldata for Aave Pool", () => {
    const instruction = prepareAaveWithdraw({
      chainId,
      assetAddress: config.usdcAddress,
      amountAtomic: amount,
      to: userAddress,
    });

    expect(instruction.chainId).toBe(8453);
    expect(instruction.to).toBe(config.poolAddress);
    expect(instruction.operation).toBe("withdraw");
    expect(instruction.value).toBe(0n);
    // withdraw(address,uint256,address) selector: 0x69328dec
    expect(instruction.data.startsWith("0x69328dec")).toBe(true);
    expect(instruction.data.toLowerCase()).toContain(config.usdcAddress.slice(2).toLowerCase());
    expect(instruction.data.toLowerCase()).toContain(userAddress.slice(2).toLowerCase());
  });

  it("rejects non-positive amounts or invalid addresses", () => {
    expect(() =>
      prepareAaveSupply({
        chainId,
        assetAddress: config.usdcAddress,
        amountAtomic: 0n,
        onBehalfOf: userAddress,
      }),
    ).toThrow(/greater than zero/);

    expect(() =>
      prepareAaveWithdraw({
        chainId,
        assetAddress: config.usdcAddress,
        amountAtomic: amount,
        to: "0xinvalid" as `0x${string}`,
      }),
    ).toThrow(/Invalid recipient/);
  });
});
