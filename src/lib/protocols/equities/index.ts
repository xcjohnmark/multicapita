import { encodeFunctionData, erc20Abi, isAddress, type Address } from "viem";

/**
 * Tokenized Equities & Real-World Assets (RWA) Protocol Adapter.
 *
 * Enforces dual price provenance:
 *  1. Live On-Chain DEX / RFQ Execution Quote
 *  2. TradFi Reference NAV & Exchange Session Status (NYSE/NASDAQ)
 *
 * Invariants:
 *  - Token identity is strictly `(chainId, contractAddress)`.
 *  - Spread check: Blocks execution when `navDeviationBps > maxNavDeviationBps`.
 *  - Off-hours execution guardrail: Blocks when market is closed unless explicitly overridden.
 *  - Multi-leg execution is never claimed to be atomic.
 */

export type EquityMarketSession = "OPEN" | "EXTENDED" | "CLOSED";

export type TokenizedEquityAsset = {
  chainId: number;
  contractAddress: Address;
  symbol: string;
  name: string;
  underlyingTicker: string;
  decimals: number;
  issuer: "Dinari" | "Backed" | "Tether" | "Ondo";
  wrapperType: "total_return_reinvesting" | "price_tracker" | "physical_commodity";
  explorerUrl: string;
};

export const VERIFIED_TOKENIZED_ASSETS: TokenizedEquityAsset[] = [
  {
    chainId: 42161,
    contractAddress: "0x0660bbBFF171Bf28328114f08e705bC116e2566F",
    symbol: "NVDA.d",
    name: "Dinari Nvidia dShare",
    underlyingTicker: "NVDA",
    decimals: 18,
    issuer: "Dinari",
    wrapperType: "total_return_reinvesting",
    explorerUrl: "https://arbiscan.io",
  },
  {
    chainId: 42161,
    contractAddress: "0x24119B24902F135e5d32982855bA5430cf1243be",
    symbol: "AAPL.d",
    name: "Dinari Apple dShare",
    underlyingTicker: "AAPL",
    decimals: 18,
    issuer: "Dinari",
    wrapperType: "total_return_reinvesting",
    explorerUrl: "https://arbiscan.io",
  },
  {
    chainId: 42161,
    contractAddress: "0x403dD6e6761E085810b1a03A0bEbfa824d5B6465",
    symbol: "AAPLx",
    name: "Backed Apple xStock",
    underlyingTicker: "AAPL",
    decimals: 18,
    issuer: "Backed",
    wrapperType: "price_tracker",
    explorerUrl: "https://arbiscan.io",
  },
  {
    chainId: 42161,
    contractAddress: "0x47f5cfbdc59918fb5dc50428ad8ef348e3be2ce6",
    symbol: "NVDAx",
    name: "Backed Nvidia xStock",
    underlyingTicker: "NVDA",
    decimals: 18,
    issuer: "Backed",
    wrapperType: "price_tracker",
    explorerUrl: "https://arbiscan.io",
  },
  {
    chainId: 42161,
    contractAddress: "0x68749665FF8D2d112Fa859AA293F07A622782F38",
    symbol: "XAUT",
    name: "Tether Gold",
    underlyingTicker: "XAU",
    decimals: 6,
    issuer: "Tether",
    wrapperType: "physical_commodity",
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
 * Standard hours: 9:30 AM - 4:00 PM Eastern, Monday - Friday.
 * Extended hours: 4:00 AM - 9:30 AM and 4:00 PM - 8:00 PM Eastern.
 */
export function getMarketSessionStatus(date = new Date()): EquityMarketSession {
  // Convert to US Eastern Time (UTC-5 / UTC-4)
  const estString = date.toLocaleString("en-US", { timeZone: "America/New_York" });
  const estDate = new Date(estString);
  const day = estDate.getDay();
  const hours = estDate.getHours();
  const minutes = estDate.getMinutes();
  const currentMinutes = hours * 60 + minutes;

  // Weekend
  if (day === 0 || day === 6) return "CLOSED";

  // Standard regular hours: 9:30 (570 min) to 16:00 (960 min)
  if (currentMinutes >= 570 && currentMinutes < 960) {
    return "OPEN";
  }

  // Pre-market: 4:00 (240 min) to 9:30 (570 min)
  // After-hours: 16:00 (960 min) to 20:00 (1200 min)
  if (
    (currentMinutes >= 240 && currentMinutes < 570) ||
    (currentMinutes >= 960 && currentMinutes < 1200)
  ) {
    return "EXTENDED";
  }

  return "CLOSED";
}

export type DualPriceProvenance = {
  dexExecutionPriceUsd: number;
  referenceNavUsd: number;
  navDeviationBps: number;
  sessionStatus: EquityMarketSession;
  isWithinSpreadBound: boolean;
  navObservedAt: string;
};

/**
 * Validate dual price provenance and calculate basis point spread.
 */
export function evaluateEquityPriceProvenance(input: {
  dexPriceUsd: number;
  referenceNavUsd: number;
  maxNavDeviationBps: number;
  allowOffHoursExecution?: boolean;
  now?: Date;
}): {
  provenance: DualPriceProvenance;
  allowed: boolean;
  refusalReason?: string;
} {
  const now = input.now ?? new Date();
  const sessionStatus = getMarketSessionStatus(now);

  if (input.referenceNavUsd <= 0) {
    return {
      provenance: {
        dexExecutionPriceUsd: input.dexPriceUsd,
        referenceNavUsd: 0,
        navDeviationBps: 9999,
        sessionStatus,
        isWithinSpreadBound: false,
        navObservedAt: now.toISOString(),
      },
      allowed: false,
      refusalReason: "Reference NAV data is unavailable or non-positive.",
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
      refusalReason: "Underlying stock market is currently CLOSED. Off-hours execution is disabled by user policy to prevent liquidity spread slippage.",
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

/**
 * Prepare an ERC-20 approval for tokenized equity acquisition.
 */
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
    description: `Approve DEX router to spend ${input.amountAtomic} atomic USDC for ${input.equityAsset.symbol}`,
    equityAsset: input.equityAsset,
    amountAtomic: input.amountAtomic.toString(),
    explorerUrl: input.equityAsset.explorerUrl,
    provenance: input.provenance,
  };
}
