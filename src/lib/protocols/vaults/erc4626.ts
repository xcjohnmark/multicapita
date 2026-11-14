import { encodeFunctionData, erc20Abi, isAddress, parseAbi, type Address } from "viem";
import { getPublicClient } from "@/lib/chain/rpc";

/**
 * ERC-4626 vault adapter (Morpho/Gauntlet, Spark, Moonwell vaults on Base).
 *
 * Deposit sends `assets` of the underlying and mints shares to the receiver. Withdraw is
 * expressed in *assets* (`withdraw(assets, receiver, owner)`), so the user chooses how much USDC
 * comes back rather than a share count they cannot reason about. Calldata only; never signs.
 */

export const erc4626Abi = parseAbi([
  "function asset() view returns (address)",
  "function deposit(uint256 assets, address receiver) returns (uint256 shares)",
  "function withdraw(uint256 assets, address receiver, address owner) returns (uint256 shares)",
  "function previewDeposit(uint256 assets) view returns (uint256 shares)",
  "function maxWithdraw(address owner) view returns (uint256 maxAssets)",
]);

export type VaultInstruction = {
  chainId: number;
  to: Address;
  data: `0x${string}`;
  value: bigint;
  operation: "approve" | "vault_deposit" | "vault_redeem";
  description: string;
  amountAtomic: string;
};

function assertAddress(value: string, label: string): asserts value is Address {
  if (!isAddress(value, { strict: false })) throw new Error(`${label} is not a valid address.`);
}

export function prepareVaultApprove(input: {
  chainId: number;
  assetAddress: Address;
  vaultAddress: Address;
  amountAtomic: bigint;
}): VaultInstruction {
  assertAddress(input.assetAddress, "Asset");
  assertAddress(input.vaultAddress, "Vault");
  if (input.amountAtomic <= 0n) throw new Error("Approval amount must be positive.");
  return {
    chainId: input.chainId,
    to: input.assetAddress,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [input.vaultAddress, input.amountAtomic],
    }),
    value: 0n,
    operation: "approve",
    description: "Allow the vault to pull exactly this amount of the underlying asset.",
    amountAtomic: input.amountAtomic.toString(),
  };
}

export function prepareVaultDeposit(input: {
  chainId: number;
  vaultAddress: Address;
  amountAtomic: bigint;
  receiver: Address;
}): VaultInstruction {
  assertAddress(input.vaultAddress, "Vault");
  assertAddress(input.receiver, "Receiver");
  if (input.amountAtomic <= 0n) throw new Error("Deposit amount must be positive.");
  return {
    chainId: input.chainId,
    to: input.vaultAddress,
    data: encodeFunctionData({
      abi: erc4626Abi,
      functionName: "deposit",
      args: [input.amountAtomic, input.receiver],
    }),
    value: 0n,
    operation: "vault_deposit",
    description: "Deposit the underlying asset and receive vault shares.",
    amountAtomic: input.amountAtomic.toString(),
  };
}

export function prepareVaultWithdraw(input: {
  chainId: number;
  vaultAddress: Address;
  amountAtomic: bigint;
  receiver: Address;
  owner: Address;
}): VaultInstruction {
  assertAddress(input.vaultAddress, "Vault");
  assertAddress(input.receiver, "Receiver");
  assertAddress(input.owner, "Owner");
  if (input.amountAtomic <= 0n) throw new Error("Withdraw amount must be positive.");
  return {
    chainId: input.chainId,
    to: input.vaultAddress,
    data: encodeFunctionData({
      abi: erc4626Abi,
      functionName: "withdraw",
      args: [input.amountAtomic, input.receiver, input.owner],
    }),
    value: 0n,
    operation: "vault_redeem",
    description: "Burn shares and receive this exact amount of the underlying asset.",
    amountAtomic: input.amountAtomic.toString(),
  };
}

export async function getVaultAllowance(input: {
  chainId: number;
  assetAddress: Address;
  owner: Address;
  vaultAddress: Address;
}): Promise<bigint> {
  const client = getPublicClient(input.chainId);
  return client.readContract({
    address: input.assetAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [input.owner, input.vaultAddress],
  });
}
