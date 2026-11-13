import { encodeFunctionData, erc20Abi, parseAbi, type Address } from "viem";
import { getPublicClient } from "@/lib/chain/rpc";

/**
 * Tokenized Equities & Real-World Assets (RWA) Protocol Adapter.
 *
 * Verified contract registry (checked on-chain & DEX Screener):
 *  - Arbitrum One (42161): Dinari dShares NVDA (`0x4DaF...Ce5c`), AAPL (`0xCe38...5a7`)
 *  - Ethereum (1): Ondo Stocks NVDAon (`0x2D1F...bDEE`), AAPLon (`0x14c3...2d4c`),
 *                  TSLAon (`0xf6b1...103f`), Tether Gold XAUT (`0x6874...2F38`)
 *
 * Invariants:
 *  - Token identity is strictly `(chainId, contractAddress)`.
 *  - Never invent hardcoded $120.45 DEX or NAV prices: live dual quotes are fetched from
 *    Yahoo Finance (`TradFi Reference NAV`) + DEX Screener (`on-chain DEX execution`).
 *  - Spread check: Blocks execution when `navDeviationBps > maxNavDeviationBps`.
 *  - Multi-step execution (Step 1 Approve -> Step 2 SwapRouter02 exactInputSingle) is never claimed atomic.
 */

export type EquityMarketSession = "OPEN" | "EXTENDED" | "CLOSED";

export type TokenizedEquityAsset = {
  chainId: number;
  chainName: string;
  dexScreenerChain: "arbitrum" | "ethereum";
  contractAddress: Address;
  quoteUsdcAddress: Address;
  swapRouterAddress: Address;
  symbol: string;
  name: string;
  underlyingTicker: string;
  yahooSymbol: string;
  decimals: number;
  feeTier: number;
  issuer: "Dinari" | "Ondo" | "Tether";
  wrapperType: "total_return_reinvesting" | "physical_commodity";
  explorerUrl: string;
  oneClickAssetId?: string;
};

export const UNISWAP_SWAP_ROUTER_02: Record<number, Address> = {
  42161: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  1: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  8453: "0x2626664c2603336E57B271c5C0b26F421741e481",
};

const swapRouter02Abi = parseAbi([
  "struct ExactInputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }",
  "function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut)",
]);

export const VERIFIED_TOKENIZED_ASSETS: TokenizedEquityAsset[] = [
  {
    chainId: 1,
    chainName: "Ethereum",
    dexScreenerChain: "ethereum",
    contractAddress: "0x2D1F7226Bd1F780AF6B9A49DCC0aE00E8Df4bDEE",
    quoteUsdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    swapRouterAddress: UNISWAP_SWAP_ROUTER_02[1],
    symbol: "NVDAon",
    name: "Nvidia (Ondo Tokenized)",
    underlyingTicker: "NVDA",
    yahooSymbol: "NVDA",
    decimals: 18,
    feeTier: 500,
    issuer: "Ondo",
    wrapperType: "total_return_reinvesting",
    explorerUrl: "https://etherscan.io",
  },
  {
    chainId: 1,
    chainName: "Ethereum",
    dexScreenerChain: "ethereum",
    contractAddress: "0x14c3abF94bcC9698967923418526543Cb87b2d4c",
    quoteUsdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    swapRouterAddress: UNISWAP_SWAP_ROUTER_02[1],
    symbol: "AAPLon",
    name: "Apple (Ondo Tokenized)",
    underlyingTicker: "AAPL",
    yahooSymbol: "AAPL",
    decimals: 18,
    feeTier: 500,
    issuer: "Ondo",
    wrapperType: "total_return_reinvesting",
    explorerUrl: "https://etherscan.io",
  },
  {
    chainId: 1,
    chainName: "Ethereum",
    dexScreenerChain: "ethereum",
    contractAddress: "0xf6b1117ec07684d3958cad8beb1b302bfd21103f",
    quoteUsdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    swapRouterAddress: UNISWAP_SWAP_ROUTER_02[1],
    symbol: "TSLAon",
    name: "Tesla (Ondo Tokenized)",
    underlyingTicker: "TSLA",
    yahooSymbol: "TSLA",
    decimals: 18,
    feeTier: 500,
    issuer: "Ondo",
    wrapperType: "total_return_reinvesting",
    explorerUrl: "https://etherscan.io",
  },
  {
    chainId: 1,
    chainName: "Ethereum",
    dexScreenerChain: "ethereum",
    contractAddress: "0x68749665FF8D2d112Fa859AA293F07A622782F38",
    quoteUsdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    swapRouterAddress: UNISWAP_SWAP_ROUTER_02[1],
    symbol: "XAUT",
    name: "Tether Gold",
    underlyingTicker: "XAU",
    yahooSymbol: "GC=F",
    decimals: 6,
    feeTier: 500,
    issuer: "Tether",
    wrapperType: "physical_commodity",
    explorerUrl: "https://etherscan.io",
    oneClickAssetId: "nep141:eth-0x68749665ff8d2d112fa859aa293f07a622782f38.omft.near",
  },
  {
    chainId: 42161,
    chainName: "Arbitrum One",
    dexScreenerChain: "arbitrum",
    contractAddress: "0x4DaFFfDDEa93DdF1e0e7B61E844331455053Ce5c",
    quoteUsdcAddress: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    swapRouterAddress: UNISWAP_SWAP_ROUTER_02[42161],
    symbol: "NVDA.d",
    name: "NVIDIA Corporation - Dinari",
    underlyingTicker: "NVDA",
    yahooSymbol: "NVDA",
    decimals: 18,
    feeTier: 500,
    issuer: "Dinari",
    wrapperType: "total_return_reinvesting",
    explorerUrl: "https://arbiscan.io",
  },
  {
    chainId: 42161,
    chainName: "Arbitrum One",
    dexScreenerChain: "arbitrum",
    contractAddress: "0xCe38e140fC3982a6bCEbc37b040913EF2Cd6C5a7",
    quoteUsdcAddress: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    swapRouterAddress: UNISWAP_SWAP_ROUTER_02[42161],
    symbol: "AAPL.d",
    name: "Apple Inc. - Dinari",
    underlyingTicker: "AAPL",
    yahooSymbol: "AAPL",
    decimals: 18,
    feeTier: 500,
    issuer: "Dinari",
    wrapperType: "total_return_reinvesting",
    explorerUrl: "https://arbiscan.io",
  },
];

export function getVerifiedEquityAsset(
  chainId: number,
  contractAddress: string,
): TokenizedEquityAsset | null {
  const norm = contractAddress.toLowerCase();
  return (
    VERIFIED_TOKENIZED_ASSETS.find(
      (a) => a.chainId === chainId && a.contractAddress.toLowerCase() === norm,
    ) ?? null
  );
}

/**
 * Determine current US equity market session status.
 * Note: Physical commodities (XAU/XAUT) trade nearly 24/5 and are treated as OPEN on weekdays.
 */
export function getMarketSessionStatus(date = new Date(), isCommodity = false): EquityMarketSession {
  const estString = date.toLocaleString("en-US", { timeZone: "America/New_York" });
  const estDate = new Date(estString);
  const day = estDate.getDay();
  const currentMinutes = estDate.getHours() * 60 + estDate.getMinutes();

  if (day === 0 || day === 6) return "CLOSED";
  if (isCommodity) return "OPEN";

  if (currentMinutes >= 570 && currentMinutes < 960) return "OPEN";
  if (
    (currentMinutes >= 240 && currentMinutes < 570) ||
    (currentMinutes >= 960 && currentMinutes < 1200)
  ) {
    return "EXTENDED";
  }
  return "CLOSED";
}

export type LiveEquityQuoteResult = {
  asset: TokenizedEquityAsset;
  referenceNavUsd: number | null;
  referenceSource: string;
  dexPriceUsd: number | null;
  dexLiquidityUsd: number | null;
  dexSource: string;
  observedAt: string;
};

/**
 * Fetch real live dual-source equity pricing:
 *  1. TradFi Reference NAV from Yahoo Finance
 *  2. On-Chain DEX Execution price & pool liquidity from DEX Screener
 */
export async function fetchLiveEquityDualQuote(
  asset: TokenizedEquityAsset,
): Promise<LiveEquityQuoteResult> {
  const observedAt = new Date().toISOString();
  let referenceNavUsd: number | null = null;
  let dexPriceUsd: number | null = null;
  let dexLiquidityUsd: number | null = null;

  const [yahooRes, dexRes] = await Promise.allSettled([
    fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(asset.yahooSymbol)}?interval=1d&range=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6_000) },
    ),
    fetch(
      `https://api.dexscreener.com/tokens/v1/${asset.dexScreenerChain}/${asset.contractAddress}`,
      { signal: AbortSignal.timeout(6_000) },
    ),
  ]);

  if (yahooRes.status === "fulfilled" && yahooRes.value.ok) {
    const json = (await yahooRes.value.json()) as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> };
    };
    const price = json.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (typeof price === "number" && price > 0) referenceNavUsd = price;
  }

  if (dexRes.status === "fulfilled" && dexRes.value.ok) {
    const pairs = (await dexRes.value.json()) as Array<{
      priceUsd?: string;
      liquidity?: { usd?: number };
    }>;
    if (Array.isArray(pairs) && pairs.length > 0) {
      const sorted = [...pairs].sort(
        (a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0),
      );
      const best = sorted[0];
      const parsedPrice = best?.priceUsd ? Number(best.priceUsd) : NaN;
      if (Number.isFinite(parsedPrice) && parsedPrice > 0) dexPriceUsd = parsedPrice;
      if (typeof best?.liquidity?.usd === "number") dexLiquidityUsd = best.liquidity.usd;
    }
  }

  return {
    asset,
    referenceNavUsd,
    referenceSource: referenceNavUsd !== null ? "yahoo_finance_v8" : "unavailable",
    dexPriceUsd,
    dexLiquidityUsd,
    dexSource: dexPriceUsd !== null ? "dexscreener_v1" : "no_live_dex_pool",
    observedAt,
  };
}

export type DualPriceProvenance = {
  dexExecutionPriceUsd: number;
  referenceNavUsd: number;
  navDeviationBps: number;
  sessionStatus: EquityMarketSession;
  isWithinSpreadBound: boolean;
  navObservedAt: string;
};

export function evaluateEquityPriceProvenance(input: {
  dexPriceUsd: number | null;
  referenceNavUsd: number | null;
  maxNavDeviationBps: number;
  allowOffHoursExecution?: boolean;
  isCommodity?: boolean;
  now?: Date;
}): {
  provenance: DualPriceProvenance;
  allowed: boolean;
  refusalReason?: string;
} {
  const now = input.now ?? new Date();
  const sessionStatus = getMarketSessionStatus(now, input.isCommodity);

  if (
    input.referenceNavUsd === null ||
    input.referenceNavUsd <= 0 ||
    input.dexPriceUsd === null ||
    input.dexPriceUsd <= 0
  ) {
    return {
      provenance: {
        dexExecutionPriceUsd: input.dexPriceUsd ?? 0,
        referenceNavUsd: input.referenceNavUsd ?? 0,
        navDeviationBps: 9999,
        sessionStatus,
        isWithinSpreadBound: false,
        navObservedAt: now.toISOString(),
      },
      allowed: false,
      refusalReason:
        input.dexPriceUsd === null
          ? "No active on-chain DEX liquidity pool found for this token; use NEAR Intents 1Click (for XAUT) or verify liquidity first."
          : "Live TradFi Reference NAV is unavailable; refusing unpriced execution.",
    };
  }

  const deviation = Math.abs(input.dexPriceUsd - input.referenceNavUsd);
  const navDeviationBps = Math.round((deviation / input.referenceNavUsd) * 10_000);
  const isWithinSpreadBound = navDeviationBps <= input.maxNavDeviationBps;

  if (!isWithinSpreadBound) {
    return {
      provenance: {
        dexExecutionPriceUsd: input.dexPriceUsd,
        referenceNavUsd: input.referenceNavUsd,
        navDeviationBps,
        sessionStatus,
        isWithinSpreadBound: false,
        navObservedAt: now.toISOString(),
      },
      allowed: false,
      refusalReason: `DEX price ($${input.dexPriceUsd.toFixed(2)}) deviates by ${navDeviationBps} bps from Reference NAV ($${input.referenceNavUsd.toFixed(2)}), exceeding guardrail limit of ${input.maxNavDeviationBps} bps.`,
    };
  }

  if (sessionStatus === "CLOSED" && !input.allowOffHoursExecution) {
    return {
      provenance: {
        dexExecutionPriceUsd: input.dexPriceUsd,
        referenceNavUsd: input.referenceNavUsd,
        navDeviationBps,
        sessionStatus,
        isWithinSpreadBound: true,
        navObservedAt: now.toISOString(),
      },
      allowed: false,
      refusalReason:
        "Underlying stock market is currently CLOSED. Off-hours execution is disabled by user policy to prevent liquidity spread slippage.",
    };
  }

  return {
    provenance: {
      dexExecutionPriceUsd: input.dexPriceUsd,
      referenceNavUsd: input.referenceNavUsd,
      navDeviationBps,
      sessionStatus,
      isWithinSpreadBound: true,
      navObservedAt: now.toISOString(),
    },
    allowed: true,
  };
}

export async function getEquityAllowance(input: {
  chainId: number;
  tokenAddress: Address;
  ownerAddress: Address;
  spenderAddress: Address;
}): Promise<bigint> {
  if (input.chainId !== 8453 && input.chainId !== 42161) return 0n;
  try {
    const client = getPublicClient(input.chainId);
    return await client.readContract({
      address: input.tokenAddress,
      abi: erc20Abi,
      functionName: "allowance",
      args: [input.ownerAddress, input.spenderAddress],
    });
  } catch {
    return 0n;
  }
}

export type EquitySwapInstruction = {
  chainId: number;
  to: Address;
  data: `0x${string}`;
  value: bigint;
  operation: "approve" | "swap_buy" | "swap_sell";
  description: string;
  equityAsset: TokenizedEquityAsset;
  amountAtomic: string;
  explorerUrl: string;
  provenance: DualPriceProvenance;
};

export function prepareEquityApprove(input: {
  chainId: number;
  usdcAddress: Address;
  dexRouterAddress: Address;
  amountAtomic: bigint;
  equityAsset: TokenizedEquityAsset;
  provenance: DualPriceProvenance;
}): EquitySwapInstruction {
  if (input.amountAtomic <= 0n) throw new Error("Amount must be greater than zero");

  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [input.dexRouterAddress, input.amountAtomic],
  });

  return {
    chainId: input.chainId,
    to: input.usdcAddress,
    data,
    value: 0n,
    operation: "approve",
    description: `Approve SwapRouter02 to spend ${input.amountAtomic} atomic USDC for ${input.equityAsset.symbol}`,
    equityAsset: input.equityAsset,
    amountAtomic: input.amountAtomic.toString(),
    explorerUrl: input.equityAsset.explorerUrl,
    provenance: input.provenance,
  };
}

/**
 * Prepare Step 2 SwapRouter02 `exactInputSingle` calldata for buying or selling a tokenized equity.
 */
export function prepareEquitySwap(input: {
  direction: "buy" | "sell";
  amountAtomic: bigint;
  minOutputAtomic: bigint;
  recipient: Address;
  equityAsset: TokenizedEquityAsset;
  provenance: DualPriceProvenance;
}): EquitySwapInstruction {
  if (input.amountAtomic <= 0n) throw new Error("Amount must be greater than zero");
  const tokenIn =
    input.direction === "buy" ? input.equityAsset.quoteUsdcAddress : input.equityAsset.contractAddress;
  const tokenOut =
    input.direction === "buy" ? input.equityAsset.contractAddress : input.equityAsset.quoteUsdcAddress;

  const data = encodeFunctionData({
    abi: swapRouter02Abi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn,
        tokenOut,
        fee: input.equityAsset.feeTier,
        recipient: input.recipient,
        amountIn: input.amountAtomic,
        amountOutMinimum: input.minOutputAtomic,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });

  return {
    chainId: input.equityAsset.chainId,
    to: input.equityAsset.swapRouterAddress,
    data,
    value: 0n,
    operation: input.direction === "buy" ? "swap_buy" : "swap_sell",
    description:
      input.direction === "buy"
        ? `Swap USDC → ${input.equityAsset.symbol} via SwapRouter02`
        : `Sell ${input.equityAsset.symbol} → USDC via SwapRouter02`,
    equityAsset: input.equityAsset,
    amountAtomic: input.amountAtomic.toString(),
    explorerUrl: input.equityAsset.explorerUrl,
    provenance: input.provenance,
  };
}
