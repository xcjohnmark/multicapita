import { erc20Abi, isAddress, type Address } from "viem";
import { getPublicClient } from "@/lib/chain/rpc";
import { SUPPORTED_CHAINS, type SupportedChain } from "@/lib/chains";
import { formatAtomic } from "@/lib/finance/amounts";
/**
 * Direct chain reads for a connected wallet.
 *
 * Deliberately narrow: this module answers "what does this address hold right now, at which
 * block, according to which RPC" and nothing else. It attaches no USD valuation, because a price
 * without a verified source and timestamp is exactly the kind of fabricated live figure this
 * project forbids. Valuation happens later, with a labelled source.
 */

export type TokenLine = {
  symbol: string;
  address: Address;
  decimals: number;
  amountAtomic: string;
  amountDisplay: string;
};

export type ChainBalance = {
  chainId: number;
  chainName: string;
  explorerUrl: string;
  blockNumber: string | null;
  observedAt: string;
  source: "rpc";
  native: TokenLine | null;
  tokens: TokenLine[];
  error: string | null;
};

export type WalletBalances = {
  address: Address;
  observedAt: string;
  /** No USD field on purpose: see the module comment. */
  chains: ChainBalance[];
};

export type RawChainBalance = {
  chain: SupportedChain;
  blockNumber: bigint | null;
  nativeAtomic: bigint | null;
  usdcAtomic: bigint | null;
  observedAt: Date;
  error: string | null;
};

export function parseAddress(value: string): Address | null {
  return isAddress(value, { strict: false }) ? (value as Address) : null;
}

/** Pure mapping from a raw read to the response shape, so the display rules are testable. */
export function toChainBalance(raw: RawChainBalance): ChainBalance {
  const native =
    raw.nativeAtomic === null
      ? null
      : {
          symbol: "ETH",
          address: "0x0000000000000000000000000000000000000000" as Address,
          decimals: 18,
          amountAtomic: raw.nativeAtomic.toString(),
          // Display precision only. The atomic string above is the authoritative value.
          amountDisplay: roundForDisplay(raw.nativeAtomic, 18, 6),
        };

  const tokens: TokenLine[] =
    raw.usdcAtomic === null
      ? []
      : [
          {
            symbol: raw.chain.usdc.symbol,
            address: raw.chain.usdc.address,
            decimals: raw.chain.usdc.decimals,
            amountAtomic: raw.usdcAtomic.toString(),
            amountDisplay: formatAtomic(raw.usdcAtomic, raw.chain.usdc.decimals),
          },
        ];

  return {
    chainId: raw.chain.id,
    chainName: raw.chain.name,
    explorerUrl: raw.chain.explorerUrl,
    blockNumber: raw.blockNumber === null ? null : raw.blockNumber.toString(),
    observedAt: raw.observedAt.toISOString(),
    source: "rpc",
    native,
    tokens,
    error: raw.error,
  };
}

/**
 * Trim a long decimal for display only. Never used for a balance comparison or a transaction:
 * callers that need the exact value read `amountAtomic`.
 */
function roundForDisplay(atomic: bigint, decimals: number, keepDecimals: number): string {
  if (decimals <= keepDecimals) return formatAtomic(atomic, decimals);
  const exact = formatAtomic(atomic, decimals);
  const [whole = "0", fraction = ""] = exact.split(".");
  const trimmed = fraction.slice(0, keepDecimals).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

export async function readWalletBalances(address: Address): Promise<WalletBalances> {
  const observedAt = new Date();

  const results = await Promise.all(
    SUPPORTED_CHAINS.map(async (chain): Promise<RawChainBalance> => {
      const client = getPublicClient(chain.id);

      try {
        const [blockNumber, nativeBalance, usdcBalance] = await Promise.all([
          client.getBlockNumber(),
          client.getBalance({ address }),
          client.readContract({
            address: chain.usdc.address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address],
          }),
        ]);

        return {
          chain,
          blockNumber,
          nativeAtomic: nativeBalance,
          usdcAtomic: usdcBalance,
          observedAt: new Date(),
          error: null,
        };
      } catch (error) {
        // One dead RPC must not erase the other chain's answer. The failure is reported as a
        // failure, with no amount substituted for it.
        return {
          chain,
          blockNumber: null,
          nativeAtomic: null,
          usdcAtomic: null,
          observedAt: new Date(),
          error: error instanceof Error ? error.message : "RPC read failed",
        };
      }
    }),
  );

  return {
    address,
    observedAt: observedAt.toISOString(),
    chains: results.map(toChainBalance),
  };
}
