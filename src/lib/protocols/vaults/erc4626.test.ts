import { decodeFunctionData, erc20Abi } from "viem";
import { describe, expect, it } from "vitest";
import { erc4626Abi, prepareVaultApprove, prepareVaultDeposit, prepareVaultWithdraw } from "./erc4626";

const VAULT = "0x0bb69b79bc829e1cfcc34a740110886d98d2bd14" as const;
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" as const;
const USER = "0x1111111111111111111111111111111111111111" as const;

describe("ERC-4626 calldata", () => {
  it("approves the vault for the exact amount", () => {
    const inst = prepareVaultApprove({ chainId: 8453, assetAddress: USDC, vaultAddress: VAULT, amountAtomic: 5_000_000n });
    expect(inst.to).toBe(USDC);
    const decoded = decodeFunctionData({ abi: erc20Abi, data: inst.data });
    expect(decoded.functionName).toBe("approve");
    expect([String(decoded.args?.[0]).toLowerCase(), decoded.args?.[1]]).toEqual([VAULT, 5_000_000n]);
  });

  it("deposits assets to the receiver", () => {
    const inst = prepareVaultDeposit({ chainId: 8453, vaultAddress: VAULT, amountAtomic: 5_000_000n, receiver: USER });
    expect(inst.to).toBe(VAULT);
    expect(inst.value).toBe(0n);
    const decoded = decodeFunctionData({ abi: erc4626Abi, data: inst.data });
    expect(decoded.functionName).toBe("deposit");
    expect(decoded.args?.map((a) => (typeof a === "string" ? a.toLowerCase() : a))).toEqual([5_000_000n, USER]);
  });

  it("withdraws an exact asset amount", () => {
    const inst = prepareVaultWithdraw({
      chainId: 8453,
      vaultAddress: VAULT,
      amountAtomic: 2_000_000n,
      receiver: USER,
      owner: USER,
    });
    const decoded = decodeFunctionData({ abi: erc4626Abi, data: inst.data });
    expect(decoded.functionName).toBe("withdraw");
    expect(decoded.args?.map((a) => (typeof a === "string" ? a.toLowerCase() : a))).toEqual([2_000_000n, USER, USER]);
  });

  it("rejects zero amounts and bad addresses", () => {
    expect(() => prepareVaultDeposit({ chainId: 8453, vaultAddress: VAULT, amountAtomic: 0n, receiver: USER })).toThrow();
    expect(() =>
      prepareVaultDeposit({ chainId: 8453, vaultAddress: "0x12" as `0x${string}`, amountAtomic: 1n, receiver: USER }),
    ).toThrow();
  });
});
