import { encodeFunctionData, erc20Abi, isAddress, type Address, parseAbi } from "viem";
import { getPublicClient } from "@/lib/chain/rpc";

/**
 * Aave V3 Supply & Withdraw Protocol Adapter.
 *
 * Supported chains:
 *  - Base (8453)
 *  - Arbitrum One (42161)
 *
 * Invariants:
 *  - Deterministic calldata generation only.
 *  - Never holds private keys.
 *  - Allowance is checked before requesting supply signatures.
 */

export const AAVE_V3_CONFIG: Record<
  number,
  {
    poolAddress: Address;
    usdcAddress: Address;
    aBasUsdcAddress: Address;
    name: string;
    explorerUrl: string;
  }
> = {
  8453: {
    poolAddress: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
    usdcAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    aBasUsdcAddress: "0x4e65fE4DbA92Fc12ee471321473d09a06F74e64A",
    name: "Aave V3 Base",
    explorerUrl: "https://basescan.org",
  },
  42161: {
    poolAddress: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    usdcAddress: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    aBasUsdcAddress: "0x724dc807b04555b71ed48a6006532c8c643716CE",
    name: "Aave V3 Arbitrum",
    explorerUrl: "https://arbiscan.io",
  },
};

export const aavePoolAbi = parseAbi([
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
  "function withdraw(address asset, uint256 amount, address to) external returns (uint256)",
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
]);

export type ProtocolInstruction = {
  chainId: number;
  to: Address;
  data: `0x${string}`;
  value: bigint;
  operation: "approve" | "supply" | "withdraw";
  description: string;
  assetAddress: Address;
  amountAtomic: string;
  explorerUrl: string;
};

/**
 * Read the current ERC-20 allowance granted to the Aave V3 pool.
 */
export async function getAaveAllowance(input: {
  chainId: number;
  assetAddress: Address;
  ownerAddress: Address;
}): Promise<bigint> {
  const config = AAVE_V3_CONFIG[input.chainId];
  if (!config) throw new Error(`Unsupported Aave chain ${input.chainId}`);

  const client = getPublicClient(input.chainId);
  const allowance = await client.readContract({
    address: input.assetAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [input.ownerAddress, config.poolAddress],
  });

  return allowance;
}

/**
 * Read the user's supplied balance in Aave (aToken balance).
 */
export async function getAaveSuppliedBalance(input: {
  chainId: number;
  ownerAddress: Address;
}): Promise<bigint> {
  const config = AAVE_V3_CONFIG[input.chainId];
  if (!config) throw new Error(`Unsupported Aave chain ${input.chainId}`);

  const client = getPublicClient(input.chainId);
  const balance = await client.readContract({
    address: config.aBasUsdcAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [input.ownerAddress],
  });

  return balance;
}

/**
 * Prepare an ERC-20 approve transaction for the Aave pool.
 */
export function prepareAaveApprove(input: {
  chainId: number;
  assetAddress: Address;
  amountAtomic: bigint;
}): ProtocolInstruction {
  const config = AAVE_V3_CONFIG[input.chainId];
  if (!config) throw new Error(`Unsupported Aave chain ${input.chainId}`);
  if (input.amountAtomic <= 0n) throw new Error("Approval amount must be greater than zero");

  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [config.poolAddress, input.amountAtomic],
  });

  return {
    chainId: input.chainId,
    to: input.assetAddress,
    data,
    value: 0n,
    operation: "approve",
    description: `Approve Aave V3 Pool to spend ${input.amountAtomic} atomic units`,
    assetAddress: input.assetAddress,
    amountAtomic: input.amountAtomic.toString(),
    explorerUrl: config.explorerUrl,
  };
}

/**
 * Prepare an Aave V3 supply transaction.
 */
export function prepareAaveSupply(input: {
  chainId: number;
  assetAddress: Address;
  amountAtomic: bigint;
  onBehalfOf: Address;
}): ProtocolInstruction {
  const config = AAVE_V3_CONFIG[input.chainId];
  if (!config) throw new Error(`Unsupported Aave chain ${input.chainId}`);
  if (input.amountAtomic <= 0n) throw new Error("Supply amount must be greater than zero");
  if (!isAddress(input.onBehalfOf)) throw new Error("Invalid onBehalfOf address");

  const data = encodeFunctionData({
    abi: aavePoolAbi,
    functionName: "supply",
    args: [input.assetAddress, input.amountAtomic, input.onBehalfOf, 0],
  });

  return {
    chainId: input.chainId,
    to: config.poolAddress,
    data,
    value: 0n,
    operation: "supply",
    description: `Supply ${input.amountAtomic} atomic units to Aave V3 Pool`,
    assetAddress: input.assetAddress,
    amountAtomic: input.amountAtomic.toString(),
    explorerUrl: config.explorerUrl,
  };
}

/**
 * Prepare an Aave V3 withdraw transaction.
 */
export function prepareAaveWithdraw(input: {
  chainId: number;
  assetAddress: Address;
  amountAtomic: bigint;
  to: Address;
}): ProtocolInstruction {
  const config = AAVE_V3_CONFIG[input.chainId];
  if (!config) throw new Error(`Unsupported Aave chain ${input.chainId}`);
  if (input.amountAtomic <= 0n) throw new Error("Withdraw amount must be greater than zero");
  if (!isAddress(input.to)) throw new Error("Invalid recipient address");

  const data = encodeFunctionData({
    abi: aavePoolAbi,
    functionName: "withdraw",
    args: [input.assetAddress, input.amountAtomic, input.to],
  });

  return {
    chainId: input.chainId,
    to: config.poolAddress,
    data,
    value: 0n,
    operation: "withdraw",
    description: `Withdraw ${input.amountAtomic} atomic units from Aave V3 Pool`,
    assetAddress: input.assetAddress,
    amountAtomic: input.amountAtomic.toString(),
    explorerUrl: config.explorerUrl,
  };
}
