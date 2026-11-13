import { encodeFunctionData, erc20Abi, isAddress, parseAbi, type Address } from "viem";
import { getPublicClient } from "@/lib/chain/rpc";

/**
 * Uniswap V3 Concentrated Liquidity LP Protocol Adapter.
 *
 * Supported chains:
 *  - Base (8453): USDC (`0x8335...`) / EURC (`0x60a3...`)
 *  - Arbitrum One (42161): USDC (`0xaf88...`) / USDT0 (`0xfd08...`)
 */

export const UNISWAP_V3_PAIRS: Record<
  number,
  {
    pairLabel: string;
    token0: Address;
    token0Symbol: string;
    token1: Address;
    token1Symbol: string;
    feeTier: number;
  }
> = {
  8453: {
    pairLabel: "USDC / EURC 0.01%",
    token0: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    token0Symbol: "USDC",
    token1: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42",
    token1Symbol: "EURC",
    feeTier: 100,
  },
  42161: {
    pairLabel: "USDC / USDT0 0.01%",
    token0: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    token0Symbol: "USDC",
    token1: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
    token1Symbol: "USDT0",
    feeTier: 100,
  },
};

export async function getUniswapAllowance(input: {
  chainId: number;
  tokenAddress: Address;
  ownerAddress: Address;
}): Promise<bigint> {
  const config = UNISWAP_V3_CONFIG[input.chainId];
  if (!config) throw new Error(`Unsupported Uniswap chain ${input.chainId}`);
  const client = getPublicClient(input.chainId);
  return client.readContract({
    address: input.tokenAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [input.ownerAddress, config.positionManager],
  });
}

export function prepareUniswapApprove(input: {
  chainId: number;
  tokenAddress: Address;
  amountAtomic: bigint;
  symbol?: string;
}): UniswapInstruction {
  const config = UNISWAP_V3_CONFIG[input.chainId];
  if (!config) throw new Error(`Unsupported Uniswap chain ${input.chainId}`);
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [config.positionManager, input.amountAtomic],
  });
  return {
    chainId: input.chainId,
    to: input.tokenAddress,
    data,
    value: 0n,
    operation: "approve_lp_token" as UniswapInstruction["operation"],
    description: `Approve ${config.name} PositionManager to spend ${input.symbol ?? "token"}`,
    explorerUrl: config.explorerUrl,
  };
}

export const UNISWAP_V3_CONFIG: Record<
  number,
  {
    positionManager: Address;
    explorerUrl: string;
    name: string;
  }
> = {
  8453: {
    positionManager: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
    explorerUrl: "https://basescan.org",
    name: "Uniswap V3 Base",
  },
  42161: {
    positionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
    explorerUrl: "https://arbiscan.io",
    name: "Uniswap V3 Arbitrum",
  },
};

export const positionManagerAbi = parseAbi([
  "struct MintParams { address token0; address token1; uint24 fee; int24 tickLower; int24 tickUpper; uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min; address recipient; uint256 deadline; }",
  "function mint(MintParams calldata params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  "struct DecreaseLiquidityParams { uint256 tokenId; uint128 liquidity; uint256 amount0Min; uint256 amount1Min; uint256 deadline; }",
  "function decreaseLiquidity(DecreaseLiquidityParams calldata params) external payable returns (uint256 amount0, uint256 amount1)",
  "struct CollectParams { uint256 tokenId; address recipient; uint128 amount0Max; uint128 amount1Max; }",
  "function collect(CollectParams calldata params) external payable returns (uint256 amount0, uint256 amount1)",
]);

export type UniswapInstruction = {
  chainId: number;
  to: Address;
  data: `0x${string}`;
  value: bigint;
  operation: "approve_lp_token" | "mint_lp" | "decrease_liquidity" | "collect_fees";
  description: string;
  explorerUrl: string;
};

/**
 * Quantize ticks to valid spacing for a given fee tier.
 * Fee 100 (0.01%) -> tickSpacing 1
 * Fee 500 (0.05%) -> tickSpacing 10
 * Fee 3000 (0.30%) -> tickSpacing 60
 */
export function getTickSpacing(feeTier: number): number {
  switch (feeTier) {
    case 100:
      return 1;
    case 500:
      return 10;
    case 3000:
      return 60;
    default:
      return 10;
  }
}

/**
 * Compute concentrated tick boundaries for a stablecoin pair around parity.
 * Default width: ±20 bps (tick -20 to +20).
 */
export function computeStablecoinTickRange(
  feeTier: number,
  spreadBps = 20,
): { tickLower: number; tickUpper: number } {
  const spacing = getTickSpacing(feeTier);
  const rawTicks = Math.max(spacing, Math.round(spreadBps / 1)); // 1 tick ≈ 1 bps (1.0001)
  const quantized = Math.floor(rawTicks / spacing) * spacing || spacing;

  return {
    tickLower: -quantized,
    tickUpper: quantized,
  };
}

/**
 * Prepare a mint liquidity transaction on Uniswap V3.
 */
export function prepareUniswapMint(input: {
  chainId: number;
  token0: Address;
  token1: Address;
  feeTier: number;
  tickLower: number;
  tickUpper: number;
  amount0DesiredAtomic: bigint;
  amount1DesiredAtomic: bigint;
  amount0MinAtomic?: bigint;
  amount1MinAtomic?: bigint;
  recipient: Address;
  deadlineMinutes?: number;
}): UniswapInstruction {
  const config = UNISWAP_V3_CONFIG[input.chainId];
  if (!config) throw new Error(`Unsupported Uniswap chain ${input.chainId}`);
  if (!isAddress(input.recipient)) throw new Error("Invalid recipient address");

  // Tokens must be strictly sorted by address in Uniswap V3
  const isSorted = input.token0.toLowerCase() < input.token1.toLowerCase();
  const [token0, token1] = isSorted ? [input.token0, input.token1] : [input.token1, input.token0];
  const [amount0, amount1] = isSorted
    ? [input.amount0DesiredAtomic, input.amount1DesiredAtomic]
    : [input.amount1DesiredAtomic, input.amount0DesiredAtomic];
  const amount0Min = input.amount0MinAtomic ?? (amount0 * 995n) / 1000n; // default 0.5% slippage
  const amount1Min = input.amount1MinAtomic ?? (amount1 * 995n) / 1000n;

  const deadline = BigInt(Math.floor(Date.now() / 1000) + (input.deadlineMinutes ?? 20) * 60);

  const data = encodeFunctionData({
    abi: positionManagerAbi,
    functionName: "mint",
    args: [
      {
        token0,
        token1,
        fee: input.feeTier,
        tickLower: input.tickLower,
        tickUpper: input.tickUpper,
        amount0Desired: amount0,
        amount1Desired: amount1,
        amount0Min,
        amount1Min,
        recipient: input.recipient,
        deadline,
      },
    ],
  });

  return {
    chainId: input.chainId,
    to: config.positionManager,
    data,
    value: 0n,
    operation: "mint_lp",
    description: `Mint concentrated liquidity position in Uniswap V3 pool`,
    explorerUrl: config.explorerUrl,
  };
}

/**
 * Prepare a collect fees transaction on Uniswap V3.
 */
export function prepareUniswapCollect(input: {
  chainId: number;
  tokenId: bigint;
  recipient: Address;
}): UniswapInstruction {
  const config = UNISWAP_V3_CONFIG[input.chainId];
  if (!config) throw new Error(`Unsupported Uniswap chain ${input.chainId}`);
  if (!isAddress(input.recipient)) throw new Error("Invalid recipient address");

  const MAX_UINT128 = 2n ** 128n - 1n;

  const data = encodeFunctionData({
    abi: positionManagerAbi,
    functionName: "collect",
    args: [
      {
        tokenId: input.tokenId,
        recipient: input.recipient,
        amount0Max: MAX_UINT128,
        amount1Max: MAX_UINT128,
      },
    ],
  });

  return {
    chainId: input.chainId,
    to: config.positionManager,
    data,
    value: 0n,
    operation: "collect_fees",
    description: `Collect accrued fees from Uniswap V3 LP position #${input.tokenId}`,
    explorerUrl: config.explorerUrl,
  };
}
